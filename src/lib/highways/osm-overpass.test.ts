import { describe, expect, it } from "vitest";

import { buildIndiaNationalHighwaysOverpassQuery, formatNationalHighwayDatasetModule, overpassJsonToCachedHighways } from "./osm-overpass";

describe("OSM Overpass National Highway import helpers", () => {
  it("builds an India-scoped National Highway Overpass query", () => {
    const query = buildIndiaNationalHighwaysOverpassQuery();

    expect(query).toContain('["ISO3166-1"="IN"]');
    expect(query).toContain('["ref"~"(^|;| )NH[ -]?[0-9]", i]');
    expect(query).not.toContain("relation[");
    expect(query).toContain("out geom");
  });

  it("converts OSM way geometry into cached National Highway features", () => {
    const features = overpassJsonToCachedHighways({
      elements: [
        {
          type: "way",
          id: 1001,
          tags: { ref: "NH 44", name: "National Highway 44", highway: "trunk" },
          geometry: [
            { lat: 13.05, lon: 77.59 },
            { lat: 13.2, lon: 77.7 },
          ],
        },
        {
          type: "way",
          id: 2001,
          tags: { ref: "SH 12", highway: "primary" },
          geometry: [
            { lat: 11.1, lon: 76.1 },
            { lat: 11.2, lon: 76.2 },
          ],
        },
      ],
    });

    expect(features).toHaveLength(1);
    expect(features[0]).toMatchObject({
      id: "osm-way-1001",
      ref: "NH-44",
      name: "National Highway 44",
      highwayClass: "trunk",
      source: "openstreetmap",
      isNationalHighway: true,
      isExpressway: false,
      geometry: { type: "LineString", coordinates: [[77.59, 13.05], [77.7, 13.2]] },
    });
  });

  it("can group National Highway ways by ref and simplify geometry for the browser cache", () => {
    const features = overpassJsonToCachedHighways(
      {
        elements: [
          {
            type: "way",
            id: 1001,
            tags: { ref: "NH 44", name: "National Highway 44", highway: "trunk" },
            geometry: [
              { lat: 0, lon: 0 },
              { lat: 0.0001, lon: 0.1 },
              { lat: 0, lon: 0.2 },
            ],
          },
          {
            type: "way",
            id: 1002,
            tags: { ref: "NH-44", highway: "trunk" },
            geometry: [
              { lat: 0, lon: 0.3 },
              { lat: 0, lon: 0.4 },
            ],
          },
        ],
      },
      { groupByRef: true, simplifyToleranceDegrees: 0.001 },
    );

    expect(features).toHaveLength(1);
    expect(features[0]).toMatchObject({ id: "osm-nh-44", ref: "NH-44", name: "National Highway 44" });
    expect(features[0].geometry).toEqual({
      type: "MultiLineString",
      coordinates: [
        [[0, 0], [0.2, 0]],
        [[0.3, 0], [0.4, 0]],
      ],
    });
  });

  it("formats generated cached data as a TypeScript module", () => {
    const moduleText = formatNationalHighwayDatasetModule({
      generatedAt: "2026-05-11T00:00:00.000Z",
      features: [
        {
          id: "osm-way-1001",
          ref: "NH-44",
          name: "National Highway 44",
          highwayClass: "trunk",
          source: "openstreetmap",
          isNationalHighway: true,
          isExpressway: false,
          geometry: { type: "LineString", coordinates: [[77.59, 13.05], [77.7, 13.2]] },
        },
      ],
    });

    expect(moduleText).toContain("export const nationalHighwayDataset");
    expect(moduleText).toContain("© OpenStreetMap contributors");
    expect(moduleText).toContain('"ref":"NH-44"');
  });
});
