import { afterEach, describe, expect, it, vi } from "vitest";

import { GET } from "./route";

const originalServerKey = process.env.GOOGLE_MAPS_SERVER_API_KEY;

describe("GET /api/google/place-details", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    process.env.GOOGLE_MAPS_SERVER_API_KEY = originalServerKey;
  });

  it("returns opening hours for a Google place id", async () => {
    process.env.GOOGLE_MAPS_SERVER_API_KEY = "server-key";
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            id: "place-id",
            displayName: { text: "LAVATO - A Premium Lounge" },
            location: { latitude: 12.5732978, longitude: 78.1692122 },
            currentOpeningHours: { openNow: true, weekdayDescriptions: ["Monday: 8:00 AM - 10:00 PM"] },
          }),
          { status: 200 },
        ),
      ),
    );

    const response = await GET(new Request("http://localhost/api/google/place-details?placeId=place-id"));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      id: "place-id",
      displayName: "LAVATO - A Premium Lounge",
      openNow: true,
      weekdayDescriptions: ["Monday: 8:00 AM - 10:00 PM"],
    });
  });

  it("rejects requests without a place id", async () => {
    process.env.GOOGLE_MAPS_SERVER_API_KEY = "server-key";

    const response = await GET(new Request("http://localhost/api/google/place-details"));

    expect(response.status).toBe(400);
  });
});