import { NextResponse } from "next/server";
import { z } from "zod";

import { buildRouteSearchResponse } from "@/lib/routes/route-search";

const routeSearchSchema = z.object({
  origin: z.string().default(""),
  destination: z.string().default(""),
  highwayName: z.string().default(""),
  isInsideCity: z.boolean().default(true),
  distanceToHighwayMeters: z.number().nonnegative().default(9_000),
});

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const parsed = routeSearchSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid route search request" }, { status: 400 });
  }

  return NextResponse.json(buildRouteSearchResponse(parsed.data));
}
