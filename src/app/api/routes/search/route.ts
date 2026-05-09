import { NextResponse } from "next/server";
import { z } from "zod";

import { computeDrivingRoute } from "@/lib/google/routes";
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

  const response = buildRouteSearchResponse(parsed.data);
  const apiKey = process.env.GOOGLE_MAPS_SERVER_API_KEY;

  if (!apiKey || response.intent.requiresTripContext || !parsed.data.origin.trim() || !parsed.data.destination.trim()) {
    return NextResponse.json(response);
  }

  try {
    const route = await computeDrivingRoute(
      {
        origin: parsed.data.origin,
        destination: parsed.data.destination,
      },
      { apiKey },
    );

    return NextResponse.json({ ...response, route });
  } catch {
    return NextResponse.json(response);
  }
}
