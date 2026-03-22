"use client";

import css from "../page.module.css";

const PERIODS = [
  { value: 1, label: "1 час" },
  { value: 3, label: "3 часа" },
  { value: 6, label: "6 часов" },
  { value: 12, label: "12 часов" },
  { value: 24, label: "24 часа" },
  { value: 72, label: "3 дня" },
  { value: 168, label: "Неделя" },
];

export { PERIODS };

export default function PeriodSelector({ value, onChange }) {
  return (
    <div className={css.periodSelector}>
      {PERIODS.map((p) => (
        <button
          key={p.value}
          onClick={() => onChange(p.value)}
          className={`${css.periodBtn} ${p.value === value ? css.periodBtnActive : ""}`}
        >
          {p.label}
        </button>
      ))}
    </div>
  );
}
