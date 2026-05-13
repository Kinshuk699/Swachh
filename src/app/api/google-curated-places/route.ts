import { createClient } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

import {
  defaultMaxHighwayDiversionMeters,
  type CleanlinessTier,
  type ProxyType,
  type SourceCategory,
} from "@/lib/discovery/highway-place-discovery";
import {
  classifyGoogleCuratedPlaceDisplay,
  type GoogleCuratedPlaceDisplayReason,
} from "@/lib/discovery/google-curated-place-display";
import { getPlaceDetails, type GooglePlaceDetails } from "@/lib/google/places";
import { cleanToiletDisplayLabel } from "@/lib/restrooms/clean-toilet-labels";
import type { HighwayStop } from "@/lib/restrooms/sample-stops";

const DEFAULT_MAP_LIMIT = 40;
const DEFAULT_MAX_MAP_LIMIT = 80;
const DEFAULT_ALL_FOUND_MAP_LIMIT = 1500;
const DEFAULT_STORED_ROW_LIMIT = 500;
const DEFAULT_ALL_FOUND_STORED_ROW_LIMIT = 2000;
const MAP_RESPONSE_CACHE_CONTROL = "public, s-maxage=3600, stale-while-revalidate=86400";
const PLACE_DETAILS_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const PLACE_DETAILS_HYDRATION_CONCURRENCY = 25;
const SUPABASE_PAGE_SIZE = 1000;
const publicMapStatuses = ["likely_clean", "verified_clean", "approved"] as const;
const allFoundMapStatuses = ["likely_clean", "matched", "verified_clean", "approved"] as const;
const allFoundMapTiers = ["tier_1", "tier_2", "tier_3"] as const satisfies CleanlinessTier[];
const allFoundMapTierSet = new Set<CleanlinessTier>(allFoundMapTiers);
type CuratedMapVisibility = "public" | "all_found";
type GoogleCuratedPlaceVerificationStatus = (typeof allFoundMapStatuses)[number];
type CuratedMapDetailsMode = "stored" | "google";
type GoogleCuratedPlaceMappingExclusionReason = Exclude<GoogleCuratedPlaceDisplayReason, "displayable">;

type GoogleCuratedPlaceMappingExclusion = {
  reason: GoogleCuratedPlaceMappingExclusionReason;
  placeId: string;
  seedName: string;
  resolvedGoogleName: string;
  googleTypes: string[];
  highway: string;
  locality: string;
  cleanlinessTier: CleanlinessTier;
  sourceCategory: SourceCategory;
};

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

type GoogleCuratedPlaceCandidate = {
  id: string;
  name: string;
  category: HighwayStop["category"];
  distanceFromRouteMeters: number;
  distanceFromHighwayMeters: number;
  detourMinutes: number;
  source: "google_place";
  confidence: number;
  verified: boolean;
  highway: string;
  locality: string;
  priceLabel: HighwayStop["priceLabel"];
  facilities: string[];
  placeId: string;
  isPaidPremium: boolean;
  cleanlinessLabel: string;
  sourceLabel: string;
  cleanlinessTier?: CleanlinessTier;
  verificationStatus?: GoogleCuratedPlaceVerificationStatus;
};

