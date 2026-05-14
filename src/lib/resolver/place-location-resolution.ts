import { classifyReferenceDistance, distanceMeters, type LatLng } from "./geo.ts";
import {
  compareOsmHoursWithGoogle,
  normalizeOsmOpeningHours,
  type GoogleHoursValidationStatus,
} from "./opening-hours-validation.ts";

export type CuratedPlaceForResolution = {
  id: string;
  googlePlaceId: string;
  seedName: string;
  sourceCategory: string;
  cleanlinessTier: string;
  highwayName: string;
  routeContext: string | null;
};

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
};

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
  distanceToGoogleReferenceMeters: number;
  openSourceAgreementMeters: number | null;
  openingHours: string | null;
  openingHoursSource: "osm" | null;
  openingHoursSourceId: string | null;
  openingHoursGoogleValidationStatus: GoogleHoursValidationStatus;
};

export type PlaceLocationResolutionRow = {
  google_curated_place_id: string;
  google_place_id: string;
  latitude: number;
  longitude: number;
  coordinate_source: PlaceLocationResolution["coordinateSource"];
  coordinate_source_id: string;
  coordinate_source_label: string;
  coordinate_confidence: number;
  distance_to_google_reference_meters: number;
  open_source_agreement_meters: number | null;
  resolution_status: PlaceLocationResolution["status"];
  rejection_reason: string | null;
  opening_hours: string | null;
  opening_hours_source: "osm" | null;
  opening_hours_source_id: string | null;
  opening_hours_google_validation_status: GoogleHoursValidationStatus;
};

export function resolvePlaceLocation(input: {
  curatedPlace: CuratedPlaceForResolution;
  googleReference: LatLng;
  osmCandidates: readonly OsmCandidate[];
  overtureCandidates: readonly OvertureCandidate[];
  googleWeekdayDescriptions?: readonly string[];
}): PlaceLocationResolution {
  const bestOsm = nearestCandidate(input.googleReference, input.osmCandidates);
  const bestOverture = nearestCandidate(input.googleReference, input.overtureCandidates);

  if (bestOsm && bestOverture) {
    const agreementMeters = distanceMeters(bestOsm.candidate, bestOverture.candidate);
    const preferred = bestOsm.distanceMeters <= bestOverture.distanceMeters ? bestOsm : bestOverture;
    const status = statusForDistance(preferred.distanceMeters, agreementMeters <= 200);
    const osmOpeningHours = normalizeOsmOpeningHours(bestOsm.candidate.openingHours);

    return {
      curatedPlace: input.curatedPlace,
      status: status.status,
      reviewReason: status.reason,
      coordinateSource: "osm_overture",
      coordinateSourceId: `${bestOsm.candidate.sourceId}|${bestOverture.candidate.sourceId}`,
      coordinateSourceLabel: bestOsm.candidate.name,
      coordinateConfidence: confidenceFor(preferred.distanceMeters, agreementMeters),
      latitude: preferred.candidate.latitude,
      longitude: preferred.candidate.longitude,
      distanceToGoogleReferenceMeters: preferred.distanceMeters,
      openSourceAgreementMeters: agreementMeters,
      openingHours: osmOpeningHours,
      openingHoursSource: osmOpeningHours ? "osm" : null,
      openingHoursSourceId: osmOpeningHours ? bestOsm.candidate.sourceId : null,
      openingHoursGoogleValidationStatus: compareOsmHoursWithGoogle(
        bestOsm.candidate.openingHours,
        input.googleWeekdayDescriptions,
      ),
    };
  }

  if (bestOsm) {
    const status = statusForDistance(bestOsm.distanceMeters, false);
    const osmOpeningHours = normalizeOsmOpeningHours(bestOsm.candidate.openingHours);

    return {
      curatedPlace: input.curatedPlace,
      status: status.status,
      reviewReason: status.reason,
      coordinateSource: "osm",
      coordinateSourceId: bestOsm.candidate.sourceId,
      coordinateSourceLabel: bestOsm.candidate.name,
      coordinateConfidence: confidenceFor(bestOsm.distanceMeters, null),
      latitude: bestOsm.candidate.latitude,
      longitude: bestOsm.candidate.longitude,
      distanceToGoogleReferenceMeters: bestOsm.distanceMeters,
      openSourceAgreementMeters: null,
      openingHours: osmOpeningHours,
      openingHoursSource: osmOpeningHours ? "osm" : null,
      openingHoursSourceId: osmOpeningHours ? bestOsm.candidate.sourceId : null,
      openingHoursGoogleValidationStatus: compareOsmHoursWithGoogle(
        bestOsm.candidate.openingHours,
        input.googleWeekdayDescriptions,
      ),
    };
  }

  if (bestOverture) {
    const status = statusForDistance(bestOverture.distanceMeters, false);

    return {
      curatedPlace: input.curatedPlace,
      status: status.status,
      reviewReason: status.reason,
      coordinateSource: "overture",
      coordinateSourceId: bestOverture.candidate.sourceId,
      coordinateSourceLabel: bestOverture.candidate.name,
      coordinateConfidence: confidenceFor(bestOverture.distanceMeters, null),
      latitude: bestOverture.candidate.latitude,
      longitude: bestOverture.candidate.longitude,
      distanceToGoogleReferenceMeters: bestOverture.distanceMeters,
      openSourceAgreementMeters: null,
      openingHours: null,
      openingHoursSource: null,
      openingHoursSourceId: null,
      openingHoursGoogleValidationStatus: "osm_missing",
    };
  }

  throw new Error(`No OSM or Overture candidate found for ${input.curatedPlace.googlePlaceId}`);
}

