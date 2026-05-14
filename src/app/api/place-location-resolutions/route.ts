import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

const MAP_RESPONSE_CACHE_CONTROL = "public, s-maxage=3600, stale-while-revalidate=86400";

type PlaceLocationResolutionRow = {
  id: string;
  google_curated_place_id: string;
  google_place_id: string;
  latitude: number | string;
  longitude: number | string;
  coordinate_source: string;
  coordinate_confidence: number | string;
  opening_hours: string | null;
  opening_hours_source: string | null;
  resolution_status: string;
};

export async function GET() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    return NextResponse.json(
      { error: "Place location resolutions are not configured.", points: [], placeDetailsRequests: 0 },
      { status: 503 },
    );
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data, error } = await supabase
    .from("place_location_resolutions")
    .select(
      "id,google_curated_place_id,google_place_id,latitude,longitude,coordinate_source,coordinate_confidence,opening_hours,opening_hours_source,resolution_status",
    )
    .eq("resolution_status", "auto_approved")
    .order("coordinate_confidence", { ascending: false });

  if (error) {
    return NextResponse.json(
      { error: "Resolved place locations could not be loaded.", points: [], placeDetailsRequests: 0 },
      { status: 502 },
    );
  }

  const points = ((data ?? []) as PlaceLocationResolutionRow[]).map((row) => ({
    id: row.id,
    googleCuratedPlaceId: row.google_curated_place_id,
    googlePlaceId: row.google_place_id,
    latitude: Number(row.latitude),
    longitude: Number(row.longitude),
    coordinateSource: row.coordinate_source,
    coordinateConfidence: Number(row.coordinate_confidence),
    openingHours: row.opening_hours,
    openingHoursSource: row.opening_hours_source,
    resolutionStatus: row.resolution_status,
  }));

  return NextResponse.json(
    { points, placeDetailsRequests: 0 },
    { headers: { "Cache-Control": MAP_RESPONSE_CACHE_CONTROL } },
  );
}