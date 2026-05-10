import {
  buildHighwayPlacesSearchJobs,
  dedupeDiscoveredHighwayPlaces,
  filterHighwayPlaceMatches,
  type DiscoveredHighwayPlace,
  type GoogleTextSearchJob,
  type HighwaySearchCorridor,
} from "./highway-place-discovery.ts";
import { curatedStopCandidates, highwaySearchCorridors, proxyBrands } from "./seed-catalog.ts";
import { searchTextPlaces as defaultSearchTextPlaces, type GoogleTextSearchResponse } from "../google/places.ts";

export type GoogleCuratedPlaceImportRow = {
  google_place_id: string;
  seed_name: string;
  region: string;
  proxy_type: string;
  highway_name: string;
  route_context: string | null;
  locality_hint: string | null;
  restroom_confidence: number;
  distance_from_highway_meters: number;
  local_notes: string | null;
  verification_status: "matched";
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
  let searchedJobs = 0;
  let missingCorridorJobs = 0;

  for (const job of jobs) {
    const corridor = findCorridorForJob(job, corridors);

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
  return places.map((place) => ({
    google_place_id: place.placeId,
    seed_name: place.seedName,
    region: place.region,
    proxy_type: place.proxyType,
    highway_name: place.highwayContext,
    route_context: place.routeContext || null,
    locality_hint: null,
    restroom_confidence: place.confidence,
    distance_from_highway_meters: place.distanceFromHighwayMeters,
    local_notes: place.localNotes || null,
    verification_status: "matched",
    matched_at: timestamp,
    updated_at: timestamp,
  }));
}

function findCorridorForJob(
  job: GoogleTextSearchJob,
  corridors: HighwaySearchCorridor[],
): HighwaySearchCorridor | undefined {
  return corridors.find(
    (corridor) => corridor.highwayName === job.expectedHighwayContext && corridor.routeContext === job.expectedRouteContext,
  );
}