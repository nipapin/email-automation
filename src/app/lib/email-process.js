import { parseEmailWithAI } from "./gemini";
import {
  findParts,
  createImapClient,
  downloadPartBuffer,
} from "./imap-helpers";
import {
  attachmentFilenameRoles,
  isImage,
  isOfficeConvertible,
} from "./mime-utils";
import { convertOfficeBufferToPdf } from "./convert-office-to-pdf";
import { refineAttachmentRolesFromPdfBuffer } from "./pdf-refine-roles";

export const ALLOWED_DOMAINS = ["to-is.ru", "fm-es.ru", "svzp.ru"];

/** Допустимые значения столбца «Вид работ» (как в учёте ТОИС). */
const WORK_TYPE_CODES = new Set(["ТО", "ДР", "доп раб", "ОДМ"]);

function hasSmetaInAttachments(attachmentPdfs, attachmentImages) {
  for (const p of attachmentPdfs ?? []) {
    if (p?.isSmeta) return true;
  }
  for (const img of attachmentImages ?? []) {
    if (img?.isSmeta) return true;
  }
  return false;
}

function normalizeWorkTypeString(raw) {
  if (raw == null || raw === "") return null;
  const t = String(raw).trim();
  if (WORK_TYPE_CODES.has(t)) return t;
  const lower = t.toLowerCase().replace(/\s+/g, " ");
  const aliases = {
    то: "ТО",
    "т.о.": "ТО",
    др: "ДР",
    "доп работы": "доп раб",
    "доп. раб.": "доп раб",
    "доп. раб": "доп раб",
    допраб: "доп раб",
    одм: "ОДМ",
  };
  if (aliases[lower]) return aliases[lower];
  return WORK_TYPE_CODES.has(t) ? t : null;
}

function hasEstimateAmount(parsed) {
  const v = parsed?.estimateAmount;
  return v != null && v !== "";
}

/**
 * Приводит workType к канону и согласует ДР/доп раб с наличием сметы (вложение [СМЕТА] и/или estimateAmount).
 */
export function refineParsedWorkType(parsed, { attachmentPdfs, attachmentImages }) {
  let workType = normalizeWorkTypeString(parsed?.workType);
  const hasSmeta = hasSmetaInAttachments(attachmentPdfs, attachmentImages);
  const hasEst = hasEstimateAmount(parsed);

  if (workType === "ДР" || workType === "доп раб") {
    if (!hasSmeta && !hasEst) workType = "доп раб";
    else if (hasSmeta || hasEst) workType = "ДР";
  }

  return { ...parsed, workType };
}

export function isAllowedSender(envelope) {
  const addr = envelope?.from?.[0]?.address ?? "";
  const domain = addr.split("@")[1]?.toLowerCase();
  return ALLOWED_DOMAINS.includes(domain);
}

export function sanitizeAttachmentsForCache(list) {
  return (list ?? []).map((a) => ({
    filename: a.filename,
    size: a.size ?? 0,
    type: a.type ?? "",
    part: a.part != null ? String(a.part) : undefined,
  }));
}

export function buildParsedFromAI(aiResult, senderName) {
  if (!aiResult) {
    return {
      contractor: null,
      invoiceAmount: null,
      paymentDate: null,
      lineCode: null,
      adjustedAmount: null,
      engineer: senderName,
      projectInfo: null,
      workType: null,
      estimateAmount: null,
      requestNumber: null,
      note: null,
    };
  }
  return {
    contractor: aiResult.contractor ?? null,
    invoiceAmount: aiResult.invoiceAmount ?? null,
    paymentDate: aiResult.paymentDate ?? null,
    lineCode: aiResult.lineCode ?? null,
    adjustedAmount: aiResult.adjustedAmount ?? null,
    engineer: aiResult.engineer ?? senderName,
    projectInfo: aiResult.projectInfo ?? null,
    workType: aiResult.workType ?? null,
    estimateAmount: aiResult.estimateAmount ?? null,
    requestNumber: aiResult.requestNumber ?? null,
    note: aiResult.note ?? null,
  };
}

const MAX_BODY_BYTES = 100_000;
const MAX_IMAGE_BYTES = 4_000_000;
const MAX_PDF_FOR_AI = 12 * 1024 * 1024;

