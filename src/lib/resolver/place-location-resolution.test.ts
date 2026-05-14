import { describe, expect, it } from "vitest";

import { resolvePlaceLocation, toPlaceLocationResolutionRow } from "./place-location-resolution";

const googleReference = { latitude: 12.5732978, longitude: 78.1692122 };

describe("place location resolution", () => {
  it("auto-approves a strong OSM and Overture agreement", () => {
    const resolution = resolvePlaceLocation({
      curatedPlace: baseCuratedPlace(),
      googleReference,
      osmCandidates: [baseOsmCandidate({ latitude: 12.5737478, longitude: 78.1692122 })],
      overtureCandidates: [baseOvertureCandidate({ latitude: 12.5737578, longitude: 78.1692122 })],
      googleWeekdayDescriptions: ["Monday: Open 24 hours"],
    });

    expect(resolution.status).toBe("auto_approved");
    expect(resolution.coordinateSource).toBe("osm_overture");
    expect(resolution.openingHours).toBe("24/7");
  });

  it("auto-approves a strong Overture-only match without opening-hours claims", () => {
    const resolution = resolvePlaceLocation({
      curatedPlace: baseCuratedPlace(),
      googleReference,
      osmCandidates: [],
      overtureCandidates: [baseOvertureCandidate({ latitude: 12.5737478, longitude: 78.1692122 })],
      googleWeekdayDescriptions: ["Monday: Open 24 hours"],
    });

    expect(resolution.status).toBe("auto_approved");
    expect(resolution.coordinateSource).toBe("overture");
    expect(resolution.openingHours).toBeNull();
    expect(resolution.openingHoursGoogleValidationStatus).toBe("osm_missing");
  });

  it("keeps 200-300m matches for review", () => {
    const resolution = resolvePlaceLocation({
      curatedPlace: baseCuratedPlace(),
      googleReference,
      osmCandidates: [baseOsmCandidate({ latitude: 12.5755478, longitude: 78.1692122 })],
      overtureCandidates: [],
      googleWeekdayDescriptions: [],
    });

    expect(resolution.status).toBe("needs_review");
    expect(resolution.reviewReason).toBe("weak_distance_200_300m");
  });

  it("keeps over-300m matches for review rather than rejecting", () => {
    const resolution = resolvePlaceLocation({
      curatedPlace: baseCuratedPlace(),
      googleReference,
      osmCandidates: [baseOsmCandidate({ latitude: 12.5782978, longitude: 78.1692122 })],
      overtureCandidates: [],
      googleWeekdayDescriptions: [],
    });

    expect(resolution.status).toBe("needs_review");
    expect(resolution.reviewReason).toBe("distance_over_300m");
  });

  it("builds a Supabase row without Google coordinate or raw Google hours", () => {
    const resolution = resolvePlaceLocation({
      curatedPlace: baseCuratedPlace(),
      googleReference,
      osmCandidates: [baseOsmCandidate({ latitude: 12.5737478, longitude: 78.1692122 })],
      overtureCandidates: [],
      googleWeekdayDescriptions: ["Monday: Open 24 hours"],
    });

    const row = toPlaceLocationResolutionRow(resolution);

    expect(row).toMatchObject({
      google_curated_place_id: "curated-1",
      google_place_id: "google-place-1",
      coordinate_source: "osm",
      opening_hours: "24/7",
    });
    expect(JSON.stringify(row)).not.toContain("googleReference");
    expect(JSON.stringify(row)).not.toContain("Monday: Open 24 hours");
  });
});

function baseCuratedPlace() {
  return {
    id: "curated-1",
    googlePlaceId: "google-place-1",
    seedName: "Lavato Krishnagiri",
    sourceCategory: "premium_restroom",
    cleanlinessTier: "tier_1",
    highwayName: "NH-44",
    routeContext: "Krishnagiri toll plaza",
  } as const;
}

function baseOsmCandidate(location: { latitude: number; longitude: number }) {
  return {
    source: "osm",
    sourceId: "node/123",
    name: "Lavato Krishnagiri",
    categories: ["toilets", "rest_area"],
    openingHours: "24/7",
    latitude: location.latitude,
    longitude: location.longitude,
  } as const;
}

function baseOvertureCandidate(location: { latitude: number; longitude: number }) {
  return {
    source: "overture",
    sourceId: "overture-123",
    name: "Lavato Krishnagiri",
    categories: ["restroom"],
    confidence: 0.91,
    operatingStatus: "open",
    latitude: location.latitude,
    longitude: location.longitude,
  } as const;
}