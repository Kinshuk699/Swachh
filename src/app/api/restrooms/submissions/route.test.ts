import { afterEach, describe, expect, it, vi } from "vitest";

const insertSpy = vi.fn();
const fromSpy = vi.fn(() => ({ insert: insertSpy }));
const createClientSpy = vi.fn(() => ({ from: fromSpy }));

vi.mock("@supabase/supabase-js", () => ({
  createClient: createClientSpy,
}));

const originalSupabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const originalSupabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

describe("POST /api/restrooms/submissions", () => {
  afterEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_SUPABASE_URL = originalSupabaseUrl;
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = originalSupabaseAnonKey;
  });

  it("stores a pending highway restroom submission", async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key";
    insertSpy.mockResolvedValue({ error: null });
    const { POST } = await import("./route");

    const response = await POST(
      new Request("http://localhost/api/restrooms/submissions", {
        method: "POST",
        body: JSON.stringify({
          name: "Clean Fuel Stop",
          category: "fuel_station",
          latitude: 18.765,
          longitude: 73.377,
          highwayName: "Mumbai-Pune Expressway",
          routeContext: "Khalapur service corridor",
          freeAccess: true,
          cleanlinessRating: 4,
          safetyNotes: "Attendant visible from food court",
          womenFriendly: true,
          accessible: false,
          googlePlaceId: "google-place-id-123",
        }),
      }),
    );

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual({ ok: true, status: "pending" });
    expect(fromSpy).toHaveBeenCalledWith("restroom_submissions");
    expect(insertSpy).toHaveBeenCalledWith({
      name: "Clean Fuel Stop",
      category: "fuel_station",
      latitude: 18.765,
      longitude: 73.377,
      highway_name: "Mumbai-Pune Expressway",
      route_context: "Khalapur service corridor",
      free_access: true,
      cleanliness_rating: 4,
      safety_notes: "Attendant visible from food court",
      women_friendly: true,
      accessible: false,
      google_place_id: "google-place-id-123",
      status: "pending",
    });
  });

  it("rejects submissions without highway context", async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key";
    const { POST } = await import("./route");

    const response = await POST(
      new Request("http://localhost/api/restrooms/submissions", {
        method: "POST",
        body: JSON.stringify({
          name: "Mall restroom",
          category: "public_restroom",
          latitude: 19.076,
          longitude: 72.8777,
          highwayName: "",
        }),
      }),
    );

    expect(response.status).toBe(400);
    expect(insertSpy).not.toHaveBeenCalled();
  });
});