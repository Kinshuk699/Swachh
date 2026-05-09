import { describe, expect, it, vi } from "vitest";

import { computeDrivingRoute } from "./routes";

describe("computeDrivingRoute", () => {
  it("calls Google Routes with Essentials-safe fields and parses distance and duration", async () => {
    let capturedRequest: RequestInit | undefined;
    const fetcher = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      capturedRequest = init;

      return new Response(
        JSON.stringify({
          routes: [
            {
              distanceMeters: 148_400,
              duration: "9389s",
              polyline: { encodedPolyline: "encoded-route" },
            },
          ],
        }),
        { status: 200 },
      );
    });

    const route = await computeDrivingRoute(
      { origin: "Mumbai", destination: "Pune" },
      { apiKey: "server-key", fetcher },
    );

    expect(route).toEqual({
      distanceMeters: 148_400,
      durationSeconds: 9_389,
      encodedPolyline: "encoded-route",
      provider: "google_routes",
    });
    expect(fetcher).toHaveBeenCalledWith(
      "https://routes.googleapis.com/directions/v2:computeRoutes",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "X-Goog-Api-Key": "server-key",
          "X-Goog-FieldMask": "routes.distanceMeters,routes.duration,routes.polyline.encodedPolyline",
        }),
      }),
    );
    expect(JSON.parse(String(capturedRequest?.body))).toMatchObject({
      origin: { address: "Mumbai, India" },
      destination: { address: "Pune, India" },
      travelMode: "DRIVE",
      routingPreference: "TRAFFIC_UNAWARE",
      units: "METRIC",
    });
  });

  it("returns null when a route cannot be computed", async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ routes: [] }), { status: 200 }));

    await expect(
      computeDrivingRoute({ origin: "Mumbai", destination: "Pune" }, { apiKey: "server-key", fetcher }),
    ).resolves.toBeNull();
  });
});