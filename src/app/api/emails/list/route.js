import { NextResponse } from "next/server";
import { createImapClient } from "../../../lib/imap-helpers";
import {
  isAllowedSender,
  localDayBounds,
  messageInLocalDay,
} from "../../../lib/email-process";

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const dateStr = searchParams.get("date");
  const bounds = localDayBounds(dateStr);
  if (!bounds) {
    return NextResponse.json(
      { error: "Invalid or missing date=YYYY-MM-DD" },
      { status: 400 }
    );
  }
  const { dayStart, dayEnd } = bounds;

  const client = createImapClient();
  let lock;

  try {
    await client.connect();
    lock = await client.getMailboxLock("INBOX");

    const messages = await client.fetchAll(
      { since: dayStart },
      { uid: true, envelope: true }
    );

    const filtered = messages.filter((msg) => {
      if (!isAllowedSender(msg.envelope)) return false;
      const envDate = msg.envelope?.date;
      if (!envDate) return false;
      return messageInLocalDay(envDate, dayStart, dayEnd);
    });

    const list = filtered.map((msg) => ({
      uid: msg.uid,
      subject: msg.envelope.subject ?? "",
      date: msg.envelope.date,
      from: msg.envelope.from?.[0] ?? null,
    }));

    list.sort((a, b) => new Date(b.date) - new Date(a.date));

    return NextResponse.json(list);
  } catch (error) {
    console.error("IMAP list error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to list emails" },
      { status: 500 }
    );
  } finally {
    lock?.release();
    await client.logout();
  }
}
