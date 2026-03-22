/** Проверка image/* для вложений (Gemini multimodal). */
export function isImage(mimeType) {
  return mimeType?.startsWith("image/") ?? false;
}

/** В имени файла есть «счет»/«счёт» — источник сумм счёта (и без НДС). */
export function isSchetInFilename(filename) {
  const n = String(filename || "").toLowerCase();
  return n.includes("счет") || n.includes("счёт");
}

/** В имени файла есть «смета» — источник суммы сметы. */
export function isSmetaInFilename(filename) {
  return String(filename || "").toLowerCase().includes("смета");
}

/**
 * Роли вложения по имени: счёт / смета / прочее (ни того ни другого).
 * Файл может попасть и в счёт, и в смету, если в имени есть оба слова.
 */
export function attachmentFilenameRoles(filename) {
  const isSchet = isSchetInFilename(filename);
  const isSmeta = isSmetaInFilename(filename);
  const isOther = !isSchet && !isSmeta;
  return { isSchet, isSmeta, isOther };
}

const OFFICE_EXT = new Set([
  ".doc",
  ".docx",
  ".xls",
  ".xlsx",
  ".odt",
  ".ods",
]);

const OFFICE_MIME = new Set([
  "application/msword",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.oasis.opendocument.text",
  "application/vnd.oasis.opendocument.spreadsheet",
]);

/**
 * Word/Excel/OpenDocument — конвертация в PDF через LibreOffice перед Gemini.
 */
export function isOfficeConvertible(mimeType, filename) {
  if (!filename) return false;
  const ext = filename.toLowerCase().match(/\.[^.]+$/)?.[0];
  if (ext && OFFICE_EXT.has(ext)) return true;
  if (mimeType && OFFICE_MIME.has(mimeType)) return true;
  return false;
}
