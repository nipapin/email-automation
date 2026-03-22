This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Почта и таблица

- **День**: в интерфейсе выбирается календарная дата (`YYYY-MM-DD`). Границы дня считаются в **локальном часовом поясе процесса Node** (на VPS задайте `TZ`, если нужен конкретный пояс).
- **Список**: быстрый запрос `GET /api/emails/list?date=...` — только метаданные (uid, тема, дата, отправитель), без тел писем и без ИИ.
- **Очередь**: после загрузки списка клиент **по одному** вызывает `POST /api/emails/process-one` с `{ uid, refresh? }` и обновляет строку таблицы после каждого ответа. Прогресс: «N из M» и полоска.
- **Пересчитать ИИ**: повторная обработка всех писем выбранного дня с `refresh: true` (как раньше `?refresh=1`).
- **Модалка «Письмо»**: кнопка «Открыть» активна только у строк со статусом **готово** (письмо есть в кеше с телом/вложениями).
- **Имена файлов, текст PDF и ИИ** (без учёта регистра в имени):
  - в названии есть **«счет»** или **«счёт»** → вложение **[СЧЁТ]**; оттуда же **контрагент**, **«Сумма счета»** (к оплате / с НДС), **«Сумма (2)»** (без НДС, если есть в документе);
  - в названии есть **«смета»** → **[СМЕТА]**; оттуда только **«∑ сметы»**;
  - если в имени нет этих слов (например `temp….pdf`), сервер читает **текст первых страниц PDF** и при нахождении «счет»/«счёт»/«смета» назначает ту же роль; у сканов без текстового слоя роль может не определиться.

Старый батч `GET /api/emails?hours=…` удалён; для отладки используйте `list` + `process-one`.

## LibreOffice (конвертация Word/Excel → PDF для Gemini)

Для конвертации вложений Word/Excel в PDF перед отправкой в Gemini нужен **LibreOffice**. Без него конвертация не выполняется (поля ИИ по таким вложениям могут остаться пустыми).

### Ubuntu (VPS / Linux)

```bash
sudo apt update && sudo apt install -y libreoffice
libreoffice --version
```

В `.env` при необходимости:

```env
LIBREOFFICE_PATH=/usr/bin/libreoffice
```

### Windows (локальная разработка)

1. Установите [LibreOffice для Windows](https://www.libreoffice.org/download/download/).
2. В `.env` укажите полный путь к **`soffice.exe`** (именно он, не `libreoffice` из PATH — в Windows команда часто недоступна):

```env
LIBREOFFICE_PATH=C:\Program Files\LibreOffice\program\soffice.exe
```

Путь может отличаться (другой диск или версия) — проверьте в проводнике папку `LibreOffice\program\`.

3. Перезапустите `npm run dev`.

Проверка в PowerShell:

```powershell
& "C:\Program Files\LibreOffice\program\soffice.exe" --version
```

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.js`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
