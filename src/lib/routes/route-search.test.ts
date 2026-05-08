import { describe, expect, it } from "vitest";

import { buildRouteSearchResponse } from "./route-search";

describe("buildRouteSearchResponse", () => {
  it("withholds stop results for a dense city query without trip context", () => {
    const response = buildRouteSearchResponse({
      origin: "Bandra West, Mumbai",
      destination: "",
      highwayName: "",
      isInsideCity: true,
      distanceToHighwayMeters: 9_000,
    });

    expect(response.intent.mode).toBe("ask-for-trip");
    expect(response.stops).toEqual([]);
  });

  it("returns highway-ranked stops when the traveler supplies a destination", () => {
    const response = buildRouteSearchResponse({
      origin: "Mumbai",
      destination: "Pune",
      highwayName: "",
      isInsideCity: true,
      distanceToHighwayMeters: 9_000,
    });

    expect(response.intent.mode).toBe("plan-route");
    expect(response.stops.length).toBeGreaterThan(0);
    const ids = response.stops.map((s) => s.id);
    expect(ids).toEqual(expect.arrayContaining(["shree-datta-snacks"]));
    expect(response.stops.every((stop) => stop.distanceFromHighwayMeters <= 2_000 || stop.isEndpointStagingArea)).toBe(true);
  });

  it("returns curated seeded stops for Hyderabad-Vijayawada / NH-65 route", () => {
    const response = buildRouteSearchResponse({
      origin: "Hyderabad",
      destination: "Vijayawada",
      highwayName: "NH-65",
      isInsideCity: false,
      distanceToHighwayMeters: 500,
    });

    expect(response.intent.mode).toBe("plan-route");
    const ids = response.stops.map((s) => s.id);
    expect(ids).toEqual(expect.arrayContaining(["7-midway-plaza", "raju-gari-thota"]));
  });
});
