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

  it("returns curated Mumbai-Pune highway stops when the traveler supplies a destination", () => {
    const response = buildRouteSearchResponse({
      origin: "Mumbai",
      destination: "Pune",
      highwayName: "Mumbai-Pune Expressway",
      isInsideCity: true,
      distanceToHighwayMeters: 9_000,
    });

    expect(response.intent.mode).toBe("plan-route");
    expect(response.stops.map((stop) => stop.name)).toContain("Shree Datta Snacks");
    expect(response.stops.every((stop) => stop.highway !== "None")).toBe(true);
    expect(response.stops.map((stop) => stop.name)).not.toContain("7 Midway Plaza");
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
    expect(response.stops.map((stop) => stop.name)).toEqual(
      expect.arrayContaining(["7 Midway Plaza", "Raju Gari Thota"]),
    );
    expect(response.stops.map((stop) => stop.name)).not.toContain("Shree Datta Snacks");
  });

  it("returns Lavato for NH-44 Krishnagiri toll-plaza route context", () => {
    const response = buildRouteSearchResponse({
      origin: "Bengaluru",
      destination: "Krishnagiri",
      highwayName: "NH-44",
      isInsideCity: true,
      distanceToHighwayMeters: 6_500,
    });

    expect(response.stops.map((stop) => stop.name)).toContain("Lavato");
  });

  it("returns Hotel Highway King for NH-48 Delhi-Jaipur route context", () => {
    const response = buildRouteSearchResponse({
      origin: "Delhi",
      destination: "Jaipur",
      highwayName: "NH-48",
      isInsideCity: true,
      distanceToHighwayMeters: 7_500,
    });

    expect(response.stops.map((stop) => stop.name)).toContain("Hotel Highway King");
  });
});
