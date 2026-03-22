"use client";

import { useEffect, useMemo, useState } from "react";
import { formatDate, formatSize, senderLabel } from "../lib/format";
import css from "./EmailModal.module.css";

function isPreviewableMime(mime) {
  if (!mime) return false;
  const m = mime.toLowerCase();
  if (m.startsWith("image/")) return true;
  if (m === "application/pdf" || m.includes("pdf")) return true;
  return false;
}

function isOfficeDoc(mime) {
  if (!mime) return false;
  const m = mime.toLowerCase();
  return (
    m.includes("spreadsheet") ||
    m.includes("excel") ||
    m.includes("word") ||
    m.includes("officedocument") ||
    m.endsWith("sheet") ||
    m.includes("msword")
  );
}

export default function EmailModal({ uid, onClose }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (uid == null) return;
    setLoading(true);
    setError(null);
    setData(null);

    fetch(`/api/emails/${encodeURIComponent(String(uid))}`)
      .then((res) => {
        if (!res.ok) return res.json().then((e) => Promise.reject(e));
        return res.json();
      })
      .then(setData)
      .catch((e) => setError(e.error || e.message || "Ошибка загрузки"))
      .finally(() => setLoading(false));
  }, [uid]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const attachmentBase = useMemo(() => {
    if (!data?.uid) return null;
    return `/api/emails/${encodeURIComponent(String(data.uid))}/attachment`;
  }, [data?.uid]);

  if (uid == null) return null;

  return (
    <div className={css.backdrop} onClick={onClose} role="presentation">
      <div
        className={css.modal}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="email-modal-title"
      >
        <div className={css.head}>
          <h2 id="email-modal-title" className={css.title}>
            Письмо
          </h2>
          <button type="button" className={css.close} onClick={onClose} aria-label="Закрыть">
            ×
          </button>
        </div>

        <div className={css.body}>
          {loading && <p className={css.muted}>Загрузка...</p>}
          {error && (
            <div className={css.err}>
              <strong>Ошибка:</strong> {error}
            </div>
          )}
          {!loading && !error && data && (
            <>
              <div className={css.meta}>
                <div>
                  <span className={css.label}>От</span> {senderLabel(data.from)}
                  {data.from?.address && (
                    <span className={css.addr}> {data.from.address}</span>
                  )}
                </div>
                <div>
                  <span className={css.label}>Дата</span>{" "}
                  {data.date ? formatDate(data.date) : "—"}
                </div>
                <div className={css.subject}>
                  <span className={css.label}>Тема</span> {data.subject || "(без темы)"}
                </div>
              </div>

              {data.attachments?.length > 0 && attachmentBase && (
                <div className={css.att}>
                  <div className={css.attTitle}>Вложения</div>
                  <ul className={css.attList}>
                    {data.attachments.map((a, i) => {
                      const previewUrl = `${attachmentBase}/${i}`;
                      const downloadUrl = `${attachmentBase}/${i}?download=1`;
                      const mime = a.type || "";
                      const showPreview = isPreviewableMime(mime);
                      const office = isOfficeDoc(mime);

                      return (
                        <li key={i} className={css.attItem}>
                          <div className={css.attRow}>
                            <span className={css.attName}>{a.filename}</span>
                            <span className={css.muted}>
                              {formatSize(a.size)} · {mime || "—"}
                            </span>
                            <div className={css.attLinks}>
                              <a
                                href={previewUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className={css.link}
                              >
                                Открыть в новой вкладке
                              </a>
                              <a href={downloadUrl} className={css.link} download>
                                Скачать
                              </a>
                            </div>
                          </div>
                          {office && (
                            <p className={css.officeHint}>
                              Для просмотра Excel/Word скачайте файл и откройте локально.
                            </p>
                          )}
                          {showPreview && (
                            <div className={css.previewWrap}>
                              {mime.toLowerCase().startsWith("image/") ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img
                                  src={previewUrl}
                                  alt={a.filename}
                                  className={css.previewImg}
                                />
                              ) : (
                                <iframe
                                  title={a.filename}
                                  src={previewUrl}
                                  className={css.previewFrame}
                                />
                              )}
                            </div>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}

              {data.body ? (
                data.bodyType === "html" ? (
                  <div
                    className={css.html}
                    dangerouslySetInnerHTML={{ __html: data.body }}
                  />
                ) : (
                  <pre className={css.text}>{data.body}</pre>
                )
              ) : (
                <p className={css.muted}>Тело письма недоступно в кеше.</p>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
