import { formatAmountRu, parseAmountRu } from "./format";

/** Первая строка как в REESTR ТОИС (включая пробел перед «Сумма») */
export const TOIS_CSV_HEADER =
  "Дата письма,Дата оплаты,,Контрагент, Сумма счета,,Инженер,Проект/заказчик,Вид работ,∑ сметы,№ заявки,Примечание,,,,";

function escapeCsvField(value) {
  if (value === null || value === undefined) return "";
  const s = String(value);
  if (/[",\r\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

/**
 * Строка для экспорта из объекта row (после buildRows + правок UI).
 * uid, sender и служебные поля не входят в эталон — только 12 + 4 пустых.
 */
export function rowToToisCsvLine(row) {
  const parts = [
    escapeCsvField(row.letterDate ?? ""),
    escapeCsvField(row.paymentDate ?? ""),
    escapeCsvField(row.lineCode ?? ""),
    escapeCsvField(row.contractor ?? ""),
    escapeCsvField(formatAmountForExport(row.invoiceAmount)),
    escapeCsvField(formatAmountForExport(row.adjustedAmount)),
    escapeCsvField(row.engineer ?? ""),
    escapeCsvField(row.projectInfo ?? ""),
    escapeCsvField(row.workType ?? ""),
    escapeCsvField(formatAmountForExport(row.estimateAmount)),
    escapeCsvField(row.requestNumber ?? ""),
    escapeCsvField(row.note ?? ""),
    "",
    "",
    "",
    "",
  ];
  return parts.join(",");
}

function formatAmountForExport(raw) {
  if (raw === null || raw === undefined || raw === "") return "";
  if (typeof raw === "number") return formatAmountRu(raw);
  const n = parseAmountRu(raw);
  if (n === null) return String(raw).trim();
  return formatAmountRu(n);
}

/** Полный CSV с BOM для Excel */
export function buildToisCsv(rows) {
  const lines = [TOIS_CSV_HEADER];
  for (const row of rows) {
    lines.push(rowToToisCsvLine(row));
  }
  return "\uFEFF" + lines.join("\r\n") + "\r\n";
}
