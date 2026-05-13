import { describe, expect, it } from "vitest";

import type { NationalHighwayOverlay } from "../highways/national-highways";
import { buildNationalHighwaySearchCorridors } from "./national-highway-corridors";

describe("buildNationalHighwaySearchCorridors", () => {
  it("tiles imported National Highway refs by route distance instead of only searching the midpoint", () => {
    const corridors = buildNationalHighwaySearchCorridors([
      highway({
        id: "osm-nh-44",
        ref: "NH-44",
        geometry: { type: "LineString", coordinates: [[77, 13], [77.46, 13], [77.92, 13], [78.38, 13]] },
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
    });
    expect(corridors[0].anchors).toHaveLength(3);
    expect(corridors[0].anchors.every((anchor) => anchor.radiusMeters === 30_000)).toBe(true);
    expect(corridors[0].anchors.map((anchor) => anchor.longitude)).toEqual(
      expect.arrayContaining([
        expect.closeTo(77.23, 1),
        expect.closeTo(77.69, 1),
        expect.closeTo(78.15, 1),
      ]),
    );
    expect(corridors[1]).toMatchObject({
      id: "osm-nh-19",
      highwayName: "NH-19",
      routeContext: "National Highway 19",
    });
    expect(corridors[1].anchors.length).toBeGreaterThan(1);
    expect(corridors[1].polylines).toHaveLength(2);
  });

  it("does not create one search anchor for every short OSM fragment", () => {
    const corridors = buildNationalHighwaySearchCorridors([
      highway({
        geometry: {
          type: "MultiLineString",
          coordinates: [
            [[77, 13], [77.05, 13]],
            [[77.05, 13], [77.1, 13]],
            [[77.1, 13], [77.15, 13]],
            [[77.15, 13], [77.2, 13]],
            [[77.2, 13], [77.25, 13]],
          ],
        },
      }),
    ]);

    expect(corridors[0].anchors).toHaveLength(1);
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