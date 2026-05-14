import { getPlaceDetails as defaultGetPlaceDetails, type GooglePlaceDetails } from "../google/places.ts";
import { distanceMeters } from "./geo.ts";
import {
  resolvePlaceLocation,
  toPlaceLocationResolutionRow,
  type CuratedPlaceForResolution,
  type OsmCandidate,
  type OvertureCandidate,
  type PlaceLocationResolutionRow,
} from "./place-location-resolution.ts";

type GetPlaceDetails = (placeId: string) => Promise<GooglePlaceDetails>;

export type ResolvePlaceLocationBatchSummary = {
  googleDetailsRequests: number;
  resolvedRows: number;
  mapReadyRows: number;
  reviewRows: number;
  unresolvedRows: number;
  rows: PlaceLocationResolutionRow[];
  unresolved: Array<{ googlePlaceId: string; reason: string }>;
};

export async function resolvePlaceLocationBatch(input: {
  googleMode: "assisted";
  maxGoogleDetailsRequests: number;
  apiKey?: string;
  getPlaceDetails?: GetPlaceDetails;
  curatedPlaces: readonly CuratedPlaceForResolution[];
  osmCandidates: readonly OsmCandidate[];
  overtureCandidates: readonly OvertureCandidate[];
}): Promise<ResolvePlaceLocationBatchSummary> {
  if (input.curatedPlaces.length > input.maxGoogleDetailsRequests) {
    throw new Error(
      `Google-assisted resolver batch exceeds cap: rows=${input.curatedPlaces.length} cap=${input.maxGoogleDetailsRequests}`,
    );
  }

  const getPlaceDetails = input.getPlaceDetails ?? createDefaultGetPlaceDetails(input.apiKey);
  const rows: PlaceLocationResolutionRow[] = [];
  const unresolved: Array<{ googlePlaceId: string; reason: string }> = [];

  for (const curatedPlace of input.curatedPlaces) {
    const details = await getPlaceDetails(curatedPlace.googlePlaceId);

    if (!details.location) {
      unresolved.push({ googlePlaceId: curatedPlace.googlePlaceId, reason: "google_reference_missing_location" });
      continue;
    }

    const googleReference = details.location;
    const nearbyOsm = input.osmCandidates.filter((candidate) => distanceMeters(googleReference, candidate) <= 1_000);
    const nearbyOverture = input.overtureCandidates.filter(
      (candidate) => distanceMeters(googleReference, candidate) <= 1_000,
    );

    try {
      const resolution = resolvePlaceLocation({
        curatedPlace,
        googleReference,
        osmCandidates: nearbyOsm,
        overtureCandidates: nearbyOverture,
        googleWeekdayDescriptions: details.weekdayDescriptions,
      });
      rows.push(toPlaceLocationResolutionRow(resolution));
    } catch (error) {
      unresolved.push({
        googlePlaceId: curatedPlace.googlePlaceId,
        reason: error instanceof Error ? error.message : "unknown_resolution_error",
      });
    }
  }

  return {
    googleDetailsRequests: input.curatedPlaces.length,
    resolvedRows: rows.length,
    mapReadyRows: rows.filter((row) => row.resolution_status === "auto_approved").length,
    reviewRows: rows.filter((row) => row.resolution_status === "needs_review").length,
    unresolvedRows: unresolved.length,
    rows,
    unresolved,
  };
}

function createDefaultGetPlaceDetails(apiKey: string | undefined): GetPlaceDetails {
  return async (placeId: string) => {
    if (!apiKey) {
      throw new Error("GOOGLE_MAPS_SERVER_API_KEY is required for Google-assisted resolver mode.");
    }

    return defaultGetPlaceDetails(placeId, { apiKey });
  };
}