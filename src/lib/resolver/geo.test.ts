import { describe, expect, it } from "vitest";

import { classifyReferenceDistance, distanceMeters, type LatLng } from "./geo";

describe("resolver geo helpers", () => {
  it("calculates short distances in meters", () => {
    const googleReference: LatLng = { latitude: 12.5732978, longitude: 78.1692122 };
    const nearbyOsm: LatLng = { latitude: 12.5737478, longitude: 78.1692122 };

    expect(distanceMeters(googleReference, nearbyOsm)).toBeGreaterThan(45);
    expect(distanceMeters(googleReference, nearbyOsm)).toBeLessThan(55);
  });

  it("classifies Google reference distance bands", () => {
    expect(classifyReferenceDistance(50)).toBe("excellent");
    expect(classifyReferenceDistance(125)).toBe("strong");
    expect(classifyReferenceDistance(175)).toBe("acceptable");
    expect(classifyReferenceDistance(250)).toBe("weak_review");
    expect(classifyReferenceDistance(350)).toBe("over_300m_review");
  });
});