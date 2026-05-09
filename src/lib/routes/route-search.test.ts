import { describe, expect, it } from "vitest";

import { buildRouteSearchResponse } from "./route-search";

describe("buildRouteSearchResponse", () => {
  it("returns seeded highway stops while still asking dense-city users for trip context", () => {
    const response = buildRouteSearchResponse({
      origin: "Bandra West, Mumbai",
      destination: "",
      highwayName: "",
      isInsideCity: true,
      distanceToHighwayMeters: 9_000,
    });

    expect(response.intent.mode).toBe("ask-for-trip");
    expect(response.intent.requiresTripContext).toBe(true);
    expect(response.stops.map((stop) => stop.id)).toEqual([
      "mumbai-pune-food-plaza",
      "nh48-toll-plaza",
      "lavato-krishnagiri",
      "city-edge-fuel-station",
    ]);
    expect(response.stops).not.toContainEqual(expect.objectContaining({ id: "dense-city-mall" }));
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
    expect(response.stops[0].id).toBe("mumbai-pune-food-plaza");
    expect(response.stops.every((stop) => stop.distanceFromHighwayMeters <= 2_000 || stop.isEndpointStagingArea)).toBe(true);
  });
});
