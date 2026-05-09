import { NextResponse } from "next/server";

import { getPlaceDetails } from "@/lib/google/places";

export async function GET(request: Request) {
  const apiKey = process.env.GOOGLE_MAPS_SERVER_API_KEY;
  const placeId = new URL(request.url).searchParams.get("placeId")?.trim();

  if (!placeId) {
    return NextResponse.json({ error: "placeId is required" }, { status: 400 });
  }

  if (!apiKey) {
    return NextResponse.json({ error: "Google Maps server key is not configured" }, { status: 503 });
  }

  try {
    return NextResponse.json(await getPlaceDetails(placeId, { apiKey }));
  } catch {
    return NextResponse.json({ error: "Google place details could not be loaded" }, { status: 502 });
  }
}