import { describe, expect, it } from "vitest";

import { POST } from "./route";

describe("POST /api/google/place-match", () => {
  it("returns a compliant text search request without calling Google", async () => {
    const response = await POST(
      new Request("http://localhost/api/google/place-match", {
        method: "POST",
        body: JSON.stringify({
          name: "Lavato",
          highwayContext: "NH-44",
          routeContext: "Krishnagiri toll plaza",
          localityHint: "Krishnagiri",
        }),
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      request: {
        textQuery: "Lavato NH-44 Krishnagiri toll plaza Krishnagiri India",
        regionCode: "IN",
        includedType: "establishment",
      },
    });
  });

  it("rejects incomplete seed records", async () => {
    const response = await POST(
      new Request("http://localhost/api/google/place-match", {
        method: "POST",
        body: JSON.stringify({ name: "Lavato" }),
      }),
    );

    expect(response.status).toBe(400);
  });
});