export async function GET(request: Request) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const apiKey = process.env.GOOGLE_MAPS_SERVER_API_KEY;
  const detailsMode = getRequestedDetailsMode(request);

  if (!supabaseUrl || !serviceRoleKey || (detailsMode === "google" && !apiKey)) {
    return NextResponse.json(
      {
        error: "Stored Google curated places are not configured.",
        places: [],
        candidates: [],
        storedRowsRead: 0,
        placeDetailsRequests: 0,
        mappingDiagnostics: toMappingDiagnostics({ placeDetailsRequests: 0, places: [], exclusions: [] }),
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
  const { data, error } = await fetchStoredGoogleCuratedPlaceRows({ storedRowLimit, supabase, visibilityStatuses });

  if (error) {
    return NextResponse.json(
      {
        error: "Stored Google curated places could not be loaded.",
        places: [],
        candidates: [],
        storedRowsRead: 0,
        placeDetailsRequests: 0,
        mappingDiagnostics: toMappingDiagnostics({ placeDetailsRequests: 0, places: [], exclusions: [] }),
        textSearchRequests: 0,
        capped: true,
      },
      { status: 502 },
    );
  }

  const storedRows = (data ?? []) as unknown as GoogleCuratedPlaceRow[];
  const rows = rowsForVisibility(storedRows, visibility);
  const diversifiedRows = diversifyStoredRows(rows);
  const candidates = diversifiedRows.slice(0, limit).map((row) => toGooglePlaceCandidate(row, visibility));

  if (detailsMode === "stored") {
    return NextResponse.json(
      {
        visibility,
        detailsMode,
        places: [],
        candidates,
        storedRowsRead: rows.length,
        placeDetailsRequests: 0,
        mappingDiagnostics: toMappingDiagnostics({ placeDetailsRequests: 0, places: [], exclusions: [] }),
        textSearchRequests: 0,
        capped: storedRows.length === storedRowLimit || candidates.length < diversifiedRows.length,
      },
      { headers: { "Cache-Control": MAP_RESPONSE_CACHE_CONTROL } },
    );
  }

  const maxPlaceDetailsRequests = Math.min(diversifiedRows.length, limit * 2);
  const { places, placeDetailsRequests, exclusions } = await hydrateHighwayStops({
    apiKey: apiKey!,
    limit,
    maxPlaceDetailsRequests,
    rows: diversifiedRows,
    visibility,
  });

  const hitStoredRowCap = storedRows.length === storedRowLimit;
  const hitDetailsRequestCap = places.length < limit && placeDetailsRequests === maxPlaceDetailsRequests && maxPlaceDetailsRequests < diversifiedRows.length;

  return NextResponse.json(
    {
      visibility,
      detailsMode,
      places,
      candidates,
      storedRowsRead: rows.length,
      placeDetailsRequests,
      mappingDiagnostics: toMappingDiagnostics({ placeDetailsRequests, places, exclusions }),
      textSearchRequests: 0,
      capped: hitStoredRowCap || hitDetailsRequestCap,
    },
    { headers: { "Cache-Control": MAP_RESPONSE_CACHE_CONTROL } },
  );
}

async function fetchStoredGoogleCuratedPlaceRows(input: {
  storedRowLimit: number;
  supabase: SupabaseClient;
  visibilityStatuses: GoogleCuratedPlaceVerificationStatus[];
}): Promise<{ data: GoogleCuratedPlaceRow[]; error: { message: string } | null }> {
  const rows: GoogleCuratedPlaceRow[] = [];

  for (let from = 0; from < input.storedRowLimit; from += SUPABASE_PAGE_SIZE) {
    const to = Math.min(from + SUPABASE_PAGE_SIZE - 1, input.storedRowLimit - 1);
    const { data, error } = await input.supabase
      .from("google_curated_places")
      .select(googleCuratedPlaceColumns)
      .in("verification_status", input.visibilityStatuses)
      .lte("distance_from_highway_meters", defaultMaxHighwayDiversionMeters)
      .order("cleanliness_tier", { ascending: true })
      .order("restroom_confidence", { ascending: false })
      .range(from, to);

    if (error) {
      return { data: [], error };
    }

    const pageRows = (data ?? []) as unknown as GoogleCuratedPlaceRow[];
    rows.push(...pageRows);

    if (pageRows.length < to - from + 1) {
      break;
    }
  }

  return { data: rows, error: null };
}

async function hydrateHighwayStops(input: {
  apiKey: string;
  limit: number;
  maxPlaceDetailsRequests: number;
  rows: GoogleCuratedPlaceRow[];
  visibility: CuratedMapVisibility;
}): Promise<{ places: HighwayStop[]; placeDetailsRequests: number; exclusions: GoogleCuratedPlaceMappingExclusion[] }> {
  const places: HighwayStop[] = [];
  const exclusions: GoogleCuratedPlaceMappingExclusion[] = [];
  let placeDetailsRequests = 0;

  for (let index = 0; index < input.maxPlaceDetailsRequests && places.length < input.limit; index += PLACE_DETAILS_HYDRATION_CONCURRENCY) {
    const batch = input.rows.slice(index, Math.min(index + PLACE_DETAILS_HYDRATION_CONCURRENCY, input.maxPlaceDetailsRequests));
    placeDetailsRequests += batch.length;
    const stops = await Promise.all(
      batch.map(async (row) => {
        try {
          const details = await getCachedPlaceDetails(row.google_place_id, input.apiKey);
          const decision = classifyGoogleCuratedPlaceDisplay(row, details);
          if (!decision.displayable) {
            return { exclusion: toMappingExclusion(row, decision.reason, details), stop: null };
          }

          return { exclusion: null, stop: toHighwayStop(row, details, input.visibility) };
        } catch {
          return { exclusion: toMappingExclusion(row, "details_unavailable"), stop: null };
        }
      }),
    );

    for (const result of stops) {
      if (result.exclusion) {
        exclusions.push(result.exclusion);
      }

      if (result.stop) {
        places.push(result.stop);
      }

      if (places.length >= input.limit) {
        break;
      }
    }
  }

  return { places, placeDetailsRequests, exclusions };
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

function getRequestedDetailsMode(request: Request): CuratedMapDetailsMode {
  return new URL(request.url).searchParams.get("details") === "google" ? "google" : "stored";
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

function toGooglePlaceCandidate(row: GoogleCuratedPlaceRow, visibility: CuratedMapVisibility): GoogleCuratedPlaceCandidate {
  const cleanlinessLabel = cleanToiletDisplayLabel({
    cleanlinessTier: row.cleanliness_tier,
    sourceCategory: row.source_category,
  });

  return {
    id: `google-${row.google_place_id}`,
    name: row.seed_name,
    category: toStopCategory(row.proxy_type),
    distanceFromRouteMeters: row.distance_from_highway_meters,
    distanceFromHighwayMeters: row.distance_from_highway_meters,
    detourMinutes: Math.max(1, Math.round(row.distance_from_highway_meters / 500)),
    source: "google_place",
    confidence: row.restroom_confidence,
    verified: row.verification_status === "verified_clean" || row.verification_status === "approved",
    highway: row.highway_name,
    locality: row.route_context ?? row.region,
    priceLabel: row.proxy_type === "premium_lavatory" ? "Paid" : "Customer access",
    facilities: [cleanlinessLabel, "Highway-filtered", row.route_context ?? row.region],
    placeId: row.google_place_id,
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

function toMappingExclusion(
  row: GoogleCuratedPlaceRow,
  reason: GoogleCuratedPlaceMappingExclusionReason,
  details?: GooglePlaceDetails,
): GoogleCuratedPlaceMappingExclusion {
  return {
    reason,
    placeId: row.google_place_id,
    seedName: row.seed_name,
    resolvedGoogleName: details?.displayName ?? "Google Details unavailable",
    googleTypes: details?.types ?? [reason],
    highway: row.highway_name,
    locality: row.route_context ?? row.region,
    cleanlinessTier: row.cleanliness_tier,
    sourceCategory: row.source_category,
  };
}

function toMappingDiagnostics(input: {
  placeDetailsRequests: number;
  places: HighwayStop[];
  exclusions: GoogleCuratedPlaceMappingExclusion[];
}) {
  return {
    attemptedPlaceDetails: input.placeDetailsRequests,
    mappedPlaces: input.places.length,
    excludedPlaces: input.exclusions.length,
    excludedByReason: countBy(input.exclusions, (exclusion) => exclusion.reason),
    excludedSamples: input.exclusions.slice(0, 25),
  };
}

function countBy<T>(items: T[], keyForItem: (item: T) => string): Record<string, number> {
  const counts: Record<string, number> = {};

  for (const item of items) {
    const key = keyForItem(item);
    counts[key] = (counts[key] ?? 0) + 1;
  }

  return counts;
}