export function toPlaceLocationResolutionRow(resolution: PlaceLocationResolution): PlaceLocationResolutionRow {
  return {
    google_curated_place_id: resolution.curatedPlace.id,
    google_place_id: resolution.curatedPlace.googlePlaceId,
    latitude: resolution.latitude,
    longitude: resolution.longitude,
    coordinate_source: resolution.coordinateSource,
    coordinate_source_id: resolution.coordinateSourceId,
    coordinate_source_label: resolution.coordinateSourceLabel,
    coordinate_confidence: resolution.coordinateConfidence,
    distance_to_google_reference_meters: resolution.distanceToGoogleReferenceMeters,
    open_source_agreement_meters: resolution.openSourceAgreementMeters,
    resolution_status: resolution.status,
    rejection_reason: resolution.reviewReason,
    opening_hours: resolution.openingHours,
    opening_hours_source: resolution.openingHoursSource,
    opening_hours_source_id: resolution.openingHoursSourceId,
    opening_hours_google_validation_status: resolution.openingHoursGoogleValidationStatus,
  };
}

function nearestCandidate<T extends LatLng>(
  reference: LatLng,
  candidates: readonly T[],
): { candidate: T; distanceMeters: number } | null {
  return (
    candidates
      .map((candidate) => ({ candidate, distanceMeters: distanceMeters(reference, candidate) }))
      .sort((left, right) => left.distanceMeters - right.distanceMeters)[0] ?? null
  );
}

function statusForDistance(
  distanceFromGoogleMeters: number,
  hasOpenSourceAgreement: boolean,
): { status: "auto_approved" | "needs_review"; reason: string | null } {
  const band = classifyReferenceDistance(distanceFromGoogleMeters);

  if (band === "excellent" || band === "strong") {
    return { status: "auto_approved", reason: null };
  }

  if (band === "acceptable" && hasOpenSourceAgreement) {
    return { status: "auto_approved", reason: null };
  }

  if (band === "acceptable") {
    return { status: "needs_review", reason: "acceptable_distance_without_open_source_agreement" };
  }

  if (band === "weak_review") {
    return { status: "needs_review", reason: "weak_distance_200_300m" };
  }

  return { status: "needs_review", reason: "distance_over_300m" };
}

function confidenceFor(distanceFromGoogleMeters: number, openSourceAgreementMeters: number | null): number {
  const distanceScore = Math.max(0, 1 - distanceFromGoogleMeters / 300);
  const agreementBonus =
    typeof openSourceAgreementMeters === "number" ? Math.max(0, 0.15 - openSourceAgreementMeters / 2_000) : 0;

  return Math.min(1, Number((distanceScore + agreementBonus).toFixed(3)));
}