import { describe, expect, it } from "vitest";

import {
  buildHighwayPlacesSearchJobs,
  dedupeDiscoveredHighwayPlaces,
  filterHighwayPlaceMatches,
  googleTextSearchFieldMask,
  toStoredCuratedPlaceReference,
} from "./highway-place-discovery";
import { curatedStopCandidates, highwaySearchCorridors, proxyBrands } from "./seed-catalog";

describe("buildHighwayPlacesSearchJobs", () => {
  it("turns brands and corridor anchors into bounded Google Places Text Search jobs", () => {
    const jobs = buildHighwayPlacesSearchJobs({
      proxyBrands: [
        {
          brandName: "Shell Select",
          region: "Pan-India",
          proxyType: "fuel_cafe",
          defaultConfidence: 0.78,
          notes: "Clean fuel station restroom proxy",
        },
      ],
      curatedStopCandidates: [],
      corridors: [
        {
          id: "nh44-krishnagiri",
          highwayName: "NH-44",
          routeContext: "Krishnagiri toll plaza",
          region: "South India",
          anchors: [{ latitude: 12.5186, longitude: 78.2137, radiusMeters: 30_000 }],
          polyline: [
            { latitude: 12.48, longitude: 78.18 },
            { latitude: 12.56, longitude: 78.25 },
          ],
        },
      ],
    });

    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toMatchObject({
      textQuery: "Shell Select NH-44 Krishnagiri toll plaza India",
      regionCode: "IN",
      pageSize: 10,
      fieldMask: googleTextSearchFieldMask,
      cleanlinessTier: "tier_2",
      sourceCategory: "premium_fuel_program",
      sourceEvidence: "Clean fuel station restroom proxy",
      locationBias: {
        circle: {
          center: { latitude: 12.5186, longitude: 78.2137 },
          radius: 30_000,
        },
      },
    });
  });

  it("turns curated stop hints into precise Google Places Text Search jobs", () => {
    const jobs = buildHighwayPlacesSearchJobs({
      proxyBrands: [],
      curatedStopCandidates: [
        {
          name: "Lavato",
          region: "South India",
          proxyType: "premium_lavatory",
          highwayContext: "NH-44",
          routeContext: "Krishnagiri toll plaza",
          localityHint: "Krishnagiri",
          defaultConfidence: 0.95,
          notes: "Premium AC lavatory near toll plaza",
        },
      ],
      corridors: [],
    });

    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toMatchObject({
      textQuery: "Lavato washroom NH-44 Krishnagiri toll plaza Krishnagiri India",
      sourceKind: "curated_stop",
      expectedHighwayContext: "NH-44",
      expectedRouteContext: "Krishnagiri toll plaza",
      confidence: 0.95,
    });
  });
});

describe("filterHighwayPlaceMatches", () => {
  it("keeps only places within the allowed highway diversion window", () => {
    const matches = filterHighwayPlaceMatches({
      job: {
        id: "job-1",
        sourceKind: "proxy_brand",
        textQuery: "Shell Select NH-44 Krishnagiri toll plaza India",
        seedName: "Shell Select",
        expectedHighwayContext: "NH-44",
        expectedRouteContext: "Krishnagiri toll plaza",
        region: "South India",
        proxyType: "fuel_cafe",
        confidence: 0.78,
        cleanlinessTier: "tier_2",
        sourceCategory: "premium_fuel_program",
        sourceEvidence: "Shell Select quality fuel/cafe proxy",
        pageSize: 10,
        regionCode: "IN",
        fieldMask: googleTextSearchFieldMask,
      },
      corridor: {
        id: "test-corridor",
        highwayName: "NH-44",
        routeContext: "Krishnagiri toll plaza",
        region: "South India",
        anchors: [],
        polyline: [
          { latitude: 12, longitude: 78 },
          { latitude: 12, longitude: 78.05 },
        ],
      },
      places: [
        {
          id: "valid-place",
          displayName: { text: "Shell Select Highway" },
          location: { latitude: 12.0008, longitude: 78.02 },
          types: ["gas_station", "restaurant"],
        },
        {
          id: "city-place",
          displayName: { text: "Shell Select City" },
          location: { latitude: 12.04, longitude: 78.02 },
          types: ["gas_station"],
        },
      ],
      maxDiversionMeters: 2_000,
    });

    expect(matches.map((match) => match.placeId)).toEqual(["valid-place"]);
    expect(matches[0]).toMatchObject({
      seedName: "Shell Select",
      highwayContext: "NH-44",
      routeContext: "Krishnagiri toll plaza",
      source: "google_places_text_search",
      cleanlinessTier: "tier_2",
      sourceCategory: "premium_fuel_program",
      sourceEvidence: "Shell Select quality fuel/cafe proxy",
    });
    expect(matches[0].distanceFromHighwayMeters).toBeLessThan(150);
  });
});

