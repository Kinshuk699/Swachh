import { afterEach, describe, expect, it, vi } from "vitest";

import { POST } from "./route";

const originalServerKey = process.env.GOOGLE_MAPS_SERVER_API_KEY;

describe("POST /api/routes/search", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    process.env.GOOGLE_MAPS_SERVER_API_KEY = originalServerKey;
  });

  it("includes live Google route distance and duration when a server key is configured", async () => {
    process.env.GOOGLE_MAPS_SERVER_API_KEY = "server-key";
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            routes: [{ distanceMeters: 148_400, duration: "9389s", polyline: { encodedPolyline: "encoded-route" } }],
          }),
          { status: 200 },
        ),
      ),
    );

    const response = await POST(
      new Request("http://localhost/api/routes/search", {
        method: "POST",
        body: JSON.stringify({ origin: "Mumbai", destination: "Pune", isInsideCity: true }),
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      intent: { mode: "plan-route" },
      route: {
        provider: "google_routes",
        distanceMeters: 148_400,
        durationSeconds: 9_389,
        encodedPolyline: "encoded-route",
      },
      stops: expect.any(Array),
    });
  });

  it("keeps curated stops available when live route lookup is not configured", async () => {
    delete process.env.GOOGLE_MAPS_SERVER_API_KEY;
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const response = await POST(
      new Request("http://localhost/api/routes/search", {
        method: "POST",
        body: JSON.stringify({ origin: "Mumbai", destination: "Pune", isInsideCity: true }),
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.route).toBeNull();
    expect(body.stops.length).toBeGreaterThan(0);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});