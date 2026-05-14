import {
  candidateMatchesCuratedPlace,
  resolvePlaceLocation,
  toPlaceLocationResolutionRow,
  type CuratedPlaceForResolution,
  type OsmCandidate,
  type OvertureCandidate,
  type PlaceLocationResolutionRow,
} from "./place-location-resolution.ts";

export type ResolvePlaceLocationBatchSummary = {
  googleDetailsRequests: 0;
  resolvedRows: number;
  mapReadyRows: number;
  reviewRows: number;
  unresolvedRows: number;
  rows: PlaceLocationResolutionRow[];
  unresolved: Array<{ curatedPlaceId: string; reason: string }>;
};

export async function resolvePlaceLocationBatch(input: {
  curatedPlaces: readonly CuratedPlaceForResolution[];
  osmCandidates: readonly OsmCandidate[];
  overtureCandidates: readonly OvertureCandidate[];
}): Promise<ResolvePlaceLocationBatchSummary> {
  const rows: PlaceLocationResolutionRow[] = [];
  const unresolved: Array<{ curatedPlaceId: string; reason: string }> = [];

  for (const curatedPlace of input.curatedPlaces) {
    const osmCandidates = input.osmCandidates.filter((candidate) => candidateMatchesCuratedPlace(candidate, curatedPlace));
    const overtureCandidates = input.overtureCandidates.filter((candidate) => candidateMatchesCuratedPlace(candidate, curatedPlace));

    try {
      const resolution = resolvePlaceLocation({
        curatedPlace,
        osmCandidates,
        overtureCandidates,
      });
      rows.push(toPlaceLocationResolutionRow(resolution));
    } catch (error) {
      unresolved.push({
        curatedPlaceId: curatedPlace.id,
        reason: error instanceof Error ? error.message : "unknown_resolution_error",
      });
    }
  }

  return {
    googleDetailsRequests: 0,
    resolvedRows: rows.length,
    mapReadyRows: rows.filter((row) => row.resolution_status === "auto_approved").length,
    reviewRows: rows.filter((row) => row.resolution_status === "needs_review").length,
    unresolvedRows: unresolved.length,
    rows,
    unresolved,
  };
}
