import { NextResponse } from "next/server";
import { loadCache, saveCache } from "../../../lib/cache";
import { createImapClient } from "../../../lib/imap-helpers";
import {
  isAllowedSender,
  processSingleMessage,
} from "../../../lib/email-process";

export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const uid = body?.uid;
  const refresh = Boolean(body?.refresh);

  if (uid == null || Number.isNaN(Number(uid))) {
    return NextResponse.json(
      { error: "Body must include numeric uid" },
      { status: 400 }
    );
  }

  const cache = await loadCache();
  const cacheKey = String(uid);

  if (!refresh && cache[cacheKey]?.fullyProcessed) {
    return NextResponse.json({ email: cache[cacheKey] });
  }

  const client = createImapClient();
  let lock;

  try {
    await client.connect();
    lock = await client.getMailboxLock("INBOX");

    const msg = await client.fetchOne(
      String(uid),
      { uid: true, envelope: true, size: true, bodyStructure: true },
      { uid: true }
    );

    if (!msg) {
      return NextResponse.json({ error: "Message not found" }, { status: 404 });
    }

    if (!isAllowedSender(msg.envelope)) {
      return NextResponse.json(
        { error: "Sender domain not allowed" },
        { status: 403 }
      );
    }

    const { email, cacheUpdated } = await processSingleMessage(
      client,
      msg,
      cache,
      refresh
    );

    if (cacheUpdated) {
      await saveCache(cache);
    }

    return NextResponse.json({ email });
  } catch (error) {
    console.error("process-one error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to process email" },
      { status: 500 }
    );
  } finally {
    lock?.release();
    await client.logout();
  }
}