/**
 * Полная обработка одного сообщения (тело, вложения, Gemini), запись в переданный cache-объект.
 * @param {object} client — ImapFlow-клиент
 * @param {object} msg — элемент из fetch с bodyStructure
 * @param {Record<string, object>} cache
 * @param {boolean} refresh — игнорировать fullyProcessed
 * @returns {{ email: object, cacheUpdated: boolean }}
 */
export async function processSingleMessage(client, msg, cache, refresh) {
  const cacheKey = String(msg.uid);
  const cached = cache[cacheKey];

  if (!refresh && cached?.fullyProcessed) {
    return { email: cached, cacheUpdated: false };
  }

  const parts = findParts(msg.bodyStructure);

  let body = null;
  let bodyType = null;
  const bodyPart = parts.html ?? parts.text;

  if (bodyPart) {
    try {
      const { content, meta } = await client.download(
        String(msg.uid),
        bodyPart,
        { uid: true, maxBytes: MAX_BODY_BYTES }
      );
      const chunks = [];
      for await (const chunk of content) chunks.push(chunk);
      const buf = Buffer.concat(chunks);
      body = buf.toString(meta.charset || "utf-8");
      bodyType = parts.html ? "html" : "text";
    } catch {
      /* skip */
    }
  }

  const attachmentImages = [];
  const attachmentPdfs = [];

  for (const att of parts.attachments) {
    try {
      const { buffer: buf } = await downloadPartBuffer(
        client,
        msg.uid,
        att.part
      );

      if (isImage(att.type) && buf.length <= MAX_IMAGE_BYTES) {
        attachmentImages.push({
          filename: att.filename,
          buffer: buf,
          mimeType: att.type,
          ...attachmentFilenameRoles(att.filename),
        });
        continue;
      }

      if (att.type === "application/pdf" && buf.length <= MAX_PDF_FOR_AI) {
        const roles = await refineAttachmentRolesFromPdfBuffer(
          buf,
          attachmentFilenameRoles(att.filename)
        );
        attachmentPdfs.push({
          filename: att.filename,
          buffer: buf,
          ...roles,
        });
        continue;
      }

      if (isOfficeConvertible(att.type, att.filename)) {
        const pdfBuf = await convertOfficeBufferToPdf(buf, att.filename);
        if (pdfBuf?.length && pdfBuf.length <= MAX_PDF_FOR_AI) {
          const base =
            String(att.filename).replace(/\.[^/.]+$/i, "") || "document";
          const roles = await refineAttachmentRolesFromPdfBuffer(
            pdfBuf,
            attachmentFilenameRoles(att.filename)
          );
          attachmentPdfs.push({
            filename: `${base}.pdf`,
            buffer: pdfBuf,
            ...roles,
          });
        }
      }
    } catch {
      /* skip */
    }
  }

  const senderName =
    msg.envelope.from?.[0]?.name || msg.envelope.from?.[0]?.address || null;

  const aiResult = await parseEmailWithAI({
    subject: msg.envelope.subject,
    body: body?.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim(),
    senderName,
    attachmentImages,
    attachmentPdfs,
  });

  let parsed = buildParsedFromAI(aiResult, senderName);
  parsed = refineParsedWorkType(parsed, { attachmentPdfs, attachmentImages });

  const emailData = {
    uid: msg.uid,
    subject: msg.envelope.subject,
    from: msg.envelope.from?.[0] ?? null,
    to: msg.envelope.to ?? [],
    date: msg.envelope.date,
    size: msg.size,
    body,
    bodyType,
    attachments: sanitizeAttachmentsForCache(parts.attachments),
    parsed,
    fullyProcessed: true,
  };

  cache[cacheKey] = emailData;
  return { email: emailData, cacheUpdated: true };
}

/** YYYY-MM-DD — границы календарного дня в локальной TZ процесса Node */
export function localDayBounds(dateStr) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dateStr ?? "").trim());
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]) - 1;
  const d = Number(m[3]);
  const dayStart = new Date(y, mo, d, 0, 0, 0, 0);
  const dayEnd = new Date(y, mo, d, 23, 59, 59, 999);
  return { dayStart, dayEnd };
}

export function messageInLocalDay(envelopeDate, dayStart, dayEnd) {
  const t = new Date(envelopeDate).getTime();
  return t >= dayStart.getTime() && t <= dayEnd.getTime();
}
