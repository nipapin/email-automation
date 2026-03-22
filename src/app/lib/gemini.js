import { GoogleGenAI } from "@google/genai";

const SYSTEM_PROMPT = `Ты — помощник по обработке писем от инженеров сервисной компании.
Из темы письма, текста и вложений (PDF и изображения) извлеки данные для сводной таблицы (как в учёте ТОИС).

**Роли вложений** (список с пометками дан в пользовательском сообщении):
- **[СЧЁТ]** — счёт-фактура/счёт на оплату: источник контрагента и сумм счёта.
- **[СМЕТА]** — смета: только сумма сметы.
- **[прочее]** — вложение не отнесено к счёту и не к смете (не использовать для contractor и сумм по счёту/смете).

Верни ТОЛЬКО валидный JSON-объект без markdown-обёрток, с полями:

- "contractor" — **ТОЛЬКО** из вложений **[СЧЁТ]**. Ищи **«Получатель»**, «Получатель платежа», **«Заказчик»**, «Покупатель», «Плательщик», «Поставщик», «Исполнитель», «Продавец». Не подставляй отправителя e-mail. Не брать контрагента из [СМЕТА], [прочее] и не выдумывать из темы письма, если есть требование опереться на счёт. Если нет ни одного вложения [СЧЁТ] — null. Строка или null.
- "invoiceAmount" — **ТОЛЬКО** из **[СЧЁТ]**: сумма к оплате / с НДС (итог). Ищи **«Сумма к оплате»**, **«Всего к оплате»**, **«К оплате»**; если нет — **«Итого с НДС»**, **«Сумма с НДС»**, **«Итого»**, **«Всего»** (полная сумма к оплате). Не брать из [СМЕТА] и [прочее]. Без файла [СЧЁТ] — null. Число или null.
- "paymentDate" — дата оплаты или срок из письма или документов (строка как в источнике, или DD.MM.YYYY), иначе null.
- "lineCode" — код строки учёта, если явно виден; иначе null.
- "adjustedAmount" — **ТОЛЬКО** из **[СЧЁТ]** (те же документы, что для invoiceAmount): сумма **без НДС** — **«Итого без НДС»**, **«Без НДС»**, **«Сумма без НДС»** и т.п. Не путать с invoiceAmount. Если нет [СЧЁТ] или нет отдельной строки без НДС — null. Число или null.
- "projectInfo" — проект / объект: город, ТЦ, адрес. Строка или null.
- "workType" — **строго одно** из допустимых значений ниже (точная строка: регистр как указано). Если по письму и вложениям однозначно не классифицируется — null.
- "estimateAmount" — **ТОЛЬКО** из **[СМЕТА]**. Итоговая сумма сметы. Если нет вложения [СМЕТА] — null. Не брать из [СЧЁТ] и [прочее]. Число или null.
- "requestNumber" — номер заявки или сметы (строка или null).
- "note" — примечание из письма или документов, иначе null.

**Вид работ (workType)** — только эти коды:
- **ТО** — техническое обслуживание по периоду: месяц, квартал, полугодие (абонентское ТО, «ТО за …», плановое обслуживание объекта за период). Не путать с разовой заявкой.
- **ДР** — работы по заявке, когда к оплате идёт счёт **вместе со сметой**: есть вложение **[СМЕТА]** и/или в письме явно «смета прилагается», согласованная смета.
- **доп раб** — те же **работы по заявке**, что и у ДР, но **без сметы**: отдельного вложения **[СМЕТА]** нет и смета в письме не оформлена как приложение к этой оплате.
- **ОДМ** — обеспечение **дополнительными материалами**: в **[СЧЁТ]** в основном позиции по материалам/комплектующим, поставка материалов, не монтажные/сервисные работы как главная суть.

Приоритет при неоднозначности: сначала отличай **ТО** (период) от заявочных работ; среди заявочных — по наличию **[СМЕТА]** выбирай **ДР** или **доп раб**; **ОДМ** — если суть счёта именно материалы, а не типовое ТО и не ремонт/монтаж по заявке как основной контекст.

Правила:
- Колонка «Инженер» в таблице заполняется из отправителя письма на сервере — поле **engineer** в JSON **не включай** (если включишь, оно будет проигнорировано).
- **contractor**, **invoiceAmount**, **adjustedAmount** — только **[СЧЁТ]**. **estimateAmount** — только **[СМЕТА]**. Не смешивать счёт и смету.
- Если данных нет — null.
- Суммы — числа без валюты.
- Не выдумывай.
- Про ООО «ТОИС» и «Рокет Ворк»: если в **документе [СЧЁТ]** несколько организаций и есть ТОИС/Рокет Ворк, в contractor укажи **другого** контрагента по оплате. contractor = null только если в [СЧЁТ] нет иного наименования кроме ТОИС/Рокет Ворк.`;

function formatRoleTags(roles) {
  if (!roles) return "[прочее]";
  const tags = [];
  if (roles.isSchet) tags.push("[СЧЁТ]");
  if (roles.isSmeta) tags.push("[СМЕТА]");
  if (roles.isOther) tags.push("[прочее]");
  return tags.length ? tags.join(" ") : "[прочее]";
}

/** Строка списка: теги и имя файла (для однозначной привязки сумм). */
function formatAttachmentLine(item) {
  return `${formatRoleTags(item)} ${item.filename}`;
}

export async function parseEmailWithAI({
  subject,
  body,
  senderName,
  attachmentImages = [],
  attachmentPdfs = [],
}) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.warn("GEMINI_API_KEY not set, skipping AI parsing");
    return null;
  }

  const ai = new GoogleGenAI({ apiKey });

  let userMessage = "";
  if (subject) userMessage += `Тема письма: ${subject}\n`;
  if (senderName) userMessage += `Отправитель письма (не путать с инженером из счёта): ${senderName}\n`;
  if (body) userMessage += `\nТело письма:\n${body.slice(0, 5000)}\n`;

  if (attachmentPdfs?.length) {
    userMessage +=
      "\nPDF-вложения (роли [СЧЁТ]/[СМЕТА]/[прочее] по имени файла и при «слепом» имени — по тексту PDF; см. системную инструкцию):\n";
    for (const p of attachmentPdfs) {
      userMessage += `${formatAttachmentLine(p)}\n`;
    }
  }

  if (attachmentImages?.length) {
    userMessage +=
      "\nИзображения-вложения (роль по имени файла):\n";
    for (const img of attachmentImages) {
      userMessage += `${formatAttachmentLine(img)}\n`;
    }
  }

  const parts = [{ text: userMessage }];

  for (const pdf of attachmentPdfs) {
    parts.push({
      inlineData: {
        mimeType: "application/pdf",
        data: pdf.buffer.toString("base64"),
      },
    });
  }

  for (const img of attachmentImages ?? []) {
    parts.push({
      inlineData: {
        mimeType: img.mimeType,
        data: img.buffer.toString("base64"),
      },
    });
  }

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [{ role: "user", parts }],
      config: {
        systemInstruction: SYSTEM_PROMPT,
        temperature: 0.1,
      },
    });

    const text = response.text?.trim();
    if (!text) return null;

    const cleaned = text
      .replace(/^```json\s*/i, "")
      .replace(/```\s*$/, "")
      .trim();
    return JSON.parse(cleaned);
  } catch (err) {
    console.error("Gemini parsing error:", err.message);
    return null;
  }
}
