"use client";

import { useEffect, useRef, useState } from "react";
import EmailModal from "./EmailModal";
import NoteModal from "./NoteModal";
import { formatAmountRu, formatLetterDateRu } from "../lib/format";
import css from "./SummaryTable.module.css";

function todayIsoLocal() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function buildRowsFromEmails(emails) {
  return emails.map((e) => ({
    uid: e.uid,
    date: e.date,
    letterDate: formatLetterDateRu(e.date),
    paymentDate:
      e.parsed?.paymentDate != null ? String(e.parsed.paymentDate) : "",
    lineCode: e.parsed?.lineCode != null ? String(e.parsed.lineCode) : "",
    contractor: e.parsed?.contractor ?? "",
    invoiceAmount:
      e.parsed?.invoiceAmount != null && e.parsed?.invoiceAmount !== ""
        ? formatAmountRu(e.parsed.invoiceAmount)
        : "",
    adjustedAmount:
      e.parsed?.adjustedAmount != null && e.parsed?.adjustedAmount !== ""
        ? formatAmountRu(e.parsed.adjustedAmount)
        : "",
    engineer: e.parsed?.engineer ?? "",
    projectInfo: e.parsed?.projectInfo ?? "",
    workType: e.parsed?.workType ?? "",
    estimateAmount:
      e.parsed?.estimateAmount != null && e.parsed?.estimateAmount !== ""
        ? formatAmountRu(e.parsed.estimateAmount)
        : "",
    requestNumber:
      e.parsed?.requestNumber != null ? String(e.parsed.requestNumber) : "",
    note: e.parsed?.note ?? "",
  }));
}

/** Строка-заглушка после GET /api/emails/list */
export function buildPlaceholderRow(item) {
  return {
    uid: item.uid,
    date: item.date,
    letterDate: formatLetterDateRu(item.date),
    paymentDate: "",
    lineCode: "",
    contractor: "",
    invoiceAmount: "",
    adjustedAmount: "",
    engineer: "",
    projectInfo: "",
    workType: "",
    estimateAmount: "",
    requestNumber: "",
    note: "",
    status: "pending",
  };
}

const COLUMNS = [
  { key: "link", label: "Письмо", kind: "link" },
  { key: "letterDate", label: "Дата письма", kind: "readonly" },
  { key: "paymentDate", label: "Дата оплаты", kind: "editable" },
  { key: "lineCode", label: "Код", kind: "editable" },
  { key: "contractor", label: "Контрагент", kind: "editable" },
  { key: "invoiceAmount", label: "Сумма счета", kind: "editable", amount: true },
  { key: "adjustedAmount", label: "Сумма (2)", kind: "editable", amount: true },
  { key: "engineer", label: "Инженер", kind: "editable" },
  { key: "projectInfo", label: "Проект/заказчик", kind: "editable", wide: true },
  { key: "workType", label: "Вид работ", kind: "editable" },
  { key: "estimateAmount", label: "∑ сметы", kind: "editable", amount: true },
  { key: "requestNumber", label: "№ заявки", kind: "editable" },
  { key: "note", label: "Прим.", kind: "note" },
];

async function runProcessLoop({
  rows,
  refresh,
  signal,
  gen,
  genRef,
  setLocalRows,
  setQueueProgress,
  setQueueRunning,
}) {
  setQueueRunning(true);
  setQueueProgress({ done: 0, total: rows.length });
  try {
    for (let i = 0; i < rows.length; i++) {
      if (signal.aborted || gen !== genRef.current) return;
      const uid = rows[i].uid;
      setLocalRows((prev) =>
        prev.map((r) =>
          r.uid === uid ? { ...r, status: "processing" } : r
        )
      );
      try {
        const res = await fetch("/api/emails/process-one", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ uid, refresh }),
          signal,
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error || res.statusText);
        }
        const { email } = await res.json();
        if (gen !== genRef.current) return;
        const filled = { ...buildRowsFromEmails([email])[0], status: "done" };
        setLocalRows((prev) =>
          prev.map((r) => (r.uid === uid ? filled : r))
        );
      } catch (e) {
        if (e.name === "AbortError" || signal.aborted) return;
        if (gen !== genRef.current) return;
        setLocalRows((prev) =>
          prev.map((r) =>
            r.uid === uid ? { ...r, status: "error" } : r
          )
        );
      }
      setQueueProgress((p) => ({
        ...p,
        done: Math.min((p.done ?? 0) + 1, p.total),
      }));
    }
  } finally {
    // Снимаем флаг только если эта же генерация всё ещё актуальна (не уступили место новой дате / пересчёту)
    if (gen === genRef.current) setQueueRunning(false);
  }
}

