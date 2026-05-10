import { describe, expect, it } from "vitest";

import { buildNationalHighwayOverlays, calculateGeometryBounds, normalizeHighwayRef } from "./national-highways";

describe("national highway utilities", () => {
  it("normalizes OSM National Highway refs for UI grouping", () => {
    expect(normalizeHighwayRef("NH 44")).toBe("NH-44");
    expect(normalizeHighwayRef("NH-48")).toBe("NH-48");
    expect(normalizeHighwayRef(" nh 19 ")).toBe("NH-19");
  });

  it("calculates bounds from LineString coordinates", () => {
    expect(
      calculateGeometryBounds({
        type: "LineString",
        coordinates: [
          [77.59, 13.05],
          [77.7, 13.2],
          [77.6, 13.65],
        ],
      }),
    ).toEqual({ north: 13.65, south: 13.05, east: 77.7, west: 77.59 });
  });

  it("filters to National Highways and assigns stable colors", () => {
    const overlays = buildNationalHighwayOverlays([
      {
        id: "nh-44",
        ref: "NH 44",
        name: "National Highway 44",
        highwayClass: "trunk",
        source: "openstreetmap",
        isNationalHighway: true,
        isExpressway: false,
        geometry: { type: "LineString", coordinates: [[77.59, 13.05], [77.7, 13.2]] },
      },
      {
        id: "expressway",
        ref: "Yamuna Expressway",
        highwayClass: "motorway",
        source: "openstreetmap",
        isNationalHighway: false,
        isExpressway: true,
        geometry: { type: "LineString", coordinates: [[77.55, 28.56], [77.83, 28.23]] },
      },
    ]);

    expect(overlays).toHaveLength(1);
    expect(overlays[0]).toMatchObject({ id: "nh-44", ref: "NH-44", color: "#2563eb" });
  });

  it("groups multiple OSM way segments by normalized National Highway ref", () => {
    const overlays = buildNationalHighwayOverlays([
      {
        id: "nh-44-a",
        ref: "NH 44",
        highwayClass: "trunk",
        source: "openstreetmap",
        isNationalHighway: true,
        isExpressway: false,
        geometry: { type: "LineString", coordinates: [[77.59, 13.05], [77.7, 13.2]] },
      },
      {
        id: "nh-44-b",
        ref: "NH-44",
        name: "National Highway 44",
        highwayClass: "trunk",
        source: "openstreetmap",
        isNationalHighway: true,
        isExpressway: false,
        geometry: { type: "LineString", coordinates: [[77.6, 13.65], [77.63, 15.83]] },
      },
    ]);

    expect(overlays).toHaveLength(1);
    expect(overlays[0]).toMatchObject({ id: "nh-44", ref: "NH-44", name: "National Highway 44" });
    expect(overlays[0].bounds).toEqual({ north: 15.83, south: 13.05, east: 77.7, west: 77.59 });
    expect(overlays[0].geometry).toEqual({
      type: "MultiLineString",
      coordinates: [
        [[77.59, 13.05], [77.7, 13.2]],
        [[77.6, 13.65], [77.63, 15.83]],
      ],
    });
  });
});
