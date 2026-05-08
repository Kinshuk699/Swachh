import { describe, expect, it } from "vitest";

import { buildWhatsAppReply } from "./replies";

describe("buildWhatsAppReply", () => {
  it("asks for destination when location is city-only", () => {
    const reply = buildWhatsAppReply({
      text: "toilet near me",
      hasSharedLocation: true,
      isInsideCity: true,
      distanceToHighwayMeters: 7_500,
    });

    expect(reply.kind).toBe("ask-for-trip");
    expect(reply.message).toContain("destination");
  });

  it("returns highway stops for a route-style message", () => {
    const reply = buildWhatsAppReply({
      text: "Mumbai to Pune toilets",
      hasSharedLocation: false,
      isInsideCity: true,
      distanceToHighwayMeters: 7_500,
    });

    expect(reply.kind).toBe("stops");
    expect(reply.message).toContain("Shree Datta Snacks");
  });

  it("returns highway stops for a hyphenated NH message", () => {
    const reply = buildWhatsAppReply({
      text: "NH-65 washrooms",
      hasSharedLocation: false,
      isInsideCity: false,
      distanceToHighwayMeters: 500,
    });

    expect(reply.kind).toBe("stops");
    expect(reply.message).toContain("7 Midway Plaza");
  });
});
