import { describe, expect, it } from "vitest";

import { compareOsmHoursWithGoogle, normalizeOsmOpeningHours } from "./opening-hours-validation";

describe("opening hours validation", () => {
  it("keeps OSM opening_hours unchanged when valid-looking", () => {
    expect(normalizeOsmOpeningHours(" Mo-Su 08:00-22:00 ")).toBe("Mo-Su 08:00-22:00");
    expect(normalizeOsmOpeningHours("24/7")).toBe("24/7");
  });

  it("marks missing source combinations", () => {
    expect(compareOsmHoursWithGoogle(null, ["Monday: Open 24 hours"])).toBe("osm_missing");
    expect(compareOsmHoursWithGoogle("24/7", [])).toBe("google_missing");
  });

  it("matches 24/7 OSM hours to Google open-24-hours descriptions", () => {
    expect(
      compareOsmHoursWithGoogle("24/7", [
        "Monday: Open 24 hours",
        "Tuesday: Open 24 hours",
        "Wednesday: Open 24 hours",
        "Thursday: Open 24 hours",
        "Friday: Open 24 hours",
        "Saturday: Open 24 hours",
        "Sunday: Open 24 hours",
      ]),
    ).toBe("agrees");
  });

  it("matches simple daily OSM ranges to Google weekday descriptions", () => {
    expect(
      compareOsmHoursWithGoogle("Mo-Su 08:00-22:00", [
        "Monday: 8:00 AM - 10:00 PM",
        "Tuesday: 8:00 AM - 10:00 PM",
        "Wednesday: 8:00 AM - 10:00 PM",
        "Thursday: 8:00 AM - 10:00 PM",
        "Friday: 8:00 AM - 10:00 PM",
        "Saturday: 8:00 AM - 10:00 PM",
        "Sunday: 8:00 AM - 10:00 PM",
      ]),
    ).toBe("agrees");
  });

  it("marks simple conflicts as differs and complex syntax as inconclusive", () => {
    expect(compareOsmHoursWithGoogle("Mo-Su 08:00-22:00", ["Monday: 9:00 AM - 10:00 PM"])).toBe("differs");
    expect(compareOsmHoursWithGoogle("Mo-Fr 08:00-12:00,13:00-17:30; PH off", ["Monday: 8:00 AM - 5:30 PM"])).toBe(
      "inconclusive",
    );
  });
});