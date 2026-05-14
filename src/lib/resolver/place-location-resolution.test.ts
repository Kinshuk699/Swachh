import { describe, expect, it } from "vitest";

import { resolvePlaceLocation, toPlaceLocationResolutionRow } from "./place-location-resolution";

describe("place location resolution", () => {
  it("auto-approves a strong OSM and Overture coordinate agreement without Google", () => {
    const resolution = resolvePlaceLocation({
      curatedPlace: baseCuratedPlace(),
      osmCandidates: [baseOsmCandidate({ latitude: 12.5737478, longitude: 78.1692122 })],
      overtureCandidates: [baseOvertureCandidate({ latitude: 12.5737578, longitude: 78.1692122 })],
    });

    expect(resolution.status).toBe("auto_approved");
    expect(resolution.coordinateSource).toBe("osm_overture");
    expect(resolution.openingHours).toBe("24/7");
    expect(resolution.openSourceAgreementMeters).toBeLessThan(5);
  });

  it("keeps single-source Overture coordinates for review without opening-hours claims", () => {
    const resolution = resolvePlaceLocation({
      curatedPlace: baseCuratedPlace(),
      osmCandidates: [],
      overtureCandidates: [baseOvertureCandidate({ latitude: 12.5737478, longitude: 78.1692122 })],
    });

    expect(resolution.status).toBe("needs_review");
    expect(resolution.reviewReason).toBe("single_source_overture");
    expect(resolution.coordinateSource).toBe("overture");
    expect(resolution.openingHours).toBeNull();
  });

  it("keeps OSM and Overture disagreements for review", () => {
    const resolution = resolvePlaceLocation({
      curatedPlace: baseCuratedPlace(),
      osmCandidates: [baseOsmCandidate({ latitude: 12.5737478, longitude: 78.1692122 })],
      overtureCandidates: [baseOvertureCandidate({ latitude: 12.5767478, longitude: 78.1692122 })],
    });

    expect(resolution.status).toBe("needs_review");
    expect(resolution.reviewReason).toBe("open_source_disagreement_over_200m");
  });

  it("uses Overture opening hours if supplied and OSM is missing", () => {
    const resolution = resolvePlaceLocation({
      curatedPlace: baseCuratedPlace(),
      osmCandidates: [],
      overtureCandidates: [
        { ...baseOvertureCandidate({ latitude: 12.5737478, longitude: 78.1692122 }), openingHours: "Mo-Su 08:00-22:00" },
      ],
    });

    expect(resolution.status).toBe("needs_review");
    expect(resolution.openingHours).toBe("Mo-Su 08:00-22:00");
    expect(resolution.openingHoursSource).toBe("overture");
  });

  it("builds a Supabase row without Google Place Details fields", () => {
    const resolution = resolvePlaceLocation({
      curatedPlace: baseCuratedPlace(),
      osmCandidates: [baseOsmCandidate({ latitude: 12.5737478, longitude: 78.1692122 })],
      overtureCandidates: [baseOvertureCandidate({ latitude: 12.5737578, longitude: 78.1692122 })],
    });

    const row = toPlaceLocationResolutionRow(resolution);

    expect(row).toMatchObject({
      google_curated_place_id: "curated-1",
      coordinate_source: "osm_overture",
      opening_hours: "24/7",
    });
    expect(JSON.stringify(row)).not.toContain("google_place_id");
    expect(JSON.stringify(row)).not.toContain("distance_to_google_reference_meters");
    expect(JSON.stringify(row)).not.toContain("opening_hours_google_validation_status");
  });
});

function baseCuratedPlace() {
  return {
    id: "curated-1",
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