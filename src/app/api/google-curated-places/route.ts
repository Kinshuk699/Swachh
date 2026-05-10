import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

import type { CleanlinessTier, ProxyType, SourceCategory } from "@/lib/discovery/highway-place-discovery";
import { getPlaceDetails, type GooglePlaceDetails } from "@/lib/google/places";
import { cleanToiletDisplayLabel } from "@/lib/restrooms/clean-toilet-labels";
import type { HighwayStop } from "@/lib/restrooms/sample-stops";

const DEFAULT_MAP_LIMIT = 40;
const DEFAULT_MAX_MAP_LIMIT = 80;
const publicMapStatuses = ["likely_clean", "verified_clean", "approved"] as const;
const weakPlaceNameTokens = new Set(["and", "the", "fuel", "cafe", "restaurant", "hotel", "highway", "official", "service"]);

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
  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data, error } = await supabase
    .from("google_curated_places")
    .select(googleCuratedPlaceColumns)
    .in("verification_status", [...publicMapStatuses])
    .order("cleanliness_tier", { ascending: true })
    .order("restroom_confidence", { ascending: false })
    .limit(limit);

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
  const placeResults = await Promise.all(
    rows.map(async (row) => {
      try {
        const details = await getPlaceDetails(row.google_place_id, { apiKey });
        if (!isRelevantGooglePlaceMatch(row, details)) {
          return null;
        }

        return toHighwayStop(row, details);
      } catch {
        return null;
      }
    }),
  );
  const places = placeResults.filter((place): place is HighwayStop => Boolean(place));

  return NextResponse.json({
    places,
    storedRowsRead: rows.length,
    placeDetailsRequests: rows.length,
    textSearchRequests: 0,
    capped: rows.length === limit,
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

function isRelevantGooglePlaceMatch(row: GoogleCuratedPlaceRow, details: GooglePlaceDetails): boolean {
  const normalizedPlaceName = normalizeForPlaceMatch(details.displayName);
  const normalizedSeedName = normalizeForPlaceMatch(row.seed_name);

  if (!normalizedPlaceName || !normalizedSeedName) {
    return false;
  }

  if (normalizedPlaceName.includes(normalizedSeedName) || normalizedSeedName.includes(normalizedPlaceName)) {
    return true;
  }

  const tokens = row.seed_name
    .toLowerCase()
    .replace(/&/g, " and ")
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length >= 3 && !weakPlaceNameTokens.has(token));

  return tokens.length > 0 && tokens.every((token) => normalizedPlaceName.includes(token));
}

function normalizeForPlaceMatch(input: string): string {
  return input.toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, "");
}
