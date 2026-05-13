import { describe, expect, it } from "vitest";

import { classifyGoogleCuratedPlaceDisplay, type GoogleCuratedPlaceDisplayRow } from "./google-curated-place-display";

const baseRow = {
  seed_name: "PATH Recharge",
  proxy_type: "wayside_amenity",
  source_category: "official_wayside_amenity",
} satisfies GoogleCuratedPlaceDisplayRow;

describe("Google curated place display classification", () => {
  it("quarantines road objects even when broad discovery accepted the seed", () => {
    const decision = classifyGoogleCuratedPlaceDisplay(baseRow, {
      id: "road-place-id",
      displayName: "National Highway 320G",
      location: { latitude: 22.1, longitude: 85.8 },
      types: ["route"],
      weekdayDescriptions: [],
    });

    expect(decision).toEqual({ displayable: false, reason: "road_object_quarantine" });
  });

  it("keeps broad discovery usable when Details resolves to a real traveller stop", () => {
    const decision = classifyGoogleCuratedPlaceDisplay(baseRow, {
      id: "path-recharge-stop-id",
      displayName: "PATH Recharge EV Hub",
      location: { latitude: 28.54, longitude: 77.52 },
      types: ["rest_stop", "point_of_interest", "establishment"],
      weekdayDescriptions: [],
    });

    expect(decision).toEqual({ displayable: true, reason: "displayable" });
  });

  it("quarantines bridge and flyover matches from premium restroom seeds", () => {
    const decision = classifyGoogleCuratedPlaceDisplay(
      { seed_name: "Lavato", proxy_type: "premium_lavatory", source_category: "premium_restroom" },
      {
        id: "bridge-place-id",
        displayName: "Parambithara Bridge",
        location: { latitude: 9.96, longitude: 76.29 },
        types: ["bridge", "transportation_service", "point_of_interest"],
        weekdayDescriptions: [],
      },
    );
    expect(decision).toEqual({ displayable: false, reason: "road_object_quarantine" });
  });

  it("marks unrelated non-road Google matches as name or type mismatches", () => {
    const decision = classifyGoogleCuratedPlaceDisplay(
      { seed_name: "Cube Stop", proxy_type: "wayside_amenity", source_category: "official_wayside_amenity" },
      {
        id: "school-place-id",
        displayName: "M Cube Practical Classes",
        location: { latitude: 23.01, longitude: 72.54 },
        types: ["school"],
        weekdayDescriptions: [],
      },
    );

    expect(decision).toEqual({ displayable: false, reason: "name_type_mismatch" });
  });
});