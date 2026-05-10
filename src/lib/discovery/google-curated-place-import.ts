import {
  buildHighwayPlacesSearchJobs,
  dedupeDiscoveredHighwayPlaces,
  filterHighwayPlaceMatches,
  getPlaceCleanToiletClassification,
  type CleanlinessTier,
  type DiscoveredHighwayPlace,
  type GoogleTextSearchJob,
  type HighwaySearchCorridor,
  type SourceCategory,
} from "./highway-place-discovery.ts";
import { curatedStopCandidates, highwaySearchCorridors, proxyBrands } from "./seed-catalog.ts";
import { searchTextPlaces as defaultSearchTextPlaces, type GoogleTextSearchResponse } from "../google/places.ts";

export type GoogleCuratedPlaceImportRow = {
  google_place_id: string;
  seed_name: string;
  region: string;
  proxy_type: string;
  cleanliness_tier: CleanlinessTier;
  source_category: SourceCategory;
  source_evidence: string;
  highway_name: string;
  route_context: string | null;
  locality_hint: string | null;
  restroom_confidence: number;
  distance_from_highway_meters: number;
  local_notes: string | null;
  verification_status: "matched" | "likely_clean";
  matched_at: string;
  updated_at: string;
};

export type GoogleCuratedPlaceDiscoverySummary = {
  totalJobs: number;
  searchedJobs: number;
  missingCorridorJobs: number;
  failedJobs: number;
  rawMatches: number;
  places: DiscoveredHighwayPlace[];
  failures: Array<{ jobId: string; message: string }>;
};

type SearchTextPlaces = (
  job: GoogleTextSearchJob,
  options: { apiKey: string },
) => Promise<GoogleTextSearchResponse>;

export async function discoverGoogleCuratedPlaces(input: {
  apiKey: string;
  jobs?: GoogleTextSearchJob[];
  corridors?: HighwaySearchCorridor[];
  jobLimit?: number;
  maxTextSearchRequests?: number;
  maxDiversionMeters?: number;
  searchTextPlaces?: SearchTextPlaces;
  onProgress?: (progress: { searchedJobs: number; totalJobs: number; matches: number; failures: number }) => void;
}): Promise<GoogleCuratedPlaceDiscoverySummary> {
  const allJobs = input.jobs ?? buildHighwayPlacesSearchJobs({ proxyBrands, curatedStopCandidates, corridors: highwaySearchCorridors });
  const jobs = typeof input.jobLimit === "number" ? allJobs.slice(0, input.jobLimit) : allJobs;
  const corridors = input.corridors ?? highwaySearchCorridors;
  const searchTextPlaces = input.searchTextPlaces ?? defaultSearchTextPlaces;
  const maxDiversionMeters = input.maxDiversionMeters ?? 2_000;
  const discoveredPlaces: DiscoveredHighwayPlace[] = [];
  const failures: Array<{ jobId: string; message: string }> = [];
  const plannedJobs = jobs.map((job) => ({ job, corridor: findCorridorForJob(job, corridors) }));
  const plannedTextSearchRequests = plannedJobs.filter((plannedJob) => plannedJob.corridor).length;

  if (
    typeof input.maxTextSearchRequests === "number" &&
    plannedTextSearchRequests > input.maxTextSearchRequests
  ) {
    throw new Error(
      `Planned Google Places Text Search requests exceed cap: planned=${plannedTextSearchRequests} cap=${input.maxTextSearchRequests}`,
    );
  }

  let searchedJobs = 0;
  let missingCorridorJobs = 0;

  for (const { job, corridor } of plannedJobs) {

    if (!corridor) {
      missingCorridorJobs += 1;
      continue;
    }

    searchedJobs += 1;

    try {
      const response = await searchTextPlaces(job, { apiKey: input.apiKey });
      discoveredPlaces.push(
        ...filterHighwayPlaceMatches({ job, corridor, places: response.places, maxDiversionMeters }),
      );
    } catch (error) {
      failures.push({ jobId: job.id, message: error instanceof Error ? error.message : "Unknown Google Places error" });
    }

    input.onProgress?.({
      searchedJobs,
      totalJobs: jobs.length,
      matches: discoveredPlaces.length,
      failures: failures.length,
    });
  }

  return {
    totalJobs: allJobs.length,
    searchedJobs,
    missingCorridorJobs,
    failedJobs: failures.length,
    rawMatches: discoveredPlaces.length,
    places: dedupeDiscoveredHighwayPlaces(discoveredPlaces),
    failures,
  };
}

export function toGoogleCuratedPlaceRows(
  places: DiscoveredHighwayPlace[],
  timestamp = new Date().toISOString(),
): GoogleCuratedPlaceImportRow[] {
  return places.map((place) => {
    const classification = getPlaceCleanToiletClassification(place);

    return {
      google_place_id: place.placeId,
      seed_name: place.seedName,
      region: place.region,
      proxy_type: place.proxyType,
      cleanliness_tier: classification.cleanlinessTier,
      source_category: classification.sourceCategory,
      source_evidence: classification.sourceEvidence,
      highway_name: place.highwayContext,
      route_context: place.routeContext || null,
      locality_hint: null,
      restroom_confidence: place.confidence,
      distance_from_highway_meters: place.distanceFromHighwayMeters,
      local_notes: place.localNotes || null,
      verification_status: initialVerificationStatus(classification.cleanlinessTier),
      matched_at: timestamp,
      updated_at: timestamp,
    };
  });
}

function initialVerificationStatus(tier: CleanlinessTier): "matched" | "likely_clean" {
  return tier === "tier_1" || tier === "tier_2" ? "likely_clean" : "matched";
}

function findCorridorForJob(
  job: GoogleTextSearchJob,
  corridors: HighwaySearchCorridor[],
): HighwaySearchCorridor | undefined {
  return corridors.find(
    (corridor) => corridor.highwayName === job.expectedHighwayContext && corridor.routeContext === job.expectedRouteContext,
  );
}