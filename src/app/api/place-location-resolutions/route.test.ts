import { afterEach, describe, expect, it, vi } from "vitest";

const orderSpy = vi.fn(async () => ({
  data: [
    {
      id: "resolution-1",
      google_curated_place_id: "curated-1",
      google_place_id: "google-place-1",
      latitude: 12.5737,
      longitude: 78.1692,
      coordinate_source: "osm",
      coordinate_confidence: 0.9,
      opening_hours: "24/7",
      opening_hours_source: "osm",
      resolution_status: "auto_approved",
    },
  ],
  error: null,
}));
const eqSpy = vi.fn(() => ({ order: orderSpy }));
const selectSpy = vi.fn(() => ({ eq: eqSpy }));
const fromSpy = vi.fn(() => ({ select: selectSpy }));
const createClientSpy = vi.fn(() => ({ from: fromSpy }));

vi.mock("@supabase/supabase-js", () => ({
  createClient: createClientSpy,
}));

const originalSupabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const originalServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

describe("GET /api/place-location-resolutions", () => {
  afterEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_SUPABASE_URL = originalSupabaseUrl;
    process.env.SUPABASE_SERVICE_ROLE_KEY = originalServiceRoleKey;
  });

  it("returns map-ready local resolved coordinates without Google details", async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role";

    const { GET } = await import("./route");
    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      placeDetailsRequests: 0,
      points: [
        {
          id: "resolution-1",
          latitude: 12.5737,
          longitude: 78.1692,
          coordinateSource: "osm",
          openingHours: "24/7",
        },
      ],
    });
    expect(fromSpy).toHaveBeenCalledWith("place_location_resolutions");
    expect(eqSpy).toHaveBeenCalledWith("resolution_status", "auto_approved");
  });
});