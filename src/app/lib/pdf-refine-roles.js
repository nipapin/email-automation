import { PDFParse } from "pdf-parse";

/** Символов текста для поиска ключевых слов (первые страницы). */
const MAX_TEXT_CHARS = 80_000;

/** Сколько первых страниц PDF читать при «слепом» имени файла. */
const SNIFF_FIRST_PAGES = 5;

function finalizeRoles(isSchet, isSmeta) {
  const isOther = !isSchet && !isSmeta;
  return { isSchet, isSmeta, isOther };
}

/**
 * Если по имени файла роль не определена ([прочее]), читает текст первых страниц PDF
 * и ищет «счет»/«счёт»/«смета» (как у типичных счетов/смет с системным именем temp….pdf).
 * @param {Buffer} buffer
 * @param {{ isSchet: boolean, isSmeta: boolean, isOther?: boolean }} baseRoles — из имени файла
 */
export async function refineAttachmentRolesFromPdfBuffer(buffer, baseRoles) {
  let { isSchet, isSmeta } = baseRoles;
  if (isSchet || isSmeta) {
    return finalizeRoles(isSchet, isSmeta);
  }
  if (!buffer?.length) {
    return finalizeRoles(false, false);
  }

  let parser;
  try {
    parser = new PDFParse({ data: buffer });
    const result = await parser.getText({ first: SNIFF_FIRST_PAGES });
    const text = (result?.text ?? "").slice(0, MAX_TEXT_CHARS).toLowerCase();
    if (text.includes("счет") || text.includes("счёт")) isSchet = true;
    if (text.includes("смета")) isSmeta = true;
  } catch (err) {
    console.warn("[pdf-refine-roles]", err?.message || err);
  } finally {
    try {
      await parser?.destroy?.();
    } catch {
      /* ignore */
    }
  }

  return finalizeRoles(isSchet, isSmeta);
}
