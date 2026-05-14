export type GoogleHoursValidationStatus =
  | "not_checked"
  | "agrees"
  | "differs"
  | "google_missing"
  | "osm_missing"
  | "inconclusive";

export function normalizeOsmOpeningHours(value: string | null | undefined): string | null {
  const trimmed = value?.trim();

  return trimmed ? trimmed : null;
}

export function compareOsmHoursWithGoogle(
  osmOpeningHours: string | null | undefined,
  googleWeekdayDescriptions: readonly string[] | null | undefined,
): GoogleHoursValidationStatus {
  const osmHours = normalizeOsmOpeningHours(osmOpeningHours);
  const googleDescriptions = googleWeekdayDescriptions?.filter(Boolean) ?? [];

  if (!osmHours && googleDescriptions.length === 0) {
    return "not_checked";
  }

  if (!osmHours) {
    return "osm_missing";
  }

  if (googleDescriptions.length === 0) {
    return "google_missing";
  }

  if (osmHours === "24/7") {
    return googleDescriptions.every((description) => /open 24 hours/i.test(description)) ? "agrees" : "differs";
  }

  const dailyRange = osmHours.match(/^Mo-Su (\d{2}:\d{2})-(\d{2}:\d{2})$/);

  if (!dailyRange) {
    return "inconclusive";
  }

  const [, opensAt, closesAt] = dailyRange;
  const googleRanges = googleDescriptions.map(parseGoogleWeekdayRange).filter((range): range is string => Boolean(range));

  if (googleRanges.length === 0) {
    return "inconclusive";
  }

  const expectedRange = `${opensAt}-${closesAt}`;

  return googleRanges.every((range) => range === expectedRange) ? "agrees" : "differs";
}

function parseGoogleWeekdayRange(description: string): string | null {
  const match = description.match(/:\s*(\d{1,2}:\d{2})\s*(AM|PM)\s*-\s*(\d{1,2}:\d{2})\s*(AM|PM)/i);

  if (!match) {
    return null;
  }

  const [, openTime, openMeridiem, closeTime, closeMeridiem] = match;

  return `${toTwentyFourHour(openTime, openMeridiem)}-${toTwentyFourHour(closeTime, closeMeridiem)}`;
}

function toTwentyFourHour(time: string, meridiem: string): string {
  const [rawHour, minute] = time.split(":");
  let hour = Number(rawHour);
  const normalizedMeridiem = meridiem.toUpperCase();

  if (normalizedMeridiem === "AM" && hour === 12) {
    hour = 0;
  } else if (normalizedMeridiem === "PM" && hour !== 12) {
    hour += 12;
  }

  return `${String(hour).padStart(2, "0")}:${minute}`;
}