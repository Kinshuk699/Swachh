import { describe, expect, it } from "vitest";

import type { GoogleTextSearchJob, HighwaySearchCorridor } from "./highway-place-discovery";
import {
  discoverGoogleCuratedPlaces,
  filterAcceptedGoogleCuratedPlaceRowsForUpsert,
  filterGoogleCuratedPlaceJobs,
  planGoogleCuratedPlaceDiscovery,
  toGoogleCuratedPlaceRows,
  toRejectedGoogleCuratedPlaceRows,
} from "./google-curated-place-import";

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
  it("defaults planned imports to a 2 km highway diversion window", () => {
    const plan = planGoogleCuratedPlaceDiscovery({
      corridors: [corridor],
      jobs: [job({ id: "near" })],
    });

    expect(plan.maxDiversionMeters).toBe(2_000);
  });

  it("plans a strict-distance import without executing Google searches", () => {
    const plan = planGoogleCuratedPlaceDiscovery({
      corridors: [corridor],
      jobs: [job({ id: "near" }), job({ id: "missing-corridor", expectedRouteContext: "Missing route" })],
      maxDiversionMeters: 750,
      maxTextSearchRequests: 1,
    });

    expect(plan).toEqual({
      totalJobs: 2,
      plannedJobs: 2,
      jobOffset: 0,
      plannedTextSearchRequests: 1,
      missingCorridorJobs: 1,
      maxDiversionMeters: 750,
      maxTextSearchRequests: 1,
      textSearchCapExceeded: false,
    });
  });

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
            types: ["public_bathroom", "point_of_interest", "establishment"],
          },
          {
            id: "too-far-away",
            location: { latitude: 12.4, longitude: 78.5 },
            displayName: { text: "City-only place" },
            types: ["public_bathroom", "point_of_interest", "establishment"],
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

  it("can resume imports after a job offset without repeating earlier searches", async () => {
    const searchedJobIds: string[] = [];
    const result = await discoverGoogleCuratedPlaces({
      apiKey: "server-key",
      corridors: [corridor],
      jobOffset: 1,
      jobLimit: 1,
      jobs: [job({ id: "first" }), job({ id: "second" }), job({ id: "third" })],
      searchTextPlaces: async (googleJob) => {
        searchedJobIds.push(googleJob.id);
        return { places: [] };
      },
    });

    expect(result).toMatchObject({ totalJobs: 3, searchedJobs: 1 });
    expect(searchedJobIds).toEqual(["second"]);
  });

  it("aborts before Google calls when planned text searches exceed the request cap", async () => {
    const searchedJobIds: string[] = [];

    await expect(
      discoverGoogleCuratedPlaces({
        apiKey: "server-key",
        corridors: [corridor],
        maxTextSearchRequests: 1,
        jobs: [job({ id: "first" }), job({ id: "second" })],
        searchTextPlaces: async (googleJob) => {
          searchedJobIds.push(googleJob.id);
          return { places: [] };
        },
      }),
    ).rejects.toThrow("Planned Google Places Text Search requests exceed cap: planned=2 cap=1");

    expect(searchedJobIds).toEqual([]);
  });

  it("keeps highway-adjacent rejected Google matches for manual review", async () => {
    const result = await discoverGoogleCuratedPlaces({
      apiKey: "server-key",
      corridors: [corridor],
      jobs: [job({ id: "cube", seedName: "Cube Stop", confidence: 0.9, proxyType: "wayside_amenity" })],
      searchTextPlaces: async () => ({
        places: [
          {
            id: "good-cube-place-id",
            location: { latitude: 12.0005, longitude: 78.01 },
            displayName: { text: "Cube Stop Washroom" },
            types: ["rest_stop", "point_of_interest", "establishment"],
          },
          {
            id: "bad-cube-place-id",
            location: { latitude: 12.0007, longitude: 78.012 },
            displayName: { text: "Icecube Digital" },
            types: ["service", "point_of_interest", "establishment"],
          },
        ],
      }),
    });

    expect(result.places.map((place) => place.placeId)).toEqual(["good-cube-place-id"]);
    expect(result.rejectedPlaces).toHaveLength(1);
    expect(result.rejectedPlaces[0]).toMatchObject({
      placeId: "bad-cube-place-id",
      seedName: "Cube Stop",
      cleanlinessTier: "tier_1",
      sourceCategory: "official_wayside_amenity",
      rejectionReason: "seed_name_mismatch",
    });
  });
});