describe("dedupeDiscoveredHighwayPlaces", () => {
  it("dedupes by place_id and keeps the stronger highway-confidence match", () => {
    const deduped = dedupeDiscoveredHighwayPlaces([
      {
        placeId: "same-place",
        seedName: "Generic Fuel",
        highwayContext: "NH-44",
        routeContext: "Krishnagiri",
        region: "South India",
        proxyType: "fuel_station",
        confidence: 0.66,
        distanceFromHighwayMeters: 400,
        source: "google_places_text_search",
        localNotes: "Fallback fuel proxy",
      },
      {
        placeId: "same-place",
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
    ]);

    expect(deduped).toHaveLength(1);
    expect(deduped[0]).toMatchObject({ seedName: "Lavato", confidence: 0.95, distanceFromHighwayMeters: 90 });
  });
});

describe("toStoredCuratedPlaceReference", () => {
  it("stores only place_id plus app-owned highway annotations", () => {
    const stored = toStoredCuratedPlaceReference({
      placeId: "google-place-id",
      seedName: "Lavato",
      highwayContext: "NH-44",
      routeContext: "Krishnagiri toll plaza",
      region: "South India",
      proxyType: "premium_lavatory",
      confidence: 0.95,
      distanceFromHighwayMeters: 90,
      source: "google_places_text_search",
      localNotes: "Premium AC lavatory near toll plaza",
    });

    expect(stored).toEqual({
      placeId: "google-place-id",
      highwayContext: "NH-44",
      restroomConfidence: 0.95,
      localNotes: "Lavato | South India | Krishnagiri toll plaza | Premium AC lavatory near toll plaza",
    });
    expect(stored).not.toHaveProperty("displayName");
    expect(stored).not.toHaveProperty("location");
    expect(stored).not.toHaveProperty("rating");
  });
});

describe("seed catalog", () => {
  it("captures the expanded hygiene-proxy list and national highway search coverage", () => {
    expect(proxyBrands.length).toBeGreaterThanOrEqual(30);
    expect(curatedStopCandidates.length).toBeGreaterThanOrEqual(25);
    expect(highwaySearchCorridors.length).toBeGreaterThanOrEqual(12);

    expect(proxyBrands.map((brand) => brand.brandName)).toEqual(
      expect.arrayContaining([
        "Shell Select",
        "Indian Oil Swagat",
        "BPCL Ghar",
        "Jio-bp",
        "Cube Stop",
        "NHAI Wayside Amenities",
        "HPCL Focus Outlet",
        "BPCL Pure for Sure Platinum",
        "MP Tourism Highway Treat",
      ]),
    );
    expect(curatedStopCandidates.map((candidate) => candidate.name)).toEqual(
      expect.arrayContaining(["Lavato", "Gargi Surya Vihar", "National Highway Dhaba", "Raha Highway Dhabas"]),
    );
  });

  it("expands into enough bounded Google searches to discover a national 1500-place candidate set", () => {
    const jobs = buildHighwayPlacesSearchJobs({ proxyBrands, curatedStopCandidates, corridors: highwaySearchCorridors });

    expect(jobs.length).toBeGreaterThanOrEqual(1_500);
    expect(jobs.every((job) => job.regionCode === "IN")).toBe(true);
  });
});