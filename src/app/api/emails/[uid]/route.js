import { NextResponse } from "next/server";
import { loadCache } from "../../../lib/cache";

export async function GET(_request, context) {
  const params = await context.params;
  const uid = params?.uid;
  if (uid == null || uid === "") {
    return NextResponse.json({ error: "uid required" }, { status: 400 });
  }

  const cache = await loadCache();
  const entry = cache[String(uid)];
  if (!entry) {
    return NextResponse.json(
      { error: "Письмо не найдено в кеше. Обновите загрузку за период." },
      { status: 404 }
    );
  }

  return NextResponse.json({
    uid: entry.uid,
    subject: entry.subject ?? "",
    from: entry.from ?? null,
    date: entry.date ?? null,
    body: entry.body ?? null,
    bodyType: entry.bodyType ?? null,
    attachments: entry.attachments ?? [],
  });
}
