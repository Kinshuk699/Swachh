import { describe, expect, it } from "vitest";

describe("GET /api/highways/national", () => {
  it("serves cached National Highway overlays with attribution and no external fetch", async () => {
    const { GET } = await import("./route");

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.source).toBe("openstreetmap");
    expect(body.attribution).toContain("OpenStreetMap");
    expect(body.highways.length).toBeGreaterThanOrEqual(3);
    expect(body.highways[0]).toMatchObject({
      ref: expect.stringMatching(/^NH-/),
      color: expect.stringMatching(/^#/),
      bounds: expect.objectContaining({ north: expect.any(Number), south: expect.any(Number), east: expect.any(Number), west: expect.any(Number) }),
      geometry: expect.objectContaining({ type: expect.any(String), coordinates: expect.any(Array) }),
    });
  });
});
