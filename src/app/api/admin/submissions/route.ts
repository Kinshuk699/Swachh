import { NextResponse } from "next/server";

import { listPendingRestroomSubmissions } from "@/lib/admin/submissions";

export async function GET() {
  try {
    const queue = await listPendingRestroomSubmissions();

    return NextResponse.json(queue);
  } catch {
    return NextResponse.json({ error: "Pending submissions could not be loaded." }, { status: 502 });
  }
}