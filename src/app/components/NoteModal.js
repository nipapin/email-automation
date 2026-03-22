"use client";

import { useEffect, useState } from "react";
import emailCss from "./EmailModal.module.css";
import css from "./NoteModal.module.css";

export default function NoteModal({ uid, text, onSave, onClose }) {
  const [draft, setDraft] = useState(text ?? "");

  useEffect(() => {
    setDraft(text ?? "");
  }, [text, uid]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") {
        onSave?.(draft);
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [draft, onSave, onClose]);

  function handleClose() {
    onSave?.(draft);
    onClose();
  }

  if (uid == null) return null;

  return (
    <div
      className={emailCss.backdrop}
      onClick={handleClose}
      role="presentation"
      style={{ zIndex: 1001 }}
    >
      <div
        className={emailCss.modal}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="note-modal-title"
      >
        <div className={emailCss.head}>
          <h2 id="note-modal-title" className={emailCss.title}>
            Примечание
          </h2>
          <button
            type="button"
            className={emailCss.close}
            onClick={handleClose}
            aria-label="Закрыть"
          >
            ×
          </button>
        </div>

        <div className={emailCss.body}>
          <textarea
            className={css.textarea}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Текст примечания…"
            rows={14}
            spellCheck
          />
        </div>
      </div>
    </div>
  );
}
