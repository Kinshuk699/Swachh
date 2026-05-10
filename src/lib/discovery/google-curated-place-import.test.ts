import { describe, expect, it } from "vitest";

import type { GoogleTextSearchJob, HighwaySearchCorridor } from "./highway-place-discovery";
import { discoverGoogleCuratedPlaces, toGoogleCuratedPlaceRows } from "./google-curated-place-import";

const corridor: HighwaySearchCorridor = {
  id: "nh44-krishnagiri",
  highwayName: "NH-44",
  routeContext: "Krishnagiri toll plaza",
  region: "South India",
  anchors: [{ latitude: 12, longitude: 78, radiusMeters: 30_000 }],
  polyline: [
    { latitude: 12, longitude: 78 },
    { latitude: 12, longitude: 78.1 },
  ],
};

function job(overrides: Partial<GoogleTextSearchJob>): GoogleTextSearchJob {
  return {
    id: "job-1",
    sourceKind: "proxy_brand",
    textQuery: "Lavato NH-44 Krishnagiri toll plaza India",
    seedName: "Lavato",
    expectedHighwayContext: "NH-44",
    expectedRouteContext: "Krishnagiri toll plaza",
    region: "South India",
    proxyType: "premium_lavatory",
    confidence: 0.95,
    notes: "Premium AC lavatory",
    pageSize: 10,
    regionCode: "IN",
    fieldMask: "places.id,places.name,places.location,places.displayName,places.types",
    locationBias: { circle: { center: { latitude: 12, longitude: 78 }, radius: 30_000 } },
    ...overrides,
  };
}

describe("discoverGoogleCuratedPlaces", () => {
  it("filters Google results to the highway corridor and dedupes by place_id", async () => {
    const result = await discoverGoogleCuratedPlaces({
      apiKey: "server-key",
      corridors: [corridor],
      jobs: [
        job({ id: "generic", seedName: "Generic Fuel", confidence: 0.65, proxyType: "fuel_station" }),
        job({ id: "lavato", seedName: "Lavato", confidence: 0.95, proxyType: "premium_lavatory" }),
      ],
      searchTextPlaces: async () => ({
        places: [
          {
            id: "same-google-place-id",
            location: { latitude: 12.0005, longitude: 78.01 },
            displayName: { text: "LAVATO - A Premium Lounge" },
          },
          {
            id: "too-far-away",
            location: { latitude: 12.4, longitude: 78.5 },
            displayName: { text: "City-only place" },
          },
        ],
      }),
    });

    expect(result).toMatchObject({ totalJobs: 2, searchedJobs: 2, missingCorridorJobs: 0, failedJobs: 0 });
    expect(result.places).toHaveLength(1);
    expect(result.places[0]).toMatchObject({
      placeId: "same-google-place-id",
      seedName: "Lavato",
      confidence: 0.95,
      proxyType: "premium_lavatory",
    });
  });

  it("can cap searched jobs for a low-cost dry run", async () => {
    const searchedJobIds: string[] = [];
    const result = await discoverGoogleCuratedPlaces({
      apiKey: "server-key",
      corridors: [corridor],
      jobLimit: 1,
      jobs: [job({ id: "first" }), job({ id: "second" })],
      searchTextPlaces: async (googleJob) => {
        searchedJobIds.push(googleJob.id);
        return { places: [] };
      },
    });

    expect(result).toMatchObject({ totalJobs: 2, searchedJobs: 1 });
    expect(searchedJobIds).toEqual(["first"]);
  });
});

describe("toGoogleCuratedPlaceRows", () => {
  it("keeps only the Google place_id plus app-owned highway annotations", () => {
    const rows = toGoogleCuratedPlaceRows(
      [
        {
          placeId: "google-place-id",
          seedName: "Lavato",
          highwayContext: "NH-44",
          routeContext: "Krishnagiri toll plaza",
          region: "South India",
          proxyType: "premium_lavatory",
          confidence: 0.95,
          distanceFromHighwayMeters: 90,
          source: "google_places_text_search",
          localNotes: "Premium AC lavatory",
        },
      ],
      "2026-05-10T00:00:00.000Z",
    );

    expect(rows).toEqual([
      {
        google_place_id: "google-place-id",
        seed_name: "Lavato",
        region: "South India",
        proxy_type: "premium_lavatory",
        highway_name: "NH-44",
        route_context: "Krishnagiri toll plaza",
        locality_hint: null,
        restroom_confidence: 0.95,
        distance_from_highway_meters: 90,
        local_notes: "Premium AC lavatory",
        verification_status: "matched",
        matched_at: "2026-05-10T00:00:00.000Z",
        updated_at: "2026-05-10T00:00:00.000Z",
      },
    ]);
    expect(Object.keys(rows[0])).not.toContain("display_name");
    expect(Object.keys(rows[0])).not.toContain("opening_hours");
  });
});