import { describe, expect, it, vi } from "vitest";

import { getPlaceDetails } from "./places";

describe("getPlaceDetails", () => {
  it("fetches live Google opening hours by place_id with a narrow field mask", async () => {
    const fetcher = vi.fn(async () =>
      new Response(
        JSON.stringify({
          id: "ChIJgwabcfrNrTsRxuE8JnwhFL8",
          displayName: { text: "LAVATO - A Premium Lounge" },
          location: { latitude: 12.5732978, longitude: 78.1692122 },
          types: ["public_bathroom"],
          businessStatus: "OPERATIONAL",
          googleMapsUri: "https://maps.google.com/?cid=13768666777879634374",
          currentOpeningHours: {
            openNow: true,
            weekdayDescriptions: ["Monday: 8:00 AM - 10:00 PM"],
          },
        }),
        { status: 200 },
      ),
    );

    const details = await getPlaceDetails("ChIJgwabcfrNrTsRxuE8JnwhFL8", { apiKey: "server-key", fetcher });

    expect(fetcher).toHaveBeenCalledWith(
      "https://places.googleapis.com/v1/places/ChIJgwabcfrNrTsRxuE8JnwhFL8",
      expect.objectContaining({
        headers: expect.objectContaining({
          "X-Goog-Api-Key": "server-key",
          "X-Goog-FieldMask": "id,displayName,location,types,businessStatus,googleMapsUri,currentOpeningHours",
        }),
      }),
    );
    expect(details).toMatchObject({
      id: "ChIJgwabcfrNrTsRxuE8JnwhFL8",
      displayName: "LAVATO - A Premium Lounge",
      types: ["public_bathroom"],
      openNow: true,
      weekdayDescriptions: ["Monday: 8:00 AM - 10:00 PM"],
    });
  });
});