describe("filterGoogleCuratedPlaceJobs", () => {
  it("filters import jobs by tier and seed name before Google calls", () => {
    const jobs = [
      job({ id: "tier-1-lavato", seedName: "Lavato", cleanlinessTier: "tier_1" }),
      job({ id: "tier-1-highway-nest", seedName: "Highway Nest Mini", cleanlinessTier: "tier_1" }),
      job({ id: "tier-2-shell", seedName: "Shell Select", cleanlinessTier: "tier_2" }),
    ];

    expect(filterGoogleCuratedPlaceJobs(jobs, { cleanlinessTiers: ["tier_1"] }).map((googleJob) => googleJob.id)).toEqual([
      "tier-1-lavato",
      "tier-1-highway-nest",
    ]);
    expect(filterGoogleCuratedPlaceJobs(jobs, { seedNames: ["highway nest mini"] }).map((googleJob) => googleJob.id)).toEqual([
      "tier-1-highway-nest",
    ]);
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
          cleanlinessTier: "tier_1",
          sourceCategory: "premium_restroom",
          sourceEvidence: "Premium AC lavatory",
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
        cleanliness_tier: "tier_1",
        source_category: "premium_restroom",
        source_evidence: "Premium AC lavatory",
        highway_name: "NH-44",
        route_context: "Krishnagiri toll plaza",
        locality_hint: null,
        restroom_confidence: 0.95,
        distance_from_highway_meters: 90,
        local_notes: "Premium AC lavatory",
        verification_status: "likely_clean",
        matched_at: "2026-05-10T00:00:00.000Z",
        updated_at: "2026-05-10T00:00:00.000Z",
      },
    ]);
    expect(Object.keys(rows[0])).not.toContain("display_name");
    expect(Object.keys(rows[0])).not.toContain("opening_hours");
  });

  it("marks rejected Google matches without storing resolved Google fields", () => {
    const rows = toRejectedGoogleCuratedPlaceRows(
      [
        {
          placeId: "bad-cube-place-id",
          seedName: "Cube Stop",
          highwayContext: "NH-44",
          routeContext: "Krishnagiri toll plaza",
          region: "South India",
          proxyType: "wayside_amenity",
          confidence: 0.9,
          distanceFromHighwayMeters: 120,
          source: "google_places_text_search",
          cleanlinessTier: "tier_1",
          sourceCategory: "official_wayside_amenity",
          sourceEvidence: "Cube Highways amenity with dedicated Wash Stop",
          localNotes: "Cube Highways amenity with dedicated Wash Stop",
          rejectionReason: "seed_name_mismatch",
        },
      ],
      "2026-05-11T00:00:00.000Z",
    );

    expect(rows).toEqual([
      expect.objectContaining({
        google_place_id: "bad-cube-place-id",
        seed_name: "Cube Stop",
        cleanliness_tier: "tier_1",
        source_category: "official_wayside_amenity",
        verification_status: "rejected",
        local_notes: "Rejected false-positive Google match: seed did not match resolved place name | Cube Highways amenity with dedicated Wash Stop",
      }),
    ]);
    expect(Object.keys(rows[0])).not.toContain("display_name");
    expect(Object.keys(rows[0])).not.toContain("types");
  });
});

describe("filterAcceptedGoogleCuratedPlaceRowsForUpsert", () => {
  it("keeps lower-tier accepted rows from overwriting stronger existing rows", () => {
    const timestamp = "2026-05-11T00:00:00.000Z";
    const tierOneRow = toGoogleCuratedPlaceRows(
      [
        {
          placeId: "same-place-id",
          seedName: "Highway Nest",
          highwayContext: "NH-44",
          routeContext: "Toll plaza",
          region: "South India",
          proxyType: "wayside_amenity",
          confidence: 0.9,
          distanceFromHighwayMeters: 120,
          source: "google_places_text_search",
          cleanlinessTier: "tier_1",
          sourceCategory: "official_wayside_amenity",
          sourceEvidence: "Highway Nest",
        },
      ],
      timestamp,
    )[0];
    const tierTwoRow = toGoogleCuratedPlaceRows(
      [
        {
          placeId: "same-place-id",
          seedName: "Nayara Energy",
          highwayContext: "NH-44",
          routeContext: "Toll plaza",
          region: "South India",
          proxyType: "fuel_station",
          confidence: 0.78,
          distanceFromHighwayMeters: 110,
          source: "google_places_text_search",
          cleanlinessTier: "tier_2",
          sourceCategory: "premium_fuel_program",
          sourceEvidence: "Nayara Energy",
        },
      ],
      timestamp,
    )[0];

    expect(filterAcceptedGoogleCuratedPlaceRowsForUpsert([tierTwoRow], [tierOneRow])).toEqual([]);
    expect(filterAcceptedGoogleCuratedPlaceRowsForUpsert([tierOneRow], [tierTwoRow])).toEqual([tierOneRow]);
  });

  it("preserves manually verified rows from automated import churn", () => {
    const timestamp = "2026-05-11T00:00:00.000Z";
    const incomingRow = toGoogleCuratedPlaceRows(
      [
        {
          placeId: "manual-place-id",
          seedName: "Nayara Energy",
          highwayContext: "NH-44",
          routeContext: "Toll plaza",
          region: "South India",
          proxyType: "fuel_station",
          confidence: 0.78,
          distanceFromHighwayMeters: 110,
          source: "google_places_text_search",
          cleanlinessTier: "tier_2",
          sourceCategory: "premium_fuel_program",
          sourceEvidence: "Nayara Energy",
        },
      ],
      timestamp,
    )[0];

    expect(
      filterAcceptedGoogleCuratedPlaceRowsForUpsert([incomingRow], [
        { ...incomingRow, verification_status: "approved" },
      ]),
    ).toEqual([]);
  });
});