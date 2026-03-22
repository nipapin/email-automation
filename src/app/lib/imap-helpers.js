import { ImapFlow } from "imapflow";

const BODY_TYPES = new Set(["text/plain", "text/html"]);
const MULTIPART_PREFIX = "multipart/";

/** Собирает text/html части и список вложений из bodyStructure (ImapFlow). */
export function findParts(node, parts = { text: null, html: null, attachments: [] }) {
  if (!node) return parts;

  if (node.childNodes) {
    for (const child of node.childNodes) {
      findParts(child, parts);
    }
    return parts;
  }

  const hasFilename =
    node.dispositionParameters?.filename || node.parameters?.name;
  const isExplicitAttachment = node.disposition === "attachment";
  const isInlineBody =
    !isExplicitAttachment &&
    !hasFilename &&
    BODY_TYPES.has(node.type) &&
    !node.type?.startsWith(MULTIPART_PREFIX);

  if (isInlineBody) {
    if (node.type === "text/plain" && !parts.text) parts.text = node.part;
    else if (node.type === "text/html" && !parts.html) parts.html = node.part;
  } else if (!node.type?.startsWith(MULTIPART_PREFIX)) {
    parts.attachments.push({
      part: node.part,
      filename: hasFilename || `attachment-${parts.attachments.length + 1}`,
      type: node.type,
      size: node.size ?? 0,
    });
  }

  return parts;
}

export function createImapClient() {
  return new ImapFlow({
    host: "imap.yandex.ru",
    port: 993,
    secure: true,
    logger: false,
    auth: {
      user: process.env.KIRILL_EMAIL,
      pass: process.env.KIRILL_APP_PASSWORD,
    },
  });
}

const DEFAULT_MAX_BYTES = 25 * 1024 * 1024;

/** @returns {Promise<{ buffer: Buffer, meta: object }>} */
export async function downloadPartBuffer(client, uid, part, options = {}) {
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;
  const { content, meta } = await client.download(String(uid), part, {
    uid: true,
    maxBytes,
  });
  const chunks = [];
  for await (const chunk of content) chunks.push(chunk);
  return { buffer: Buffer.concat(chunks), meta };
}
