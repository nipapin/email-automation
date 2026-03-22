export function formatDate(dateStr) {
  const d = new Date(dateStr);
  return d.toLocaleString("ru-RU", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const MONTH_SHORT = [
  "янв.",
  "февр.",
  "мар.",
  "апр.",
  "мая",
  "июн.",
  "июл.",
  "авг.",
  "сен.",
  "окт.",
  "ноя.",
  "дек.",
];

/** Как в эталоне ТОИС: "10-янв." */
export function formatLetterDateRu(dateStr) {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return "";
  const day = d.getDate();
  const mon = MONTH_SHORT[d.getMonth()] ?? "";
  return `${day}-${mon}`;
}

/** Число в строку "3 869,00" (неразрывный пробел) */
export function formatAmountRu(value) {
  if (value === null || value === undefined || value === "") return "";
  const n = typeof value === "number" ? value : parseAmountRu(String(value));
  if (n === null || Number.isNaN(n)) return "";
  const [intPart, frac] = n.toFixed(2).split(".");
  const withSpaces = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, "\u00a0");
  return `${withSpaces},${frac}`;
}

/** Парсит сумму из строки вида "3 869,00" или "3869.00" */
export function parseAmountRu(s) {
  if (s === null || s === undefined) return null;
  const t = String(s)
    .trim()
    .replace(/\u00a0/g, " ")
    .replace(/\s/g, "")
    .replace(",", ".");
  if (t === "" || t === "—") return null;
  const n = parseFloat(t);
  return Number.isNaN(n) ? null : n;
}

export function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function senderLabel(from) {
  if (!from) return "Unknown";
  if (from.name) return from.name;
  return from.address ?? "Unknown";
}
