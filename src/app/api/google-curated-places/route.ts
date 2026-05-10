import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

import { isRelevantGooglePlaceCandidate, type CleanlinessTier, type ProxyType, type SourceCategory } from "@/lib/discovery/highway-place-discovery";
import { getPlaceDetails, type GooglePlaceDetails } from "@/lib/google/places";
import { cleanToiletDisplayLabel } from "@/lib/restrooms/clean-toilet-labels";
import type { HighwayStop } from "@/lib/restrooms/sample-stops";

const DEFAULT_MAP_LIMIT = 40;
const DEFAULT_MAX_MAP_LIMIT = 80;
const publicMapStatuses = ["likely_clean", "verified_clean", "approved"] as const;

const googleCuratedPlaceColumns = [
  "google_place_id",
  "seed_name",
  "region",
  "proxy_type",
  "cleanliness_tier",
  "source_category",
  "source_evidence",
  "highway_name",
  "route_context",
  "restroom_confidence",
  "distance_from_highway_meters",
  "local_notes",
  "verification_status",
].join(",");

type PublicMapStatus = (typeof publicMapStatuses)[number];

type GoogleCuratedPlaceRow = {
  google_place_id: string;
  seed_name: string;
  region: string;
  proxy_type: ProxyType;
  cleanliness_tier: CleanlinessTier;
  source_category: SourceCategory;
  source_evidence: string;
  highway_name: string;
  route_context: string | null;
  restroom_confidence: number;
  distance_from_highway_meters: number;
  local_notes: string | null;
  verification_status: PublicMapStatus;
};

export async function GET(request: Request) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const apiKey = process.env.GOOGLE_MAPS_SERVER_API_KEY;

  if (!supabaseUrl || !serviceRoleKey || !apiKey) {
    return NextResponse.json(
      {
        error: "Stored Google curated places are not configured.",
        places: [],
        storedRowsRead: 0,
        placeDetailsRequests: 0,
        textSearchRequests: 0,
        capped: true,
      },
      { status: 503 },
    );
  }

  const limit = getRequestedLimit(request);
  const storedRowLimit = Math.min(limit * 5, 200);
  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data, error } = await supabase
    .from("google_curated_places")
    .select(googleCuratedPlaceColumns)
    .in("verification_status", [...publicMapStatuses])
    .order("cleanliness_tier", { ascending: true })
    .order("restroom_confidence", { ascending: false })
    .limit(storedRowLimit);

  if (error) {
    return NextResponse.json(
      {
        error: "Stored Google curated places could not be loaded.",
        places: [],
        storedRowsRead: 0,
        placeDetailsRequests: 0,
        textSearchRequests: 0,
        capped: true,
      },
      { status: 502 },
    );
  }

  const rows = (data ?? []) as unknown as GoogleCuratedPlaceRow[];
  const diversifiedRows = diversifyStoredRows(rows);
  const maxPlaceDetailsRequests = Math.min(diversifiedRows.length, limit * 2);
  const places: HighwayStop[] = [];
  let placeDetailsRequests = 0;

  for (const row of diversifiedRows) {
    if (places.length >= limit || placeDetailsRequests >= maxPlaceDetailsRequests) {
      break;
    }

    placeDetailsRequests += 1;

    try {
      const details = await getPlaceDetails(row.google_place_id, { apiKey });
      if (!isRelevantGooglePlaceMatch(row, details)) {
        continue;
      }

      const stop = toHighwayStop(row, details);
      if (stop) {
        places.push(stop);
      }
    } catch {
      continue;
    }
  }

  return NextResponse.json({
    places,
    storedRowsRead: rows.length,
    placeDetailsRequests,
    textSearchRequests: 0,
    capped: rows.length === storedRowLimit || (places.length < limit && placeDetailsRequests === maxPlaceDetailsRequests),
  });
}

function getRequestedLimit(request: Request): number {
  const rawLimit = Number(new URL(request.url).searchParams.get("limit") ?? DEFAULT_MAP_LIMIT);
  const envMax = Number(process.env.GOOGLE_CURATED_PLACES_MAP_MAX ?? DEFAULT_MAX_MAP_LIMIT);
  const maxLimit = Number.isFinite(envMax) && envMax > 0 ? envMax : DEFAULT_MAX_MAP_LIMIT;
  const requestedLimit = Number.isFinite(rawLimit) && rawLimit > 0 ? rawLimit : DEFAULT_MAP_LIMIT;

  return Math.min(maxLimit, Math.floor(requestedLimit));
}

function toHighwayStop(row: GoogleCuratedPlaceRow, details: GooglePlaceDetails): HighwayStop | null {
  if (!details.location) {
    return null;
  }

  const cleanlinessLabel = cleanToiletDisplayLabel({
    cleanlinessTier: row.cleanliness_tier,
    sourceCategory: row.source_category,
  });

  return {
    id: `google-${row.google_place_id}`,
    name: details.displayName || row.seed_name,
    category: toStopCategory(row.proxy_type),
    distanceFromRouteMeters: row.distance_from_highway_meters,
    distanceFromHighwayMeters: row.distance_from_highway_meters,
    detourMinutes: Math.max(1, Math.round(row.distance_from_highway_meters / 500)),
    isEndpointStagingArea: false,
    isInsideDenseCity: false,
    source: "google_place",
    confidence: row.restroom_confidence,
    openNow: details.openNow ?? false,
    verified: row.verification_status === "verified_clean" || row.verification_status === "approved",
    lat: details.location.latitude,
    lng: details.location.longitude,
    highway: row.highway_name,
    locality: row.route_context ?? row.region,
    priceLabel: row.proxy_type === "premium_lavatory" ? "Paid" : "Customer access",
    facilities: [cleanlinessLabel, "Highway-filtered", row.route_context ?? row.region],
    placeId: row.google_place_id,
    googleMapsUri: details.googleMapsUri,
    googlePlaceName: details.displayName,
    openingHoursText: details.weekdayDescriptions,
    isPaidPremium: row.proxy_type === "premium_lavatory",
    cleanlinessLabel,
    sourceLabel: cleanlinessLabel,
  };
}

function toStopCategory(proxyType: ProxyType): HighwayStop["category"] {
  if (proxyType === "fuel_cafe" || proxyType === "fuel_station") {
    return "fuel_station";
  }

  if (proxyType === "food_plaza" || proxyType === "wayside_amenity") {
    return "food_plaza";
  }

  if (proxyType === "premium_lavatory") {
    return "public_restroom";
  }

  return "restaurant_proxy";
}

function diversifyStoredRows(rows: GoogleCuratedPlaceRow[]): GoogleCuratedPlaceRow[] {
  const groups = new Map<string, GoogleCuratedPlaceRow[]>();

  for (const row of rows) {
    const groupKey = `${row.source_category}:${row.seed_name.toLowerCase()}`;
    const group = groups.get(groupKey) ?? [];
    group.push(row);
    groups.set(groupKey, group);
  }

  const diversifiedRows: GoogleCuratedPlaceRow[] = [];
  const groupValues = [...groups.values()];
  let groupIndex = 0;

  while (groupValues.some((group) => group.length > 0)) {
    const group = groupValues[groupIndex % groupValues.length];
    const row = group.shift();

    if (row) {
      diversifiedRows.push(row);
    }

    groupIndex += 1;
  }

  return diversifiedRows;
}

function isRelevantGooglePlaceMatch(row: GoogleCuratedPlaceRow, details: GooglePlaceDetails): boolean {
  return isRelevantGooglePlaceCandidate({
    seedName: row.seed_name,
    proxyType: row.proxy_type,
    placeName: details.displayName,
    types: details.types,
  });
}
