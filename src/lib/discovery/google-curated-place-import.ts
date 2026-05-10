import {
  buildHighwayPlacesSearchJobs,
  dedupeDiscoveredHighwayPlaces,
  getPlaceCleanToiletClassification,
  partitionHighwayPlaceMatches,
  type CleanlinessTier,
  type DiscoveredHighwayPlace,
  type GoogleTextSearchJob,
  type HighwaySearchCorridor,
  type RejectedDiscoveredHighwayPlace,
  type SourceCategory,
} from "./highway-place-discovery.ts";
import { curatedStopCandidates, highwaySearchCorridors, proxyBrands } from "./seed-catalog.ts";
import { searchTextPlaces as defaultSearchTextPlaces, type GoogleTextSearchResponse } from "../google/places.ts";

export type GoogleCuratedPlaceVerificationStatus = "matched" | "likely_clean" | "rejected" | "approved" | "verified_clean";

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
  verification_status: "matched" | "likely_clean" | "rejected";
  matched_at: string;
  updated_at: string;
};

export type ExistingGoogleCuratedPlaceRow = Pick<
  GoogleCuratedPlaceImportRow,
  "google_place_id" | "cleanliness_tier"
> & {
  verification_status: GoogleCuratedPlaceVerificationStatus;
};

export type GoogleCuratedPlaceDiscoverySummary = {
  totalJobs: number;
  searchedJobs: number;
  missingCorridorJobs: number;
  failedJobs: number;
  rawMatches: number;
  rawRejectedMatches: number;
  places: DiscoveredHighwayPlace[];
  rejectedPlaces: RejectedDiscoveredHighwayPlace[];
  failures: Array<{ jobId: string; message: string }>;
};

export type GoogleCuratedPlaceDiscoveryPlan = {
  totalJobs: number;
  plannedJobs: number;
  plannedTextSearchRequests: number;
  missingCorridorJobs: number;
  maxDiversionMeters: number;
  maxTextSearchRequests?: number;
  textSearchCapExceeded: boolean;
};

type SearchTextPlaces = (
  job: GoogleTextSearchJob,
  options: { apiKey: string },
) => Promise<GoogleTextSearchResponse>;

type GoogleCuratedPlaceDiscoveryPlanningInput = {
  jobs?: GoogleTextSearchJob[];
  corridors?: HighwaySearchCorridor[];
  jobLimit?: number;
  seedNames?: string[];
  cleanlinessTiers?: CleanlinessTier[];
  maxTextSearchRequests?: number;
  maxDiversionMeters?: number;
};

export function planGoogleCuratedPlaceDiscovery(input: GoogleCuratedPlaceDiscoveryPlanningInput = {}): GoogleCuratedPlaceDiscoveryPlan {
  const planning = buildGoogleCuratedPlaceDiscoveryPlanning(input);

  return planning.plan;
}

export async function discoverGoogleCuratedPlaces(input: {
  apiKey: string;
  jobs?: GoogleTextSearchJob[];
  corridors?: HighwaySearchCorridor[];
  jobLimit?: number;
  seedNames?: string[];
  cleanlinessTiers?: CleanlinessTier[];
  maxTextSearchRequests?: number;
  maxDiversionMeters?: number;
  searchTextPlaces?: SearchTextPlaces;
  onProgress?: (progress: { searchedJobs: number; totalJobs: number; matches: number; failures: number }) => void;
}): Promise<GoogleCuratedPlaceDiscoverySummary> {
  const { allJobs, jobs, plannedJobs, plan } = buildGoogleCuratedPlaceDiscoveryPlanning(input);
  const searchTextPlaces = input.searchTextPlaces ?? defaultSearchTextPlaces;
  const maxDiversionMeters = plan.maxDiversionMeters;
  const discoveredPlaces: DiscoveredHighwayPlace[] = [];
  const rejectedPlaces: RejectedDiscoveredHighwayPlace[] = [];
  const failures: Array<{ jobId: string; message: string }> = [];

  if (plan.textSearchCapExceeded) {
    throw new Error(
      `Planned Google Places Text Search requests exceed cap: planned=${plan.plannedTextSearchRequests} cap=${input.maxTextSearchRequests}`,
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
      const partitionedMatches = partitionHighwayPlaceMatches({ job, corridor, places: response.places, maxDiversionMeters });
      discoveredPlaces.push(...partitionedMatches.accepted);
      rejectedPlaces.push(...partitionedMatches.rejected);
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

  const places = dedupeDiscoveredHighwayPlaces(discoveredPlaces);
  const acceptedPlaceIds = new Set(places.map((place) => place.placeId));
  const rejectedPlacesWithoutAcceptedDuplicates = dedupeDiscoveredHighwayPlaces(rejectedPlaces).filter(
    (place) => !acceptedPlaceIds.has(place.placeId),
  );

  return {
    totalJobs: allJobs.length,
    searchedJobs,
    missingCorridorJobs,
    failedJobs: failures.length,
    rawMatches: discoveredPlaces.length,
    rawRejectedMatches: rejectedPlaces.length,
    places,
    rejectedPlaces: rejectedPlacesWithoutAcceptedDuplicates,
    failures,
  };
}

export function filterGoogleCuratedPlaceJobs(
  jobs: GoogleTextSearchJob[],
  filters: { seedNames?: string[]; cleanlinessTiers?: CleanlinessTier[] },
): GoogleTextSearchJob[] {
  const seedNames = new Set((filters.seedNames ?? []).map(normalizeFilterValue));
  const cleanlinessTiers = new Set(filters.cleanlinessTiers ?? []);

  return jobs.filter((job) => {
    const seedMatches = seedNames.size === 0 || seedNames.has(normalizeFilterValue(job.seedName));
    const tierMatches = cleanlinessTiers.size === 0 || (job.cleanlinessTier ? cleanlinessTiers.has(job.cleanlinessTier) : false);

    return seedMatches && tierMatches;
  });
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

export function toRejectedGoogleCuratedPlaceRows(
  places: RejectedDiscoveredHighwayPlace[],
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
      local_notes: compactJoin([rejectionNoteForReason(place.rejectionReason), place.localNotes], " | ") || null,
      verification_status: "rejected",
      matched_at: timestamp,
      updated_at: timestamp,
    };
  });
}

