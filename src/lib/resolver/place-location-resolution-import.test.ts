import { describe, expect, it } from "vitest";

import { resolvePlaceLocationBatch } from "./place-location-resolution-import";

describe("place location resolution import", () => {
  it("resolves a batch from compact open-source candidates without Google details", async () => {
    const summary = await resolvePlaceLocationBatch({
      curatedPlaces: [
        {
          id: "curated-1",
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
      googleDetailsRequests: 0,
      resolvedRows: 1,
      mapReadyRows: 0,
      reviewRows: 1,
    });
    expect(summary.rows[0]).toMatchObject({
      opening_hours: "24/7",
      resolution_status: "needs_review",
    });
    expect(JSON.stringify(summary)).not.toContain("GOOGLE_MAPS_SERVER_API_KEY");
  });

  it("records unresolved rows without calling Google", async () => {
    const summary = await resolvePlaceLocationBatch({
      curatedPlaces: [
        {
          id: "curated-1",
          seedName: "Lavato Krishnagiri",
          sourceCategory: "premium_restroom",
          cleanlinessTier: "tier_1",
          highwayName: "NH-44",
          routeContext: "Krishnagiri toll plaza",
        },
      ],
      osmCandidates: [],
      overtureCandidates: [],
    });

    expect(summary).toMatchObject({
      googleDetailsRequests: 0,
      unresolvedRows: 1,
    });
    expect(summary.unresolved[0]).toMatchObject({ curatedPlaceId: "curated-1" });
  });
});