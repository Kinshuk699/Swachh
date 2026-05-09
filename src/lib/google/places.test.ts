import { describe, expect, it, vi } from "vitest";

import { googleTextSearchFieldMask, type GoogleTextSearchJob } from "@/lib/discovery/highway-place-discovery";

import { searchTextPlaces } from "./places";

describe("searchTextPlaces", () => {
  it("calls Google Places Text Search New with a cost-controlled field mask", async () => {
    const job: GoogleTextSearchJob = {
      id: "proxy-brand:shell-select:nh44:0",
      sourceKind: "proxy_brand",
      textQuery: "Shell Select NH-44 Krishnagiri toll plaza India",
      seedName: "Shell Select",
      expectedHighwayContext: "NH-44",
      expectedRouteContext: "Krishnagiri toll plaza",
      region: "South India",
      proxyType: "fuel_cafe",
      confidence: 0.78,
      pageSize: 10,
      regionCode: "IN",
      fieldMask: googleTextSearchFieldMask,
      locationBias: {
        circle: {
          center: { latitude: 12.5186, longitude: 78.2137 },
          radius: 30_000,
        },
      },
    };
    let capturedRequest: RequestInit | undefined;
    const fetcher = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      capturedRequest = init;

      return new Response(
        JSON.stringify({
          places: [
            {
              id: "place-id",
              name: "places/place-id",
              location: { latitude: 12.51, longitude: 78.21 },
              displayName: { text: "Shell Select" },
              types: ["gas_station", "restaurant"],
            },
          ],
        }),
        { status: 200 },
      );
    });

    const response = await searchTextPlaces(job, { apiKey: "server-key", fetcher });

    expect(fetcher).toHaveBeenCalledWith(
      "https://places.googleapis.com/v1/places:searchText",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "Content-Type": "application/json",
          "X-Goog-Api-Key": "server-key",
          "X-Goog-FieldMask": googleTextSearchFieldMask,
        }),
      }),
    );
    expect(JSON.parse(String(capturedRequest?.body))).toEqual({
      textQuery: "Shell Select NH-44 Krishnagiri toll plaza India",
      pageSize: 10,
      regionCode: "IN",
      languageCode: "en-IN",
      locationBias: job.locationBias,
    });
    expect(response.places).toHaveLength(1);
    expect(response.places[0].id).toBe("place-id");
  });

  it("throws a useful error when Google rejects the request", async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ error: { message: "API disabled" } }), { status: 403 }));

    await expect(
      searchTextPlaces(
        {
          id: "job",
          sourceKind: "curated_stop",
          textQuery: "Lavato NH-44 Krishnagiri India",
          seedName: "Lavato",
          expectedHighwayContext: "NH-44",
          expectedRouteContext: "Krishnagiri toll plaza",
          region: "South India",
          proxyType: "premium_lavatory",
          confidence: 0.95,
          pageSize: 5,
          regionCode: "IN",
          fieldMask: googleTextSearchFieldMask,
        },
        { apiKey: "server-key", fetcher },
      ),
    ).rejects.toThrow("Google Places Text Search failed for job");
  });
});