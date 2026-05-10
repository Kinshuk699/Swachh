import { afterEach, describe, expect, it, vi } from "vitest";

import { GET } from "./route";

const originalServerKey = process.env.GOOGLE_MAPS_SERVER_API_KEY;
const originalPreviewEnabled = process.env.GOOGLE_DISCOVERY_PREVIEW_ENABLED;

describe("GET /api/google-curated-places/preview", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    process.env.GOOGLE_MAPS_SERVER_API_KEY = originalServerKey;
    process.env.GOOGLE_DISCOVERY_PREVIEW_ENABLED = originalPreviewEnabled;
  });

  it("keeps live Text Search preview disabled by default", async () => {
    delete process.env.GOOGLE_DISCOVERY_PREVIEW_ENABLED;
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const response = await GET(new Request("http://localhost/api/google-curated-places/preview?limit=1"));
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.textSearchRequests).toBe(0);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("resolves a capped batch of Google Places markers for the map", async () => {
    process.env.GOOGLE_DISCOVERY_PREVIEW_ENABLED = "true";
    process.env.GOOGLE_MAPS_SERVER_API_KEY = "server-key";
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            places: [
              {
                id: "ChIJgwabcfrNrTsRxuE8JnwhFL8",
                displayName: { text: "LAVATO - A Premium Lounge" },
                location: { latitude: 12.5732978, longitude: 78.1692122 },
                types: ["public_bathroom", "public_bath"],
              },
            ],
          }),
          { status: 200 },
        ),
      ),
    );

    const response = await GET(new Request("http://localhost/api/google-curated-places/preview?limit=1"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.totalJobs).toBeGreaterThanOrEqual(1_500);
    expect(body.searchedJobs).toBe(1);
    expect(body.places[0]).toMatchObject({
      id: "google-ChIJgwabcfrNrTsRxuE8JnwhFL8",
      name: "LAVATO - A Premium Lounge",
      placeId: "ChIJgwabcfrNrTsRxuE8JnwhFL8",
      isPaidPremium: true,
    });
  });
});