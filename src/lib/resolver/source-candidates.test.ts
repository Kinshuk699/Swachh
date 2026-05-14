import { describe, expect, it } from "vitest";

import { loadOsmCandidatesFromJson, loadOvertureCandidatesFromJson } from "./source-candidates";

describe("source candidate loaders", () => {
  it("loads compact OSM candidates and preserves opening_hours", () => {
    const rows = loadOsmCandidatesFromJson(
      JSON.stringify([
        {
          id: "node/1",
          name: "Lavato Krishnagiri",
          lat: 12.5737,
          lon: 78.1692,
          tags: { amenity: "toilets", opening_hours: "24/7" },
        },
      ]),
    );

    expect(rows).toEqual([
      {
        source: "osm",
        sourceId: "node/1",
        name: "Lavato Krishnagiri",
        latitude: 12.5737,
        longitude: 78.1692,
        categories: ["toilets"],
        openingHours: "24/7",
      },
    ]);
  });

  it("loads compact Overture candidates", () => {
    const rows = loadOvertureCandidatesFromJson(
      JSON.stringify([
        {
          id: "overture-1",
          names: { primary: "Lavato Krishnagiri" },
          geometry: { type: "Point", coordinates: [78.1692, 12.5737] },
          categories: { primary: "restroom" },
          confidence: 0.9,
          operating_status: "open",
        },
      ]),
    );

    expect(rows[0]).toMatchObject({
      source: "overture",
      sourceId: "overture-1",
      name: "Lavato Krishnagiri",
      latitude: 12.5737,
      longitude: 78.1692,
      categories: ["restroom"],
      confidence: 0.9,
      operatingStatus: "open",
    });
  });
});