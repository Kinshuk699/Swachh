import { describe, expect, it } from "vitest";

import type { NationalHighwayOverlay } from "../highways/national-highways";
import { buildNationalHighwaySearchCorridors } from "./national-highway-corridors";

describe("buildNationalHighwaySearchCorridors", () => {
  it("creates one discovery corridor per imported National Highway ref by default", () => {
    const corridors = buildNationalHighwaySearchCorridors([
      highway({
        id: "osm-nh-44",
        ref: "NH-44",
        geometry: { type: "LineString", coordinates: [[77.59, 13.05], [77.7, 13.2], [77.6, 13.65]] },
      }),
      highway({
        id: "osm-nh-19",
        ref: "NH-19",
        name: "National Highway 19",
        geometry: {
          type: "MultiLineString",
          coordinates: [
            [[88.14, 22.75], [87.86, 23.23]],
            [[86.98, 23.68], [86.42, 23.77], [84.36, 24.76]],
          ],
        },
      }),
    ]);

    expect(corridors).toHaveLength(2);
    expect(corridors[0]).toMatchObject({
      id: "osm-nh-44",
      highwayName: "NH-44",
      routeContext: "National Highway 44",
      region: "India",
      anchors: [{ latitude: 13.2, longitude: 77.7, radiusMeters: 30_000 }],
    });
    expect(corridors[1]).toMatchObject({
      id: "osm-nh-19",
      highwayName: "NH-19",
      routeContext: "National Highway 19",
      anchors: [{ latitude: 23.77, longitude: 86.42, radiusMeters: 30_000 }],
    });
  });
});

function highway(overrides: Partial<NationalHighwayOverlay>): NationalHighwayOverlay {
  return {
    id: "osm-nh-44",
    ref: "NH-44",
    name: "National Highway 44",
    color: "#2563eb",
    bounds: { north: 13.65, south: 13.05, east: 77.7, west: 77.59 },
    geometry: { type: "LineString", coordinates: [[77.59, 13.05], [77.6, 13.65]] },
    ...overrides,
  };
}