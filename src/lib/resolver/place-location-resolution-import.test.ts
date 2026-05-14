import { describe, expect, it, vi } from "vitest";

import { resolvePlaceLocationBatch } from "./place-location-resolution-import";

describe("place location resolution import", () => {
  it("resolves a batch with mocked Google details and compact source candidates", async () => {
    const getPlaceDetails = vi.fn(async () => ({
      id: "google-place-1",
      displayName: "Lavato Krishnagiri",
      location: { latitude: 12.5732978, longitude: 78.1692122 },
      types: ["public_bathroom"],
      weekdayDescriptions: ["Monday: Open 24 hours"],
    }));

    const summary = await resolvePlaceLocationBatch({
      googleMode: "assisted",
      maxGoogleDetailsRequests: 1,
      getPlaceDetails,
      curatedPlaces: [
        {
          id: "curated-1",
          googlePlaceId: "google-place-1",
          seedName: "Lavato Krishnagiri",
          sourceCategory: "premium_restroom",
          cleanlinessTier: "tier_1",
          highwayName: "NH-44",
          routeContext: "Krishnagiri toll plaza",
        },
      ],
      osmCandidates: [
        {
          source: "osm",
          sourceId: "node/1",
          name: "Lavato Krishnagiri",
          latitude: 12.5737478,
          longitude: 78.1692122,
          categories: ["toilets"],
          openingHours: "24/7",
        },
      ],
      overtureCandidates: [],
    });

    expect(summary).toMatchObject({
      googleDetailsRequests: 1,
      resolvedRows: 1,
      mapReadyRows: 1,
      reviewRows: 0,
    });
    expect(summary.rows[0]).toMatchObject({
      google_place_id: "google-place-1",
      opening_hours: "24/7",
      opening_hours_google_validation_status: "agrees",
    });
  });

  it("respects the Google Details cap", async () => {
    await expect(
      resolvePlaceLocationBatch({
        googleMode: "assisted",
        maxGoogleDetailsRequests: 0,
        getPlaceDetails: vi.fn(),
        curatedPlaces: [
          {
            id: "curated-1",
            googlePlaceId: "google-place-1",
            seedName: "Lavato Krishnagiri",
            sourceCategory: "premium_restroom",
            cleanlinessTier: "tier_1",
            highwayName: "NH-44",
            routeContext: "Krishnagiri toll plaza",
          },
        ],
        osmCandidates: [],
        overtureCandidates: [],
      }),
    ).rejects.toThrow("Google-assisted resolver batch exceeds cap");
  });
});