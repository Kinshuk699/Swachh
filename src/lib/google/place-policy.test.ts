import { describe, expect, it } from "vitest";

import {
  permittedStoredGooglePlaceFields,
  toStoredGooglePlaceReference,
  toGooglePlaceStorageRow,
} from "./place-policy";

describe("Google place storage policy", () => {
  it("rejects an empty placeId in a stored reference", () => {
    expect(() => toStoredGooglePlaceReference({ placeId: "" })).toThrow(
      "stored place reference missing placeId",
    );
  });

  it("maps app camelCase reference to snake_case storage row", () => {
    const input = {
      placeId: "ChIJ-example",
      seedName: "Lavato",
      highwayContext: "NH-44",
      routeContext: "Krishnagiri toll plaza",
      restroomConfidence: 0.95,
    };

    expect(toGooglePlaceStorageRow(input)).toEqual({
      place_id: "ChIJ-example",
      seed_name: "Lavato",
      highway_context: "NH-44",
      route_context: "Krishnagiri toll plaza",
      restroom_confidence: 0.95,
    });
  });

  it("exports permittedStoredGooglePlaceFields as exactly ['place_id']", () => {
    expect(permittedStoredGooglePlaceFields).toEqual(["place_id"]);
  });
});
