import { distanceMeters, type LatLng } from "./geo.ts";
import { normalizeOpeningHours } from "./opening-hours-validation.ts";

export type CuratedPlaceForResolution = {
  id: string;
  seedName: string;
  sourceCategory: string;
  cleanlinessTier: string;
  highwayName: string;
  routeContext: string | null;
};

export type OpeningHoursSource = "osm" | "overture" | null;

export type OsmCandidate = LatLng & {
  source: "osm";
  sourceId: string;
  name: string;
  categories: readonly string[];
  openingHours?: string | null;
};

export type OvertureCandidate = LatLng & {
  source: "overture";
  sourceId: string;
  name: string;
  categories: readonly string[];
  confidence?: number;
  operatingStatus?: string;
  openingHours?: string | null;
};

type OpenSourceCandidate = OsmCandidate | OvertureCandidate;

export type PlaceLocationResolution = {
  curatedPlace: CuratedPlaceForResolution;
  status: "auto_approved" | "needs_review" | "rejected";
  reviewReason: string | null;
  coordinateSource: "osm" | "overture" | "osm_overture";
  coordinateSourceId: string;
  coordinateSourceLabel: string;
  coordinateConfidence: number;
  latitude: number;
  longitude: number;
  openSourceAgreementMeters: number | null;
  openingHours: string | null;
  openingHoursSource: OpeningHoursSource;
  openingHoursSourceId: string | null;
};

export type PlaceLocationResolutionRow = {
  google_curated_place_id: string;
  latitude: number;
  longitude: number;
  coordinate_source: PlaceLocationResolution["coordinateSource"];
  coordinate_source_id: string;
  coordinate_source_label: string;
  coordinate_confidence: number;
  open_source_agreement_meters: number | null;
  resolution_status: PlaceLocationResolution["status"];
  rejection_reason: string | null;
  opening_hours: string | null;
  opening_hours_source: OpeningHoursSource;
  opening_hours_source_id: string | null;
};

export function resolvePlaceLocation(input: {
  curatedPlace: CuratedPlaceForResolution;
  osmCandidates: readonly OsmCandidate[];
  overtureCandidates: readonly OvertureCandidate[];
}): PlaceLocationResolution {
  const bestPair = findBestOpenSourcePair(input.osmCandidates, input.overtureCandidates);

  if (bestPair) {
    const hours = openingHoursFor(bestPair.osm, bestPair.overture);
    const status = bestPair.agreementMeters <= 200
      ? { status: "auto_approved" as const, reason: null }
      : { status: "needs_review" as const, reason: "open_source_disagreement_over_200m" };

    return {
      curatedPlace: input.curatedPlace,
      status: status.status,
      reviewReason: status.reason,
      coordinateSource: "osm_overture",
      coordinateSourceId: `${bestPair.osm.sourceId}|${bestPair.overture.sourceId}`,
      coordinateSourceLabel: bestPair.osm.name,
      coordinateConfidence: confidenceForAgreement(bestPair.agreementMeters),
      latitude: bestPair.osm.latitude,
      longitude: bestPair.osm.longitude,
      openSourceAgreementMeters: bestPair.agreementMeters,
      openingHours: hours.value,
      openingHoursSource: hours.source,
      openingHoursSourceId: hours.sourceId,
    };
  }

  const bestOsm = input.osmCandidates[0] ?? null;

  if (bestOsm) {
    const hours = openingHoursFor(bestOsm, null);

    return {
      curatedPlace: input.curatedPlace,
      status: "needs_review",
      reviewReason: "single_source_osm",
      coordinateSource: "osm",
      coordinateSourceId: bestOsm.sourceId,
      coordinateSourceLabel: bestOsm.name,
      coordinateConfidence: 0.6,
      latitude: bestOsm.latitude,
      longitude: bestOsm.longitude,
      openSourceAgreementMeters: null,
      openingHours: hours.value,
      openingHoursSource: hours.source,
      openingHoursSourceId: hours.sourceId,
    };
  }

  const bestOverture = input.overtureCandidates[0] ?? null;

  if (bestOverture) {
    const hours = openingHoursFor(null, bestOverture);

    return {
      curatedPlace: input.curatedPlace,
      status: "needs_review",
      reviewReason: "single_source_overture",
      coordinateSource: "overture",
      coordinateSourceId: bestOverture.sourceId,
      coordinateSourceLabel: bestOverture.name,
      coordinateConfidence: 0.55,
      latitude: bestOverture.latitude,
      longitude: bestOverture.longitude,
      openSourceAgreementMeters: null,
      openingHours: hours.value,
      openingHoursSource: hours.source,
      openingHoursSourceId: hours.sourceId,
    };
  }

  throw new Error(`No OSM or Overture candidate found for ${input.curatedPlace.id}`);
}

