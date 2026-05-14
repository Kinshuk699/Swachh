import { describe, expect, it } from "vitest";

import { distanceMeters, type LatLng } from "./geo";

describe("resolver geo helpers", () => {
  it("calculates short distances in meters", () => {
    const firstPoint: LatLng = { latitude: 12.5732978, longitude: 78.1692122 };
    const nearbyOsm: LatLng = { latitude: 12.5737478, longitude: 78.1692122 };

    expect(distanceMeters(firstPoint, nearbyOsm)).toBeGreaterThan(45);
    expect(distanceMeters(firstPoint, nearbyOsm)).toBeLessThan(55);
  });
});