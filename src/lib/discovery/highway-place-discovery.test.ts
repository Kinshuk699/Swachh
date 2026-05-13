import { describe, expect, it } from "vitest";

import {
  buildHighwayPlacesSearchJobs,
  classifyCleanToiletCandidate,
  dedupeDiscoveredHighwayPlaces,
  filterHighwayPlaceMatches,
  googleTextSearchFieldMask,
  isRelevantGooglePlaceCandidate,
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
      cleanlinessTier: "tier_1",
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

  it("can scope proxy-brand searches to specific corridors", () => {
    const jobs = buildHighwayPlacesSearchJobs({
      proxyBrands: [
        {
          brandName: "Delhi Mumbai Expressway wayside amenity",
          region: "North & West India",
          proxyType: "wayside_amenity",
          defaultConfidence: 0.9,
          notes: "Official Delhi-Mumbai Expressway wayside amenity search target",
          corridorIds: ["delhi-mumbai-expressway"],
        },
      ],
      curatedStopCandidates: [],
      corridors: [
        {
          id: "delhi-mumbai-expressway",
          highwayName: "Delhi-Mumbai Expressway",
          routeContext: "Delhi-Mumbai",
          region: "North & West India",
          anchors: [
            { latitude: 28.2, longitude: 76.85, radiusMeters: 30_000 },
            { latitude: 26.91, longitude: 76.34, radiusMeters: 30_000 },
          ],
          polyline: [
            { latitude: 28.2, longitude: 76.85 },
            { latitude: 26.91, longitude: 76.34 },
          ],
        },
        {
          id: "nh44-krishnagiri",
          highwayName: "NH-44",
          routeContext: "Krishnagiri toll plaza",
          region: "South India",
          anchors: [{ latitude: 12, longitude: 78, radiusMeters: 30_000 }],
          polyline: [
            { latitude: 12, longitude: 78 },
            { latitude: 12, longitude: 78.1 },
          ],
        },
      ],
    });

    expect(jobs).toHaveLength(2);
    expect(jobs.every((job) => job.expectedRouteContext === "Delhi-Mumbai")).toBe(true);
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

  it("classifies generic fuel searches as tier 3 fallback stops", () => {
    const jobs = buildHighwayPlacesSearchJobs({
      proxyBrands: [
        {
          brandName: "Petrol Pump",
          region: "Pan-India",
          proxyType: "fuel_station",
          defaultConfidence: 0.62,
          notes: "Generic highway fuel fallback for restroom availability",
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

    expect(jobs[0]).toMatchObject({
      seedName: "Petrol Pump",
      cleanlinessTier: "tier_3",
      sourceCategory: "generic_candidate",
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

  it("rejects unrelated fuzzy name matches before assigning official wayside labels", () => {
    const matches = filterHighwayPlaceMatches({
      job: {
        id: "job-cube-stop-ahmedabad",
        sourceKind: "proxy_brand",
        textQuery: "Cube Stop Sarkhej-Gandhinagar Highway Ahmedabad-Gandhinagar India",
        seedName: "Cube Stop",
        expectedHighwayContext: "Sarkhej-Gandhinagar Highway",
        expectedRouteContext: "Ahmedabad-Gandhinagar",
        region: "West India",
        proxyType: "wayside_amenity",
        confidence: 0.9,
        cleanlinessTier: "tier_1",
        sourceCategory: "official_wayside_amenity",
        sourceEvidence: "Cube Highways amenity with dedicated Wash Stop",
        pageSize: 10,
        regionCode: "IN",
        fieldMask: googleTextSearchFieldMask,
      },
      corridor: {
        id: "sg-highway",
        highwayName: "Sarkhej-Gandhinagar Highway",
        routeContext: "Ahmedabad-Gandhinagar",
        region: "West India",
        anchors: [],
        polyline: [
          { latitude: 23.02, longitude: 72.5 },
          { latitude: 23.14, longitude: 72.54 },
        ],
      },
      places: [
        {
          id: "icecube-seo-agency",
          displayName: { text: "Icecube Digital" },
          location: { latitude: 23.04, longitude: 72.506 },
          types: ["marketing_agency"],
        },
        {
          id: "valid-cube-stop",
          displayName: { text: "Cube Stop Washroom" },
          location: { latitude: 23.05, longitude: 72.51 },
          types: ["rest_stop"],
        },
      ],
      maxDiversionMeters: 2_000,
    });

    expect(matches.map((match) => match.placeId)).toEqual(["valid-cube-stop"]);
    expect(matches[0]).toMatchObject({
      cleanlinessTier: "tier_1",
      sourceCategory: "official_wayside_amenity",
    });
  });
});

describe("isRelevantGooglePlaceCandidate", () => {
  it("accepts generic fuel search results by Google gas station type", () => {
    expect(
      isRelevantGooglePlaceCandidate({
        seedName: "Petrol Pump",
        proxyType: "fuel_station",
        placeName: "IndianOil",
        types: ["gas_station", "point_of_interest", "establishment"],
      }),
    ).toBe(true);
  });

  it("keeps trusted seed families broad enough for manual review", () => {
    expect(
      isRelevantGooglePlaceCandidate({
        seedName: "Indian Oil Swagat",
        proxyType: "fuel_cafe",
        placeName: "IndianOil",
        types: ["gas_station"],
      }),
    ).toBe(true);

    expect(
      isRelevantGooglePlaceCandidate({
        seedName: "Indian Oil Swagat",
        proxyType: "fuel_cafe",
        placeName: "IndianOil Swagat Retail Outlet",
        types: ["gas_station"],
      }),
    ).toBe(true);

    expect(
      isRelevantGooglePlaceCandidate({
        seedName: "Indian Oil COCO",
        proxyType: "fuel_station",
        placeName: "Indian Oil Petrol Pump",
        types: ["gas_station"],
      }),
    ).toBe(true);

    expect(
      isRelevantGooglePlaceCandidate({
        seedName: "PATH Recharge",
        proxyType: "wayside_amenity",
        placeName: "Wankhar Entomology Museum",
        types: ["museum"],
      }),
    ).toBe(true);

    expect(
      isRelevantGooglePlaceCandidate({
        seedName: "Lavato",
        proxyType: "premium_lavatory",
        placeName: "National Highway 19",
        types: ["route"],
      }),
    ).toBe(true);

    expect(
      isRelevantGooglePlaceCandidate({
        seedName: "BPCL Ghar",
        proxyType: "wayside_amenity",
        placeName: "Bharat Petrol Pump",
        types: ["gas_station"],
      }),
    ).toBe(true);

    expect(
      isRelevantGooglePlaceCandidate({
        seedName: "BPCL Ghar",
        proxyType: "wayside_amenity",
        placeName: "Bharat Petroleum COCO Outlet Krishnagiri",
        types: ["gas_station"],
      }),
    ).toBe(true);

    expect(
      isRelevantGooglePlaceCandidate({
        seedName: "BPCL Ghar",
        proxyType: "wayside_amenity",
        placeName: "Govindpur Block Office",
        types: ["government_office"],
      }),
    ).toBe(false);

    expect(
      isRelevantGooglePlaceCandidate({
        seedName: "BPCL Ghar",
        proxyType: "wayside_amenity",
        placeName: "Ghar",
        types: ["gas_station"],
      }),
    ).toBe(false);
  });

  it("uses first-word Shell matching instead of rejecting Shell outlet variants", () => {
    expect(
      isRelevantGooglePlaceCandidate({
        seedName: "Shell Select",
        proxyType: "fuel_cafe",
        placeName: "Shell Select Digital Marketing",
        types: ["marketing_agency"],
      }),
    ).toBe(true);

    expect(
      isRelevantGooglePlaceCandidate({
        seedName: "Shell Select",
        proxyType: "fuel_cafe",
        placeName: "Shell Select",
        types: ["gas_station", "convenience_store"],
      }),
    ).toBe(true);

    expect(
      isRelevantGooglePlaceCandidate({
        seedName: "Shell Select",
        proxyType: "fuel_cafe",
        placeName: "Shell Petrol Pump",
        types: ["gas_station", "convenience_store"],
      }),
    ).toBe(true);

    expect(
      isRelevantGooglePlaceCandidate({
        seedName: "Shell Select",
        proxyType: "fuel_cafe",
        placeName: "Shell Helix Car Care",
        types: ["car_repair"],
      }),
    ).toBe(true);

    expect(
      isRelevantGooglePlaceCandidate({
        seedName: "Shell Select",
        proxyType: "fuel_cafe",
        placeName: "Sea Shell Restaurant",
        types: ["restaurant"],
      }),
    ).toBe(false);

    expect(
      isRelevantGooglePlaceCandidate({
        seedName: "Shell Cafe",
        proxyType: "fuel_cafe",
        placeName: "Shell Cafe",
        types: ["cafe"],
      }),
    ).toBe(true);

    expect(
      isRelevantGooglePlaceCandidate({
        seedName: "Shell Cafe",
        proxyType: "fuel_cafe",
        placeName: "Shell Deli2go",
        types: ["cafe"],
      }),
    ).toBe(true);

    expect(
      isRelevantGooglePlaceCandidate({
        seedName: "Shell Select",
        proxyType: "fuel_cafe",
        placeName: "Shell Select Fashion Store",
        types: ["store"],
      }),
    ).toBe(true);

    expect(
      isRelevantGooglePlaceCandidate({
        seedName: "Shell Cafe",
        proxyType: "fuel_cafe",
        placeName: "Chill Cafe",
        types: ["cafe"],
      }),
    ).toBe(false);
  });

  it("keeps only Cube Stop style matches for Cube seeds", () => {
    expect(
      isRelevantGooglePlaceCandidate({
        seedName: "Cube Stop",
        proxyType: "wayside_amenity",
        placeName: "Cube Stop Washroom",
        types: ["rest_stop"],
      }),
    ).toBe(true);

    expect(
      isRelevantGooglePlaceCandidate({
        seedName: "Cube Stop",
        proxyType: "wayside_amenity",
        placeName: "M Cube Practical Classes",
        types: ["school"],
      }),
    ).toBe(false);

    expect(
      isRelevantGooglePlaceCandidate({
        seedName: "Cube Stop",
        proxyType: "wayside_amenity",
        placeName: "Icecube Digital",
        types: ["service"],
      }),
    ).toBe(false);

    expect(
      isRelevantGooglePlaceCandidate({
        seedName: "Cube Stop",
        proxyType: "wayside_amenity",
        placeName: "Cube Digital",
        types: ["service"],
      }),
    ).toBe(false);
  });

  it("keeps short distinctive fuel-brand tokens in the match", () => {
    expect(
      isRelevantGooglePlaceCandidate({
        seedName: "Jio-bp",
        proxyType: "fuel_cafe",
        placeName: "My Jio Store",
        types: ["store"],
      }),
    ).toBe(false);

    expect(
      isRelevantGooglePlaceCandidate({
        seedName: "Jio-bp",
        proxyType: "fuel_cafe",
        placeName: "Jio",
        types: ["store"],
      }),
    ).toBe(false);

    expect(
      isRelevantGooglePlaceCandidate({
        seedName: "Jio-bp",
        proxyType: "fuel_cafe",
        placeName: "JIO BP FUEL STATION",
        types: ["gas_station"],
      }),
    ).toBe(true);

    expect(
      isRelevantGooglePlaceCandidate({
        seedName: "Club HP",
        proxyType: "fuel_station",
        placeName: "Club Health Plus Store",
        types: ["gas_station"],
      }),
    ).toBe(false);

    expect(
      isRelevantGooglePlaceCandidate({
        seedName: "Club HP",
        proxyType: "fuel_station",
        placeName: "Club HP Fuel Station",
        types: ["gas_station"],
      }),
    ).toBe(true);

    expect(
      isRelevantGooglePlaceCandidate({
        seedName: "Wild Bean Cafe",
        proxyType: "fuel_cafe",
        placeName: "Busy Beans",
        types: ["cafe"],
      }),
    ).toBe(false);

    expect(
      isRelevantGooglePlaceCandidate({
        seedName: "Wild Bean Cafe",
        proxyType: "fuel_cafe",
        placeName: "Wildbean cafe",
        types: ["cafe"],
      }),
    ).toBe(true);
  });

  it("keeps broad Reliance and Nayara fuel seeds from matching non-fuel businesses", () => {
    expect(
      isRelevantGooglePlaceCandidate({
        seedName: "Reliance",
        proxyType: "fuel_station",
        placeName: "Reliance Petroleum",
        types: ["gas_station"],
      }),
    ).toBe(true);

    expect(
      isRelevantGooglePlaceCandidate({
        seedName: "Reliance",
        proxyType: "fuel_station",
        placeName: "Reliance Digital",
        types: ["electronics_store"],
      }),
    ).toBe(false);

    expect(
      isRelevantGooglePlaceCandidate({
        seedName: "Reliance",
        proxyType: "fuel_station",
        placeName: "Reliance Bio Energy Complex",
        types: ["manufacturer", "point_of_interest", "establishment"],
      }),
    ).toBe(false);

    expect(
      isRelevantGooglePlaceCandidate({
        seedName: "Nayara Energy",
        proxyType: "fuel_station",
        placeName: "Nayara Petrol Pump",
        types: ["gas_station"],
      }),
    ).toBe(true);

    expect(
      isRelevantGooglePlaceCandidate({
        seedName: "Nayara Energy",
        proxyType: "fuel_station",
        placeName: "Nayara Fashion",
        types: ["clothing_store"],
      }),
    ).toBe(false);
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
        "Highway Nest",
        "Highway Nest Mini",
        "Highway Village",
        "Shell Select",
        "Indian Oil Swagat",
        "BPCL Ghar",
        "Jio-bp",
        "Cube Stop",
        "Delhi Mumbai Expressway wayside amenity",
        "Agra Lucknow Expressway amenities",
        "Bundelkhand Expressway amenities",
        "NHAI Wayside Amenities",
        "HPCL Focus Outlet",
        "BPCL Pure for Sure Platinum",
        "MP Tourism Highway Treat",
      ]),
    );
    expect(curatedStopCandidates.map((candidate) => candidate.name)).toEqual(
      expect.arrayContaining([
        "Lavato",
        "Highway Nest Mini Toll Plaza",
        "Yamuna Expressway service area",
        "Delhi Mumbai Expressway rest area",
        "Gargi Surya Vihar",
        "National Highway Dhaba",
        "Raha Highway Dhabas",
      ]),
    );
  });

  it("classifies the new official Tier 1 seed families as wayside amenities", () => {
    expect(
      [
        "Highway Nest",
        "Highway Nest Mini",
        "Highway Village",
        "Delhi Mumbai Expressway wayside amenity",
        "Agra Lucknow Expressway amenities",
        "Bundelkhand Expressway amenities",
      ].map((seedName) => classifyCleanToiletCandidate({ seedName, proxyType: "wayside_amenity" })),
    ).toEqual(
      expect.arrayContaining([
        { cleanlinessTier: "tier_1", sourceCategory: "official_wayside_amenity", sourceEvidence: "Highway Nest" },
        { cleanlinessTier: "tier_1", sourceCategory: "official_wayside_amenity", sourceEvidence: "Highway Nest Mini" },
        { cleanlinessTier: "tier_1", sourceCategory: "official_wayside_amenity", sourceEvidence: "Highway Village" },
      ]),
    );
  });

  it("classifies premium fuel programs as Tier 1 and generic fuel operators as Tier 3 fallbacks", () => {
    expect(
      ["Reliance", "Nayara Energy", "HPCL Focus Outlet", "Club HP"].map((seedName) =>
        classifyCleanToiletCandidate({ seedName, proxyType: "fuel_station" }),
      ),
    ).toEqual(
      expect.arrayContaining([
        { cleanlinessTier: "tier_3", sourceCategory: "generic_candidate", sourceEvidence: "Reliance" },
        { cleanlinessTier: "tier_3", sourceCategory: "generic_candidate", sourceEvidence: "Nayara Energy" },
        { cleanlinessTier: "tier_1", sourceCategory: "premium_fuel_program", sourceEvidence: "HPCL Focus Outlet" },
        { cleanlinessTier: "tier_1", sourceCategory: "premium_fuel_program", sourceEvidence: "Club HP" },
      ]),
    );
  });

  it("has corridor coverage for every Tier 1 curated stop", () => {
    const corridorKeys = new Set(
      highwaySearchCorridors.map((corridor) => `${corridor.highwayName}::${corridor.routeContext}`),
    );
    const tierOneCuratedStopsWithoutCorridors = curatedStopCandidates
      .filter((candidate) => classifyCleanToiletCandidate({ seedName: candidate.name, proxyType: candidate.proxyType }).cleanlinessTier === "tier_1")
      .filter((candidate) => !corridorKeys.has(`${candidate.highwayContext}::${candidate.routeContext}`))
      .map((candidate) => candidate.name);

    expect(tierOneCuratedStopsWithoutCorridors).toEqual([]);
  });

  it("has corridor coverage for staged Tier 3 curated road stops", () => {
    const stagedTierThreeCuratedStops = new Set([
      "Amaravathi Savera Group",
      "Big Bay India",
      "City Residency",
      "Gallops Food Plaza",
      "Gargi Surya Vihar",
      "Greenhouse",
      "Hotel Highway King Bagru",
      "Hotel Highway King Kishangarh",
      "Hotel Highway King Neemrana",
      "Hotel Highway King Shahpura",
      "Hotel Ummiya Annapurna Kathiyawad",
      "Jai Bhuvaneswari Miltry Hotel",
      "Mother's Kitchen",
      "SN Highway Food Mall",
    ]);
    const corridorKeys = new Set(
      highwaySearchCorridors.map((corridor) => `${corridor.highwayName}::${corridor.routeContext}`),
    );
    const stagedTierThreeCuratedStopsWithoutCorridors = curatedStopCandidates
      .filter((candidate) => stagedTierThreeCuratedStops.has(candidate.name))
      .filter((candidate) => classifyCleanToiletCandidate({ seedName: candidate.name, proxyType: candidate.proxyType }).cleanlinessTier === "tier_3")
      .filter((candidate) => !corridorKeys.has(`${candidate.highwayContext}::${candidate.routeContext}`))
      .map((candidate) => candidate.name);

    expect(stagedTierThreeCuratedStopsWithoutCorridors).toEqual([]);
  });

  it("expands into enough bounded Google searches to discover a national 1500-place candidate set", () => {
    const jobs = buildHighwayPlacesSearchJobs({ proxyBrands, curatedStopCandidates, corridors: highwaySearchCorridors });

    expect(jobs.length).toBeGreaterThanOrEqual(1_500);
    expect(jobs.every((job) => job.regionCode === "IN")).toBe(true);
  });
});