import { describe, expect, it } from "vitest";

import {
  classifyTravelerIntent,
  filterHighwayRelevantStops,
  rankHighwayStops,
  type CandidateStop,
} from "./highway-relevance";

describe("classifyTravelerIntent", () => {
  it("asks city users for a destination instead of showing generic city toilets", () => {
    const intent = classifyTravelerIntent({
      isInsideCity: true,
      distanceToHighwayMeters: 8_500,
      hasDestination: false,
      hasHighwayName: false,
    });

    expect(intent.mode).toBe("ask-for-trip");
    expect(intent.requiresTripContext).toBe(true);
  });

  it("allows route planning when a city user provides a destination", () => {
    const intent = classifyTravelerIntent({
      isInsideCity: true,
      distanceToHighwayMeters: 8_500,
      hasDestination: true,
      hasHighwayName: false,
    });

    expect(intent.mode).toBe("plan-route");
    expect(intent.requiresTripContext).toBe(false);
  });

  it("allows current-corridor search when the user is already near a highway", () => {
    const intent = classifyTravelerIntent({
      isInsideCity: false,
      distanceToHighwayMeters: 700,
      hasDestination: false,
      hasHighwayName: false,
    });

    expect(intent.mode).toBe("current-corridor");
    expect(intent.requiresTripContext).toBe(false);
  });
});

describe("filterHighwayRelevantStops", () => {
  const candidates: CandidateStop[] = [
    {
      id: "city-mall-restroom",
      name: "City Center Mall Restroom",
      category: "public_restroom",
      distanceFromRouteMeters: 6_500,
      distanceFromHighwayMeters: 8_000,
      detourMinutes: 22,
      isEndpointStagingArea: false,
      isInsideDenseCity: true,
      source: "crowdsourced",
      confidence: 0.75,
      openNow: true,
      verified: true,
    },
    {
      id: "toll-plaza-block",
      name: "NH48 Toll Plaza Restroom",
      category: "toll_plaza",
      distanceFromRouteMeters: 220,
      distanceFromHighwayMeters: 120,
      detourMinutes: 3,
      isEndpointStagingArea: false,
      isInsideDenseCity: false,
      source: "crowdsourced",
      confidence: 0.82,
      openNow: true,
      verified: true,
    },
    {
      id: "exit-food-plaza",
      name: "Expressway Exit Food Plaza",
      category: "food_plaza",
      distanceFromRouteMeters: 1_250,
      distanceFromHighwayMeters: 900,
      detourMinutes: 8,
      isEndpointStagingArea: false,
      isInsideDenseCity: false,
      source: "google_place",
      confidence: 0.68,
      openNow: true,
      verified: false,
    },
    {
      id: "endpoint-fuel-station",
      name: "City Edge Fuel Station",
      category: "fuel_station",
      distanceFromRouteMeters: 2_700,
      distanceFromHighwayMeters: 1_500,
      detourMinutes: 10,
      isEndpointStagingArea: true,
      isInsideDenseCity: true,
      source: "google_place",
      confidence: 0.7,
      openNow: false,
      verified: false,
    },
  ];

  it("keeps on-route, highway, and endpoint-staging stops while suppressing dense city results", () => {
    const filtered = filterHighwayRelevantStops(candidates);

    expect(filtered.map((stop) => stop.id)).toEqual([
      "toll-plaza-block",
      "exit-food-plaza",
      "endpoint-fuel-station",
    ]);
  });
});

describe("rankHighwayStops", () => {
  it("prioritizes verified, open, low-detour highway stops", () => {
    const ranked = rankHighwayStops([
      {
        id: "closed-proxy",
        name: "Closed Food Plaza",
        category: "food_plaza",
        distanceFromRouteMeters: 400,
        distanceFromHighwayMeters: 350,
        detourMinutes: 4,
        isEndpointStagingArea: false,
        isInsideDenseCity: false,
        source: "google_place",
        confidence: 0.7,
        openNow: false,
        verified: false,
      },
      {
        id: "verified-toll",
        name: "Verified Toll Restroom",
        category: "toll_plaza",
        distanceFromRouteMeters: 650,
        distanceFromHighwayMeters: 120,
        detourMinutes: 5,
        isEndpointStagingArea: false,
        isInsideDenseCity: false,
        source: "crowdsourced",
        confidence: 0.92,
        openNow: true,
        verified: true,
      },
      {
        id: "far-open-proxy",
        name: "Far Open Restaurant",
        category: "restaurant_proxy",
        distanceFromRouteMeters: 2_400,
        distanceFromHighwayMeters: 2_200,
        detourMinutes: 19,
        isEndpointStagingArea: false,
        isInsideDenseCity: false,
        source: "google_place",
        confidence: 0.62,
        openNow: true,
        verified: false,
      },
    ]);

    expect(ranked.map((stop) => stop.id)).toEqual([
      "verified-toll",
      "closed-proxy",
      "far-open-proxy",
    ]);
  });
});