export function filterAcceptedGoogleCuratedPlaceRowsForUpsert(
  incomingRows: GoogleCuratedPlaceImportRow[],
  existingRows: ExistingGoogleCuratedPlaceRow[],
): GoogleCuratedPlaceImportRow[] {
  const existingByPlaceId = new Map(existingRows.map((row) => [row.google_place_id, row]));

  return incomingRows.filter((incomingRow) => shouldUpsertAcceptedRow(incomingRow, existingByPlaceId.get(incomingRow.google_place_id)));
}

function initialVerificationStatus(tier: CleanlinessTier): "matched" | "likely_clean" {
  return tier === "tier_1" || tier === "tier_2" ? "likely_clean" : "matched";
}

function shouldUpsertAcceptedRow(incomingRow: GoogleCuratedPlaceImportRow, existingRow: ExistingGoogleCuratedPlaceRow | undefined): boolean {
  if (!existingRow) {
    return true;
  }

  if (existingRow.verification_status === "approved" || existingRow.verification_status === "verified_clean") {
    return false;
  }

  if (cleanlinessTierRank(existingRow.cleanliness_tier) < cleanlinessTierRank(incomingRow.cleanliness_tier)) {
    return false;
  }

  if (
    existingRow.verification_status === "likely_clean" &&
    cleanlinessTierRank(existingRow.cleanliness_tier) <= cleanlinessTierRank(incomingRow.cleanliness_tier)
  ) {
    return false;
  }

  return true;
}

function cleanlinessTierRank(tier: CleanlinessTier): number {
  switch (tier) {
    case "tier_1":
      return 1;
    case "tier_2":
      return 2;
    case "tier_3":
      return 3;
    case "tier_4":
      return 4;
  }
}

function normalizeFilterValue(value: string): string {
  return value.trim().toLowerCase();
}

function buildGoogleCuratedPlaceDiscoveryPlanning(input: GoogleCuratedPlaceDiscoveryPlanningInput): {
  allJobs: GoogleTextSearchJob[];
  jobs: GoogleTextSearchJob[];
  plannedJobs: Array<{ job: GoogleTextSearchJob; corridor: HighwaySearchCorridor | undefined }>;
  plan: GoogleCuratedPlaceDiscoveryPlan;
} {
  const corridors = input.corridors ?? highwaySearchCorridors;
  const allJobs = filterGoogleCuratedPlaceJobs(input.jobs ?? buildHighwayPlacesSearchJobs({ proxyBrands, curatedStopCandidates, corridors }), {
    seedNames: input.seedNames,
    cleanlinessTiers: input.cleanlinessTiers,
  });
  const jobs = typeof input.jobLimit === "number" ? allJobs.slice(0, input.jobLimit) : allJobs;
  const plannedJobs = jobs.map((job) => ({ job, corridor: findCorridorForJob(job, corridors) }));
  const plannedTextSearchRequests = plannedJobs.filter((plannedJob) => plannedJob.corridor).length;
  const missingCorridorJobs = plannedJobs.length - plannedTextSearchRequests;
  const maxDiversionMeters = input.maxDiversionMeters ?? 2_000;

  return {
    allJobs,
    jobs,
    plannedJobs,
    plan: {
      totalJobs: allJobs.length,
      plannedJobs: jobs.length,
      plannedTextSearchRequests,
      missingCorridorJobs,
      maxDiversionMeters,
      maxTextSearchRequests: input.maxTextSearchRequests,
      textSearchCapExceeded: typeof input.maxTextSearchRequests === "number" && plannedTextSearchRequests > input.maxTextSearchRequests,
    },
  };
}

function rejectionNoteForReason(reason: RejectedDiscoveredHighwayPlace["rejectionReason"]): string {
  switch (reason) {
    case "seed_name_mismatch":
      return "Rejected false-positive Google match: seed did not match resolved place name";
  }
}

function compactJoin(parts: Array<string | null | undefined>, separator: string): string {
  return parts.filter((part): part is string => Boolean(part?.trim())).join(separator);
}

function findCorridorForJob(
  job: GoogleTextSearchJob,
  corridors: HighwaySearchCorridor[],
): HighwaySearchCorridor | undefined {
  return corridors.find(
    (corridor) => corridor.highwayName === job.expectedHighwayContext && corridor.routeContext === job.expectedRouteContext,
  );
}