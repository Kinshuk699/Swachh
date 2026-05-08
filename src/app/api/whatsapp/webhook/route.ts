import { NextResponse } from "next/server";

import { buildWhatsAppReply } from "@/lib/whatsapp/replies";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");

  if (mode === "subscribe" && token === process.env.WHATSAPP_VERIFY_TOKEN && challenge) {
    return new Response(challenge, { status: 200 });
  }

  return NextResponse.json({ error: "Verification failed" }, { status: 403 });
}

export async function POST(request: Request) {
  const payload = await request.json().catch(() => ({}));
  const text = extractMessageText(payload);
  const reply = buildWhatsAppReply({
    text,
    hasSharedLocation: Boolean(payload?.entry?.[0]?.changes?.[0]?.value?.messages?.[0]?.location),
    isInsideCity: true,
    distanceToHighwayMeters: 7_500,
  });

  return NextResponse.json({ ok: true, reply });
}

function extractMessageText(payload: unknown): string {
  if (!payload || typeof payload !== "object") {
    return "";
  }

  const entry = (payload as { entry?: Array<{ changes?: Array<{ value?: { messages?: Array<{ text?: { body?: string } }> } }> }> }).entry;
  return entry?.[0]?.changes?.[0]?.value?.messages?.[0]?.text?.body ?? "";
}
