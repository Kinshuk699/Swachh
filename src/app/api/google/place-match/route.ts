import { NextResponse } from "next/server";
import { z } from "zod";

import { buildTextSearchRequest } from "@/lib/google/place-matching";

const placeMatchSchema = z.object({
  name: z.string().min(1),
  highwayContext: z.string().min(1),
  routeContext: z.string().min(1),
  localityHint: z.string().min(1),
});

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const parsed = placeMatchSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid place match seed" }, { status: 400 });
  }

  return NextResponse.json({ request: buildTextSearchRequest(parsed.data) });
}