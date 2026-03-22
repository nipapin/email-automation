import {
  createImapClient,
  downloadPartBuffer,
  findParts,
} from "../../../../../lib/imap-helpers";
import { loadCache, saveCache } from "../../../../../lib/cache";

const MAX_BYTES = 25 * 1024 * 1024;

function sanitizeAttachmentMeta(raw, fallback) {
  return {
    filename: raw.filename ?? fallback.filename ?? "file",
    size: raw.size ?? fallback.size ?? 0,
    type: raw.type ?? fallback.type ?? "application/octet-stream",
    part: raw.part != null ? String(raw.part) : undefined,
  };
}

/**
 * Достаёт IMAP part id для вложения: из кеша или повторным разбором bodyStructure.
 */
async function resolvePartId(cache, uidStr, index) {
  const entry = cache[uidStr];
  if (!entry?.attachments?.[index]) return null;

  const att = entry.attachments[index];
  if (att.part) return att.part;

  const client = createImapClient();
  let lock;
  try {
    await client.connect();
    lock = await client.getMailboxLock("INBOX");

    const msg = await client.fetchOne(
      String(uidStr),
      { uid: true, bodyStructure: true },
      { uid: true }
    );
    if (!msg?.bodyStructure) return null;

    const parts = findParts(msg.bodyStructure);
    const list = parts.attachments;
    if (index < 0 || index >= list.length) return null;

    const resolved = list[index];
    entry.attachments[index] = sanitizeAttachmentMeta(
      { ...entry.attachments[index], part: resolved.part },
      resolved
    );
    cache[uidStr] = entry;
    await saveCache(cache);

    return resolved.part;
  } finally {
    lock?.release();
    await client.logout();
  }
}

export async function GET(request, context) {
  const params = await context.params;
  const uidStr = params?.uid != null ? String(params.uid) : "";
  const indexRaw = params?.index;
  const index =
    typeof indexRaw === "string"
      ? parseInt(indexRaw, 10)
      : Number(indexRaw);

  const { searchParams } = new URL(request.url);
  const forceDownload = searchParams.get("download") === "1";

  if (!uidStr || Number.isNaN(index) || index < 0) {
    return new Response("Bad request", { status: 400 });
  }

  const cache = await loadCache();
  const entry = cache[uidStr];
  if (!entry) {
    return new Response("Not found", { status: 404 });
  }

  const attachments = entry.attachments ?? [];
  if (index >= attachments.length) {
    return new Response("Not found", { status: 404 });
  }

  let partId = attachments[index].part ?? (await resolvePartId(cache, uidStr, index));
  if (!partId) {
    return new Response("Вложение недоступно. Выполните «Пересчитать ИИ».", {
      status: 404,
    });
  }

  const attMeta = entry.attachments[index];
  const client = createImapClient();
  let lock;
  try {
    await client.connect();
    lock = await client.getMailboxLock("INBOX");

    const { buffer, meta } = await downloadPartBuffer(
      client,
      uidStr,
      partId,
      { maxBytes: MAX_BYTES }
    );

    const mime =
      meta?.contentType?.split(";")[0]?.trim() ||
      attMeta.type ||
      "application/octet-stream";

    const filename = attMeta.filename || "attachment";
    const encoded = encodeURIComponent(filename);

    const disposition = forceDownload ? "attachment" : "inline";

    return new Response(new Uint8Array(buffer), {
      headers: {
        "Content-Type": mime,
        "Content-Disposition": `${disposition}; filename*=UTF-8''${encoded}`,
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch (e) {
    console.error("Attachment download:", e);
    return new Response(e.message || "Download failed", { status: 500 });
  } finally {
    lock?.release();
    await client.logout();
  }
}