export function toPlaceLocationResolutionRow(resolution: PlaceLocationResolution): PlaceLocationResolutionRow {
  return {
    google_curated_place_id: resolution.curatedPlace.id,
    latitude: resolution.latitude,
    longitude: resolution.longitude,
    coordinate_source: resolution.coordinateSource,
    coordinate_source_id: resolution.coordinateSourceId,
    coordinate_source_label: resolution.coordinateSourceLabel,
    coordinate_confidence: resolution.coordinateConfidence,
    open_source_agreement_meters: resolution.openSourceAgreementMeters,
    resolution_status: resolution.status,
    rejection_reason: resolution.reviewReason,
    opening_hours: resolution.openingHours,
    opening_hours_source: resolution.openingHoursSource,
    opening_hours_source_id: resolution.openingHoursSourceId,
  };
}

function findBestOpenSourcePair(
  osmCandidates: readonly OsmCandidate[],
  overtureCandidates: readonly OvertureCandidate[],
): { osm: OsmCandidate; overture: OvertureCandidate; agreementMeters: number } | null {
  const pairs = osmCandidates.flatMap((osm) =>
    overtureCandidates.map((overture) => ({
      osm,
      overture,
      agreementMeters: distanceMeters(osm, overture),
    })),
  );

  return pairs.sort((left, right) => left.agreementMeters - right.agreementMeters)[0] ?? null;
}

function openingHoursFor(
  osm: OsmCandidate | null,
  overture: OvertureCandidate | null,
): { value: string | null; source: OpeningHoursSource; sourceId: string | null } {
  const osmOpeningHours = normalizeOpeningHours(osm?.openingHours);

  if (osmOpeningHours && osm) {
    return { value: osmOpeningHours, source: "osm", sourceId: osm.sourceId };
  }

  const overtureOpeningHours = normalizeOpeningHours(overture?.openingHours);

  if (overtureOpeningHours && overture) {
    return { value: overtureOpeningHours, source: "overture", sourceId: overture.sourceId };
  }

  return { value: null, source: null, sourceId: null };
}

function confidenceForAgreement(agreementMeters: number): number {
  if (agreementMeters <= 50) {
    return 0.95;
  }

  if (agreementMeters <= 100) {
    return 0.9;
  }

  if (agreementMeters <= 200) {
    return 0.75;
  }

  return 0.45;
}

export function candidateMatchesCuratedPlace(candidate: OpenSourceCandidate, curatedPlace: CuratedPlaceForResolution): boolean {
  const candidateName = normalizeForMatch(candidate.name);
  const seedName = normalizeForMatch(curatedPlace.seedName);

  if (!candidateName || !seedName) {
    return false;
  }

  if (candidateName.includes(seedName) || seedName.includes(candidateName)) {
    return true;
  }

  const candidateTokens = new Set(candidateName.split(" "));
  const seedTokens = seedName.split(" ");
  const overlappingTokens = seedTokens.filter((token) => candidateTokens.has(token)).length;

  return overlappingTokens / seedTokens.length >= 0.5;
}

function normalizeForMatch(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}
