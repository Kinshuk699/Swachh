import { afterEach, describe, expect, it, vi } from "vitest";

const orderSpy = vi.fn();
const eqSpy = vi.fn(() => ({ order: orderSpy }));
const selectSpy = vi.fn(() => ({ eq: eqSpy }));
const fromSpy = vi.fn(() => ({ select: selectSpy }));
const createClientSpy = vi.fn(() => ({ from: fromSpy }));

vi.mock("@supabase/supabase-js", () => ({
  createClient: createClientSpy,
}));

const originalSupabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const originalServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

describe("GET /api/admin/submissions", () => {
  afterEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_SUPABASE_URL = originalSupabaseUrl;
    process.env.SUPABASE_SERVICE_ROLE_KEY = originalServiceRoleKey;
  });

  it("returns pending restroom submissions from Supabase", async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-key";
    orderSpy.mockResolvedValue({
      data: [
        {
          id: "submission-1",
          name: "Clean Fuel Stop",
          category: "fuel_station",
          highway_name: "Mumbai-Pune Expressway",
          route_context: "Khalapur service corridor",
          latitude: 18.765,
          longitude: 73.377,
          free_access: true,
          women_friendly: true,
          accessible: false,
          cleanliness_rating: 4,
          safety_notes: "Attendant visible",
          google_place_id: "google-place-id-123",
          created_at: "2026-05-09T00:00:00.000Z",
        },
      ],
      error: null,
    });
    const { GET } = await import("./route");

    const response = await GET();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      storageConfigured: true,
      submissions: [
        {
          id: "submission-1",
          name: "Clean Fuel Stop",
          highwayName: "Mumbai-Pune Expressway",
          status: "pending",
        },
      ],
    });
    expect(createClientSpy).toHaveBeenCalledWith("https://example.supabase.co", "service-role-key", expect.any(Object));
    expect(fromSpy).toHaveBeenCalledWith("restroom_submissions");
    expect(eqSpy).toHaveBeenCalledWith("status", "pending");
    expect(orderSpy).toHaveBeenCalledWith("created_at", { ascending: false });
  });

  it("reports an unconfigured admin queue without querying Supabase", async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    const { addLocalPendingRestroomSubmission } = await import("@/lib/admin/submissions");
    addLocalPendingRestroomSubmission({
      name: "Demo Toll Stop",
      category: "toll_plaza",
      highwayName: "Mumbai-Pune Expressway",
      routeContext: "Khalapur service corridor",
      latitude: 18.765,
      longitude: 73.377,
      freeAccess: true,
      womenFriendly: false,
      accessible: false,
      cleanlinessRating: null,
      safetyNotes: null,
      googlePlaceId: null,
    });
    const { GET } = await import("./route");

    const response = await GET();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      storageConfigured: false,
      submissions: [
        {
          name: "Demo Toll Stop",
          highwayName: "Mumbai-Pune Expressway",
          status: "pending",
        },
      ],
    });
    expect(createClientSpy).not.toHaveBeenCalled();
  });
});