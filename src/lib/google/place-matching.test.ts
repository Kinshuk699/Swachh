import { describe, expect, it } from "vitest";

import {
  buildTextSearchRequest,
  toStoredPlaceMatch,
  type GooglePlaceTextSearchResult,
} from "./place-matching";

describe("Google place matching", () => {
  it("builds a Places Text Search request from curated app-owned context", () => {
    expect(
      buildTextSearchRequest({
        name: "Lavato",
        highwayContext: "NH-44",
        routeContext: "Krishnagiri toll plaza",
        localityHint: "Krishnagiri",
      }),
    ).toEqual({
      textQuery: "Lavato NH-44 Krishnagiri toll plaza Krishnagiri India",
      regionCode: "IN",
      includedType: "establishment",
    });
  });

  it("stores only place_id plus Swachh-owned annotations", () => {
    const googleResult: GooglePlaceTextSearchResult = {
      id: "ChIJ-example",
      displayName: { text: "Lavato Premium Toilets" },
      formattedAddress: "NH-44, Tamil Nadu",
      rating: 4.6,
    };

    expect(
      toStoredPlaceMatch(googleResult, {
        seedName: "Lavato",
        highwayContext: "NH-44",
        routeContext: "Krishnagiri toll plaza",
        restroomConfidence: 0.95,
      }),
    ).toEqual({
      placeId: "ChIJ-example",
      seedName: "Lavato",
      highwayContext: "NH-44",
      routeContext: "Krishnagiri toll plaza",
      restroomConfidence: 0.95,
    });
  });

  it("throws when google result id is empty", () => {
    const bad: GooglePlaceTextSearchResult = { id: "" };
    expect(() => toStoredPlaceMatch(bad, { seedName: "", highwayContext: "", routeContext: "", restroomConfidence: 0 })).toThrow(
      "Google place result is missing id",
    );
  });

  it("does not retain Google-owned fields on the stored match", () => {
    const googleResult: GooglePlaceTextSearchResult = {
      id: "ChIJ-example",
      displayName: { text: "Lavato Premium Toilets" },
      formattedAddress: "NH-44, Tamil Nadu",
      rating: 4.6,
    };

    const stored = toStoredPlaceMatch(googleResult, {
      seedName: "Lavato",
      highwayContext: "NH-44",
      routeContext: "Krishnagiri toll plaza",
      restroomConfidence: 0.9,
    });

    expect(stored).not.toHaveProperty("displayName");
    expect(stored).not.toHaveProperty("formattedAddress");
    expect(stored).not.toHaveProperty("rating");
  });
});
