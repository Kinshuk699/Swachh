import { describe, expect, it } from "vitest";

import { normalizeOpeningHours } from "./opening-hours-validation";

describe("opening hours validation", () => {
  it("keeps open-source opening_hours unchanged when present", () => {
    expect(normalizeOpeningHours(" Mo-Su 08:00-22:00 ")).toBe("Mo-Su 08:00-22:00");
    expect(normalizeOpeningHours("24/7")).toBe("24/7");
  });

  it("returns null for missing open-source hours", () => {
    expect(normalizeOpeningHours(null)).toBeNull();
    expect(normalizeOpeningHours("   ")).toBeNull();
  });
});