function EditableCell({ value, onChange }) {
  const ref = useRef(null);
  const display = value === "" || value == null ? "\u2014" : String(value);
  const isEmpty = value === "" || value == null;

  return (
    <span
      ref={ref}
      className={`${css.editable} ${isEmpty ? css.cellEmpty : ""}`}
      contentEditable
      suppressContentEditableWarning
      onBlur={() => {
        const text = ref.current?.textContent?.trim() ?? "";
        const normalized = text === "\u2014" ? "" : text;
        if (normalized !== String(value ?? "")) onChange(normalized);
      }}
    >
      {display}
    </span>
  );
}

export default function SummaryTable() {
  const [selectedDate, setSelectedDate] = useState(todayIsoLocal);
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState(null);
  const [localRows, setLocalRows] = useState([]);
  const [queueProgress, setQueueProgress] = useState({ done: 0, total: 0 });
  const [queueRunning, setQueueRunning] = useState(false);
  const [modalUid, setModalUid] = useState(null);
  const [noteModalUid, setNoteModalUid] = useState(null);

  const genRef = useRef(0);
  const activeQueueAcRef = useRef(null);

  useEffect(() => {
    genRef.current += 1;
    const myGen = genRef.current;
    activeQueueAcRef.current?.abort();
    const ac = new AbortController();
    activeQueueAcRef.current = ac;

    (async () => {
      setListLoading(true);
      setListError(null);
      try {
        const res = await fetch(
          `/api/emails/list?date=${encodeURIComponent(selectedDate)}`,
          { signal: ac.signal }
        );
        if (!res.ok) {
          const e = await res.json().catch(() => ({}));
          throw new Error(e.error || res.statusText);
        }
        const list = await res.json();
        if (myGen !== genRef.current) return;
        const placeholders = list.map(buildPlaceholderRow);
        setLocalRows(placeholders);
        setListLoading(false);
        await runProcessLoop({
          rows: placeholders,
          refresh: false,
          signal: ac.signal,
          gen: myGen,
          genRef,
          setLocalRows,
          setQueueProgress,
          setQueueRunning,
        });
      } catch (e) {
        if (e.name === "AbortError") return;
        if (myGen !== genRef.current) return;
        setListError(e.message || "Unknown error");
        setLocalRows([]);
        setListLoading(false);
      }
    })();

    return () => {
      ac.abort();
    };
  }, [selectedDate]);

  const updateCell = (uid, key, value) => {
    setLocalRows((prev) =>
      prev.map((r) => (r.uid === uid ? { ...r, [key]: value } : r))
    );
  };

  const handleExport = () => {
    const form = document.createElement("form");
    form.method = "POST";
    form.action = "/api/export";
    form.style.display = "none";
    const input = document.createElement("input");
    input.name = "rows";
    input.value = JSON.stringify(localRows);
    form.appendChild(input);
    document.body.appendChild(form);
    form.submit();
    document.body.removeChild(form);
  };

  const handleRecalculateAI = () => {
    if (listLoading || localRows.length === 0 || queueRunning) return;
    genRef.current += 1;
    const myGen = genRef.current;
    activeQueueAcRef.current?.abort();
    const ac = new AbortController();
    activeQueueAcRef.current = ac;
    const snapshot = localRows.map((r) => ({ uid: r.uid, date: r.date }));
    const placeholders = snapshot.map(buildPlaceholderRow);
    setLocalRows(placeholders);
    void runProcessLoop({
      rows: placeholders,
      refresh: true,
      signal: ac.signal,
      gen: myGen,
      genRef,
      setLocalRows,
      setQueueProgress,
      setQueueRunning,
    });
  };

  const dateLabel = (() => {
    const [y, m, d] = selectedDate.split("-").map(Number);
    if (!y) return selectedDate;
    return new Date(y, m - 1, d).toLocaleDateString("ru-RU", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  })();

  const subtitleParts = [];
  if (listLoading) subtitleParts.push("Загрузка списка…");
  else {
    subtitleParts.push(`${localRows.length} писем · ${dateLabel}`);
    if (localRows.length > 0) {
      subtitleParts.push(
        `Обработано ${queueProgress.done} из ${queueProgress.total}`
      );
      if (queueRunning) subtitleParts.push("идёт очередь…");
    }
  }

  return (
    <main className={css.main}>
      <header className={css.header}>
        <div className={css.headerTop}>
          <h1 className={css.title}>Сводная таблица</h1>
          <div className={css.actions}>
            <label className={css.dateLabel}>
              <span className={css.dateLabelText}>День</span>
              <input
                type="date"
                className={css.dateInput}
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                disabled={listLoading || queueRunning}
              />
            </label>
            <button
              type="button"
              className={css.refreshBtn}
              onClick={handleRecalculateAI}
              disabled={listLoading || queueRunning || localRows.length === 0}
              title="Пересчитать ИИ для всех писем выбранного дня (повторная загрузка и Gemini)"
            >
              Пересчитать ИИ
            </button>
            <button
              type="button"
              className={css.exportBtn}
              onClick={handleExport}
              disabled={listLoading || localRows.length === 0}
            >
              Скачать CSV
            </button>
          </div>
        </div>
        <span className={css.subtitle}>{subtitleParts.join(" · ")}</span>
        {localRows.length > 0 && queueProgress.total > 0 && (
          <div
            className={css.progressBar}
            role="progressbar"
            aria-valuenow={queueProgress.done}
            aria-valuemin={0}
            aria-valuemax={queueProgress.total}
          >
            <div
              className={css.progressBarFill}
              style={{
                width: `${Math.round(
                  (100 * queueProgress.done) / queueProgress.total
                )}%`,
              }}
            />
          </div>
        )}
      </header>

      {listError && (
        <div className={css.error}>
          <strong>Ошибка:</strong> {listError}
        </div>
      )}

      {!listLoading && !listError && localRows.length === 0 && (
        <p className={css.status}>Нет писем за выбранный день</p>
      )}

      {!listError && localRows.length > 0 && (
        <div className={css.tableWrap}>
          <table className={css.table}>
            <thead>
              <tr>
                {COLUMNS.map((col) => (
                  <th key={col.key}>{col.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {localRows.map((row) => (
                <tr
                  key={row.uid}
                  className={
                    row.status === "error"
                      ? css.rowError
                      : row.status === "processing"
                        ? css.rowProcessing
                        : undefined
                  }
                >
                  {COLUMNS.map((col) => {
                    if (col.kind === "link") {
                      const canOpen = row.status === "done";
                      return (
                        <td key={col.key} className={css.linkCell}>
                          <button
                            type="button"
                            className={css.emailLink}
                            disabled={!canOpen}
                            title={
                              canOpen
                                ? "Открыть письмо"
                                : "Доступно после обработки письма"
                            }
                            onClick={() => canOpen && setModalUid(row.uid)}
                          >
                            Открыть
                          </button>
                        </td>
                      );
                    }
                    if (col.kind === "readonly") {
                      return (
                        <td key={col.key} className={css.readonlyCell}>
                          {row.letterDate}
                        </td>
                      );
                    }
                    if (col.kind === "note") {
                      const hasNote =
                        row.note != null && String(row.note).trim() !== "";
                      return (
                        <td key={col.key} className={css.linkCell}>
                          <button
                            type="button"
                            className={css.noteLink}
                            onClick={() => setNoteModalUid(row.uid)}
                            title="Открыть и редактировать примечание"
                          >
                            {hasNote ? "Открыть" : "—"}
                          </button>
                        </td>
                      );
                    }
                    const isAmount = col.amount;
                    const tdClass = [
                      isAmount ? css.amountCell : "",
                      col.key === "projectInfo" ? css.projectCell : "",
                    ]
                      .filter(Boolean)
                      .join(" ");
                    return (
                      <td key={col.key} className={tdClass || undefined}>
                        <EditableCell
                          value={row[col.key]}
                          onChange={(v) => updateCell(row.uid, col.key, v)}
                        />
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <EmailModal uid={modalUid} onClose={() => setModalUid(null)} />
      <NoteModal
        uid={noteModalUid}
        text={
          noteModalUid == null
            ? ""
            : localRows.find((r) => r.uid === noteModalUid)?.note ?? ""
        }
        onSave={(next) => {
          if (noteModalUid != null) updateCell(noteModalUid, "note", next);
        }}
        onClose={() => setNoteModalUid(null)}
      />
    </main>
  );
}
