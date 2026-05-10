import { afterEach, describe, expect, it, vi } from "vitest";

const limitSpy = vi.fn();
const secondOrderSpy = vi.fn(() => ({ limit: limitSpy }));
const firstOrderSpy = vi.fn(() => ({ order: secondOrderSpy }));
const inSpy = vi.fn(() => ({ order: firstOrderSpy }));
const selectSpy = vi.fn(() => ({ in: inSpy }));
const fromSpy = vi.fn(() => ({ select: selectSpy }));
const createClientSpy = vi.fn(() => ({ from: fromSpy }));

vi.mock("@supabase/supabase-js", () => ({
  createClient: createClientSpy,
}));

const originalSupabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const originalServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const originalServerKey = process.env.GOOGLE_MAPS_SERVER_API_KEY;

describe("GET /api/google-curated-places", () => {
  afterEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.unstubAllGlobals();
    process.env.NEXT_PUBLIC_SUPABASE_URL = originalSupabaseUrl;
    process.env.SUPABASE_SERVICE_ROLE_KEY = originalServiceRoleKey;
    process.env.GOOGLE_MAPS_SERVER_API_KEY = originalServerKey;
  });

  it("returns stored Google place IDs as map stops using user-facing cleanliness labels", async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-key";
    process.env.GOOGLE_MAPS_SERVER_API_KEY = "server-key";
    limitSpy.mockResolvedValue({
      data: [
        {
          google_place_id: "google-place-id",
          seed_name: "Lavato",
          region: "South India",
          proxy_type: "premium_lavatory",
          cleanliness_tier: "tier_1",
          source_category: "premium_restroom",
          source_evidence: "Premium AC lavatory",
          highway_name: "NH-44",
          route_context: "Krishnagiri toll plaza",
          restroom_confidence: 0.95,
          distance_from_highway_meters: 90,
          local_notes: "Premium AC lavatory",
          verification_status: "likely_clean",
        },
      ],
      error: null,
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request) => {
        expect(String(input)).toContain("/places/google-place-id");
        expect(String(input)).not.toContain("places:searchText");

        return new Response(
          JSON.stringify({
            id: "google-place-id",
            displayName: { text: "LAVATO - A Premium Lounge" },
            location: { latitude: 12.5732978, longitude: 78.1692122 },
            types: ["public_bathroom"],
            googleMapsUri: "https://maps.google.com/?cid=123",
            currentOpeningHours: {
              openNow: true,
              weekdayDescriptions: ["Monday: 8:00 AM - 10:00 PM"],
            },
          }),
          { status: 200 },
        );
      }),
    );
    const { GET } = await import("./route");

    const response = await GET(new Request("http://localhost/api/google-curated-places?limit=1"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.textSearchRequests).toBe(0);
    expect(body.placeDetailsRequests).toBe(1);
    expect(body.places[0]).toMatchObject({
      id: "google-google-place-id",
      name: "LAVATO - A Premium Lounge",
      placeId: "google-place-id",
      cleanlinessLabel: "Premium restroom",
      sourceLabel: "Premium restroom",
      highway: "NH-44",
      locality: "Krishnagiri toll plaza",
      lat: 12.5732978,
      lng: 78.1692122,
      isPaidPremium: true,
    });
    expect(JSON.stringify(body.places[0])).not.toContain("tier_1");
    expect(fromSpy).toHaveBeenCalledWith("google_curated_places");
    expect(inSpy).toHaveBeenCalledWith("verification_status", ["likely_clean", "verified_clean", "approved"]);
    expect(firstOrderSpy).toHaveBeenCalledWith("cleanliness_tier", { ascending: true });
    expect(secondOrderSpy).toHaveBeenCalledWith("restroom_confidence", { ascending: false });
    expect(limitSpy).toHaveBeenCalledWith(5);
  });

  it("skips stored candidates when Google Details resolves to a mismatched place name", async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-key";
    process.env.GOOGLE_MAPS_SERVER_API_KEY = "server-key";
    limitSpy.mockResolvedValue({
      data: [
        {
          google_place_id: "lavato-place-id",
          seed_name: "Lavato",
          region: "South India",
          proxy_type: "premium_lavatory",
          cleanliness_tier: "tier_1",
          source_category: "premium_restroom",
          source_evidence: "Premium AC lavatory",
          highway_name: "NH-44",
          route_context: "Krishnagiri toll plaza",
          restroom_confidence: 0.95,
          distance_from_highway_meters: 90,
          local_notes: "Premium AC lavatory",
          verification_status: "likely_clean",
        },
        {
          google_place_id: "bad-cube-place-id",
          seed_name: "Cube Stop",
          region: "West India",
          proxy_type: "wayside_amenity",
          cleanliness_tier: "tier_1",
          source_category: "official_wayside_amenity",
          source_evidence: "Official wayside amenity proxy",
          highway_name: "Sarkhej-Gandhinagar Highway",
          route_context: "Ahmedabad-Gandhinagar",
          restroom_confidence: 0.9,
          distance_from_highway_meters: 120,
          local_notes: "Official wayside amenity proxy",
          verification_status: "likely_clean",
        },
      ],
      error: null,
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request) => {
        const url = String(input);

        return new Response(
          JSON.stringify({
            id: url.includes("bad-cube-place-id") ? "bad-cube-place-id" : "lavato-place-id",
            displayName: { text: url.includes("bad-cube-place-id") ? "M Cube Practical Classes" : "LAVATO - A Premium Lounge" },
            location: { latitude: 12.5732978, longitude: 78.1692122 },
            types: url.includes("bad-cube-place-id") ? ["school"] : ["public_bathroom"],
          }),
          { status: 200 },
        );
      }),
    );
    const { GET } = await import("./route");

    const response = await GET(new Request("http://localhost/api/google-curated-places?limit=2"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.placeDetailsRequests).toBe(2);
    expect(body.places).toHaveLength(1);
    expect(body.places[0].placeId).toBe("lavato-place-id");
  });

  it("backfills from later stored rows when details validation rejects early candidates", async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-key";
    process.env.GOOGLE_MAPS_SERVER_API_KEY = "server-key";
    limitSpy.mockResolvedValue({
      data: [
        {
          google_place_id: "bad-store-place-id",
          seed_name: "Shell Select",
          region: "West India",
          proxy_type: "fuel_cafe",
          cleanliness_tier: "tier_2",
          source_category: "premium_fuel_program",
          source_evidence: "Fuel cafe proxy",
          highway_name: "NH-47",
          route_context: "Rajkot-Ahmedabad",
          restroom_confidence: 0.78,
          distance_from_highway_meters: 140,
          local_notes: "Fuel cafe proxy",
          verification_status: "likely_clean",
        },
        {
          google_place_id: "good-lavato-place-id",
          seed_name: "Lavato",
          region: "South India",
          proxy_type: "premium_lavatory",
          cleanliness_tier: "tier_1",
          source_category: "premium_restroom",
          source_evidence: "Premium AC lavatory",
          highway_name: "NH-44",
          route_context: "Krishnagiri toll plaza",
          restroom_confidence: 0.95,
          distance_from_highway_meters: 90,
          local_notes: "Premium AC lavatory",
          verification_status: "likely_clean",
        },
        {
          google_place_id: "good-jio-place-id",
          seed_name: "Jio-bp",
          region: "West India",
          proxy_type: "fuel_cafe",
          cleanliness_tier: "tier_2",
          source_category: "premium_fuel_program",
          source_evidence: "Modern mobility station",
          highway_name: "NH-47",
          route_context: "Rajkot-Ahmedabad",
          restroom_confidence: 0.82,
          distance_from_highway_meters: 110,
          local_notes: "Modern mobility station",
          verification_status: "likely_clean",
        },
      ],
      error: null,
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request) => {
        const url = String(input);
        const fixtures: Record<string, unknown> = {
          "bad-store-place-id": {
            id: "bad-store-place-id",
            displayName: { text: "Shell Select Fashion Store" },
            location: { latitude: 22.99, longitude: 72.38 },
            types: ["store"],
          },
          "good-lavato-place-id": {
            id: "good-lavato-place-id",
            displayName: { text: "LAVATO - A Premium Lounge" },
            location: { latitude: 12.5732978, longitude: 78.1692122 },
            types: ["public_bathroom"],
          },
          "good-jio-place-id": {
            id: "good-jio-place-id",
            displayName: { text: "JIO BP FUEL STATION" },
            location: { latitude: 22.7, longitude: 71.6 },
            types: ["gas_station"],
          },
        };
        const placeId = Object.keys(fixtures).find((id) => url.includes(id));

        return new Response(JSON.stringify(fixtures[placeId ?? "bad-store-place-id"]), { status: 200 });
      }),
    );
    const { GET } = await import("./route");

    const response = await GET(new Request("http://localhost/api/google-curated-places?limit=2"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.placeDetailsRequests).toBe(3);
    expect(body.places).toHaveLength(2);
    expect(body.places.map((place: { placeId: string }) => place.placeId)).toEqual(["good-lavato-place-id", "good-jio-place-id"]);
  });
});