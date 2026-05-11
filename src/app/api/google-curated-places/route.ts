import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

import {
  defaultMaxHighwayDiversionMeters,
  isRelevantGooglePlaceCandidate,
  type CleanlinessTier,
  type ProxyType,
  type SourceCategory,
} from "@/lib/discovery/highway-place-discovery";
import { getPlaceDetails, type GooglePlaceDetails } from "@/lib/google/places";
import { cleanToiletDisplayLabel } from "@/lib/restrooms/clean-toilet-labels";
import type { HighwayStop } from "@/lib/restrooms/sample-stops";

const DEFAULT_MAP_LIMIT = 40;
const DEFAULT_MAX_MAP_LIMIT = 80;
const DEFAULT_ALL_FOUND_MAP_LIMIT = 1000;
const DEFAULT_STORED_ROW_LIMIT = 500;
const DEFAULT_ALL_FOUND_STORED_ROW_LIMIT = 2000;
const MAP_RESPONSE_CACHE_CONTROL = "public, s-maxage=3600, stale-while-revalidate=86400";
const PLACE_DETAILS_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const publicMapStatuses = ["likely_clean", "verified_clean", "approved"] as const;
const allFoundMapStatuses = ["likely_clean", "matched", "verified_clean", "approved"] as const;
const allFoundMapTiers = ["tier_1", "tier_2", "tier_3"] as const satisfies CleanlinessTier[];
const allFoundMapTierSet = new Set<CleanlinessTier>(allFoundMapTiers);
type CuratedMapVisibility = "public" | "all_found";
type GoogleCuratedPlaceVerificationStatus = (typeof allFoundMapStatuses)[number];

const placeDetailsCache = new Map<string, { expiresAt: number; details: GooglePlaceDetails }>();

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
  verification_status: GoogleCuratedPlaceVerificationStatus;
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

  const visibility = getRequestedVisibility(request);
  const limit = getRequestedLimit(request, visibility);
  const visibilityStatuses = statusesForVisibility(visibility);
  const storedRowLimit = getStoredRowLimit(limit, visibility);
  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data, error } = await supabase
    .from("google_curated_places")
    .select(googleCuratedPlaceColumns)
    .in("verification_status", visibilityStatuses)
    .lte("distance_from_highway_meters", defaultMaxHighwayDiversionMeters)
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

  const storedRows = (data ?? []) as unknown as GoogleCuratedPlaceRow[];
  const rows = rowsForVisibility(storedRows, visibility);
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
      const details = await getCachedPlaceDetails(row.google_place_id, apiKey);
      if (!isRelevantGooglePlaceMatch(row, details)) {
        continue;
      }

      const stop = toHighwayStop(row, details, visibility);
      if (stop) {
        places.push(stop);
      }
    } catch {
      continue;
    }
  }

  const hitStoredRowCap = storedRows.length === storedRowLimit;
  const hitDetailsRequestCap = places.length < limit && placeDetailsRequests === maxPlaceDetailsRequests && maxPlaceDetailsRequests < diversifiedRows.length;

  return NextResponse.json(
    {
      visibility,
      places,
      storedRowsRead: rows.length,
      placeDetailsRequests,
      textSearchRequests: 0,
      capped: hitStoredRowCap || hitDetailsRequestCap,
    },
    { headers: { "Cache-Control": MAP_RESPONSE_CACHE_CONTROL } },
  );
}

async function getCachedPlaceDetails(placeId: string, apiKey: string): Promise<GooglePlaceDetails> {
  const now = Date.now();
  const cached = placeDetailsCache.get(placeId);

  if (cached && cached.expiresAt > now) {
    return cached.details;
  }

  placeDetailsCache.delete(placeId);
  const details = await getPlaceDetails(placeId, { apiKey });
  placeDetailsCache.set(placeId, { details, expiresAt: now + PLACE_DETAILS_CACHE_TTL_MS });
  return details;
}

function getRequestedLimit(request: Request, visibility: CuratedMapVisibility): number {
  const rawLimit = Number(new URL(request.url).searchParams.get("limit") ?? DEFAULT_MAP_LIMIT);
  const defaultMaxLimit = visibility === "all_found" ? DEFAULT_ALL_FOUND_MAP_LIMIT : DEFAULT_MAX_MAP_LIMIT;
  const envMax = Number(visibility === "all_found" ? process.env.GOOGLE_CURATED_PLACES_ALL_FOUND_MAP_MAX : process.env.GOOGLE_CURATED_PLACES_MAP_MAX);
  const maxLimit = Number.isFinite(envMax) && envMax > 0 ? envMax : defaultMaxLimit;
  const requestedLimit = Number.isFinite(rawLimit) && rawLimit > 0 ? rawLimit : DEFAULT_MAP_LIMIT;

  return Math.min(maxLimit, Math.floor(requestedLimit));
}

function getStoredRowLimit(limit: number, visibility: CuratedMapVisibility): number {
  const maxStoredRows = visibility === "all_found" ? DEFAULT_ALL_FOUND_STORED_ROW_LIMIT : DEFAULT_STORED_ROW_LIMIT;
  return Math.min(limit * 5, maxStoredRows);
}

function getRequestedVisibility(request: Request): CuratedMapVisibility {
  return new URL(request.url).searchParams.get("visibility") === "all_found" ? "all_found" : "public";
}

function statusesForVisibility(visibility: CuratedMapVisibility): GoogleCuratedPlaceVerificationStatus[] {
  return visibility === "all_found" ? [...allFoundMapStatuses] : [...publicMapStatuses];
}

function rowsForVisibility(rows: GoogleCuratedPlaceRow[], visibility: CuratedMapVisibility): GoogleCuratedPlaceRow[] {
  if (visibility !== "all_found") {
    return rows;
  }

  return rows.filter((row) => allFoundMapTierSet.has(row.cleanliness_tier));
}

function toHighwayStop(row: GoogleCuratedPlaceRow, details: GooglePlaceDetails, visibility: CuratedMapVisibility): HighwayStop | null {
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
    ...(visibility === "all_found"
      ? {
          cleanlinessTier: row.cleanliness_tier,
          verificationStatus: row.verification_status,
        }
      : {}),
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
