# Local Coordinate Resolver Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a local resolver that turns accepted/candidate Google-curated highway stops into map-ready OSM/Overture/manual/crowd coordinates, stores OSM/open-source hours, and uses Google coordinates/hours only as temporary validation signals.

**Architecture:** Add a compact Supabase resolution table, pure TypeScript resolver modules, a dry-run-first CLI, and a read endpoint for resolved map points. The first vertical slice accepts compact OSM/Overture candidate files instead of storing raw OSM/Overture extracts in Supabase; raw source extraction remains a local preprocessing step.

**Tech Stack:** Next.js App Router, TypeScript, Vitest, Supabase SQL migrations, Google Places helper already in `src/lib/google/places.ts`, Node script execution via `node --experimental-transform-types`.

---

## Scope Check

This plan implements the resolver/data layer only. It does not migrate the visible map renderer from Google Maps to MapLibre; that should be a separate plan after the resolved coordinate endpoint exists. This plan also does not parse the full 1.6 GB OSM PBF directly in app code. It consumes compact OSM/Overture candidate files generated locally from raw extracts, then deletes raw working files after extraction.

## File Structure

- Create `supabase/migrations/202605140001_place_location_resolutions.sql`: compact table for permanent non-Google coordinates, hours, review status, and validation metadata.
- Create `src/lib/supabase/place-location-resolutions-migration.test.ts`: migration policy tests, including no persisted raw Google coordinates or raw Google hours.
- Create `src/lib/resolver/geo.ts`: distance calculations and coordinate types.
- Create `src/lib/resolver/geo.test.ts`: distance and threshold tests.
- Create `src/lib/resolver/place-location-resolution.ts`: resolver domain types, match thresholds, scoring, resolution decisions, and row builders.
- Create `src/lib/resolver/place-location-resolution.test.ts`: scoring and resolution tests for OSM-only, Overture-only, combined, weak, and over-300-meter review cases.
- Create `src/lib/resolver/opening-hours-validation.ts`: OSM hours extraction and temporary Google-hours comparison status.
- Create `src/lib/resolver/opening-hours-validation.test.ts`: tests for `24/7`, daily ranges, missing/inconclusive, and non-persistence behavior.
- Create `src/lib/resolver/source-candidates.ts`: loaders for compact OSM and Overture candidate JSON files.
- Create `src/lib/resolver/source-candidates.test.ts`: file parsing tests.
- Create `src/lib/resolver/place-location-resolution-import.ts`: batch orchestration and Supabase row mapping.
- Create `src/lib/resolver/place-location-resolution-import.test.ts`: dry-run batch tests with mocked Google Place Details.
- Create `scripts/resolve-place-locations.ts`: CLI with `--plan-only`, `--dry-run`, caps, source file paths, and optional Supabase write.
- Create `src/lib/resolver/resolve-place-locations-script.test.ts`: script-level plan-only test without Google/Supabase env.
- Create `src/app/api/place-location-resolutions/route.ts`: local read endpoint for map-ready resolved coordinates.
- Create `src/app/api/place-location-resolutions/route.test.ts`: endpoint behavior tests with a mocked Supabase client helper.
- Modify `package.json`: add `resolve:place-locations` script.
- Update `docs/superpowers/specs/2026-05-14-local-coordinate-resolver-design.md` only if implementation reveals a small contradiction; otherwise leave the spec as the source of truth.

## Task 1: Supabase Resolution Schema

**Files:**
- Create: `supabase/migrations/202605140001_place_location_resolutions.sql`
- Create: `src/lib/supabase/place-location-resolutions-migration.test.ts`

- [ ] **Step 1: Write the failing migration tests**

Create `src/lib/supabase/place-location-resolutions-migration.test.ts`:

```ts
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("place location resolutions migration", () => {
  const migrationSql = readFileSync(
    join(process.cwd(), "supabase/migrations/202605140001_place_location_resolutions.sql"),
    "utf8",
  );

  it("creates a compact local coordinate resolution table", () => {
    expect(migrationSql).toContain("create table if not exists public.place_location_resolutions");
    expect(migrationSql).toContain("google_curated_place_id uuid not null");
    expect(migrationSql).toContain("latitude numeric not null");
    expect(migrationSql).toContain("longitude numeric not null");
    expect(migrationSql).toContain("coordinate_source text not null");
    expect(migrationSql).toContain("resolution_status text not null");
    expect(migrationSql).toContain("opening_hours text");
    expect(migrationSql).toContain("opening_hours_google_validation_status text");
  });

  it("allows open-source/manual/crowd coordinate sources only", () => {
    expect(migrationSql).toContain("'osm'");
    expect(migrationSql).toContain("'overture'");
    expect(migrationSql).toContain("'osm_overture'");
    expect(migrationSql).toContain("'manual'");
    expect(migrationSql).toContain("'crowdsourced'");
    expect(migrationSql).not.toMatch(/coordinate_source.*google/i);
  });

  it("does not persist raw Google coordinates or raw Google hours", () => {
    expect(migrationSql).not.toMatch(/google_latitude|google_longitude|google_opening_hours|google_weekday_descriptions/i);
    expect(migrationSql).toContain("distance_to_google_reference_meters numeric");
    expect(migrationSql).toContain("opening_hours_google_validation_status text");
  });

  it("keeps over-300m rows reviewable rather than rejected by schema", () => {
    expect(migrationSql).toContain("'needs_review'");
    expect(migrationSql).toContain("'rejected'");
    expect(migrationSql).toContain("rejection_reason text");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/lib/supabase/place-location-resolutions-migration.test.ts`

Expected: FAIL because `supabase/migrations/202605140001_place_location_resolutions.sql` does not exist.

- [ ] **Step 3: Add the migration**

Create `supabase/migrations/202605140001_place_location_resolutions.sql`:

```sql
create table if not exists public.place_location_resolutions (
  id uuid primary key default gen_random_uuid(),
  google_curated_place_id uuid not null references public.google_curated_places(id) on delete cascade,
  google_place_id text not null,
  latitude numeric not null check (latitude >= -90 and latitude <= 90),
  longitude numeric not null check (longitude >= -180 and longitude <= 180),
  coordinate_source text not null check (coordinate_source in ('osm', 'overture', 'osm_overture', 'manual', 'crowdsourced')),
  coordinate_source_id text not null,
  coordinate_source_label text,
  coordinate_confidence numeric not null check (coordinate_confidence >= 0 and coordinate_confidence <= 1),
  distance_to_google_reference_meters numeric check (distance_to_google_reference_meters is null or distance_to_google_reference_meters >= 0),
  open_source_agreement_meters numeric check (open_source_agreement_meters is null or open_source_agreement_meters >= 0),
  resolution_status text not null default 'needs_review' check (resolution_status in ('auto_approved', 'needs_review', 'rejected', 'superseded')),
  rejection_reason text,
  opening_hours text,
  opening_hours_source text check (opening_hours_source is null or opening_hours_source in ('osm', 'manual', 'crowdsourced', 'official_open_source')),
  opening_hours_source_id text,
  opening_hours_checked_at timestamptz,
  opening_hours_google_validation_status text check (
    opening_hours_google_validation_status is null
    or opening_hours_google_validation_status in ('not_checked', 'agrees', 'differs', 'google_missing', 'osm_missing', 'inconclusive')
  ),
  resolved_at timestamptz not null default now(),
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (google_curated_place_id, coordinate_source, coordinate_source_id)
);

create index if not exists place_location_resolutions_google_curated_place_id_idx
  on public.place_location_resolutions(google_curated_place_id);

create index if not exists place_location_resolutions_google_place_id_idx
  on public.place_location_resolutions(google_place_id);

create index if not exists place_location_resolutions_map_ready_idx
  on public.place_location_resolutions(resolution_status, coordinate_confidence);

alter table public.place_location_resolutions enable row level security;

drop policy if exists "map-ready place location resolutions are public" on public.place_location_resolutions;
drop policy if exists "admins manage place location resolutions" on public.place_location_resolutions;

create policy "map-ready place location resolutions are public" on public.place_location_resolutions
  for select using (resolution_status = 'auto_approved' or public.is_admin());

create policy "admins manage place location resolutions" on public.place_location_resolutions
  for all using (public.is_admin());
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/lib/supabase/place-location-resolutions-migration.test.ts`

Expected: PASS.

- [ ] **Step 5: Checkpoint**

Run: `git status --short`

Expected changed files: the new migration and migration test. Do not commit unless the user explicitly asks for commits.

## Task 2: Geo Distance And Threshold Helpers

**Files:**
- Create: `src/lib/resolver/geo.ts`
- Create: `src/lib/resolver/geo.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/resolver/geo.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { classifyReferenceDistance, distanceMeters, type LatLng } from "./geo";

describe("resolver geo helpers", () => {
  it("calculates short distances in meters", () => {
    const googleReference: LatLng = { latitude: 12.5732978, longitude: 78.1692122 };
    const nearbyOsm: LatLng = { latitude: 12.5737478, longitude: 78.1692122 };

    expect(distanceMeters(googleReference, nearbyOsm)).toBeGreaterThan(45);
    expect(distanceMeters(googleReference, nearbyOsm)).toBeLessThan(55);
  });

  it("classifies Google reference distance bands", () => {
    expect(classifyReferenceDistance(50)).toBe("excellent");
    expect(classifyReferenceDistance(125)).toBe("strong");
    expect(classifyReferenceDistance(175)).toBe("acceptable");
    expect(classifyReferenceDistance(250)).toBe("weak_review");
    expect(classifyReferenceDistance(350)).toBe("over_300m_review");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/lib/resolver/geo.test.ts`

Expected: FAIL because `src/lib/resolver/geo.ts` does not exist.

- [ ] **Step 3: Add the helper**

Create `src/lib/resolver/geo.ts`:

```ts
export type LatLng = {
  latitude: number;
  longitude: number;
};

export type ReferenceDistanceBand = "excellent" | "strong" | "acceptable" | "weak_review" | "over_300m_review";

const earthRadiusMeters = 6_371_000;

export function distanceMeters(left: LatLng, right: LatLng): number {
  const leftLatitude = toRadians(left.latitude);
  const rightLatitude = toRadians(right.latitude);
  const deltaLatitude = toRadians(right.latitude - left.latitude);
  const deltaLongitude = toRadians(right.longitude - left.longitude);
  const haversine =
    Math.sin(deltaLatitude / 2) ** 2 +
    Math.cos(leftLatitude) * Math.cos(rightLatitude) * Math.sin(deltaLongitude / 2) ** 2;

  return 2 * earthRadiusMeters * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
}

export function classifyReferenceDistance(distanceFromGoogleMeters: number): ReferenceDistanceBand {
  if (distanceFromGoogleMeters <= 75) {
    return "excellent";
  }

  if (distanceFromGoogleMeters <= 150) {
    return "strong";
  }

  if (distanceFromGoogleMeters <= 200) {
    return "acceptable";
  }

  if (distanceFromGoogleMeters <= 300) {
    return "weak_review";
  }

  return "over_300m_review";
}

function toRadians(value: number): number {
  return (value * Math.PI) / 180;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/lib/resolver/geo.test.ts`

Expected: PASS.

- [ ] **Step 5: Checkpoint**

Run: `git status --short`

Expected changed files include `src/lib/resolver/geo.ts` and `src/lib/resolver/geo.test.ts`. Do not commit unless authorized.

## Task 3: Opening Hours Validation

**Files:**
- Create: `src/lib/resolver/opening-hours-validation.ts`
- Create: `src/lib/resolver/opening-hours-validation.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/resolver/opening-hours-validation.test.ts`:

```ts
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
    expect(compareOsmHoursWithGoogle("Mo-Fr 08:00-12:00,13:00-17:30; PH off", ["Monday: 8:00 AM - 5:30 PM"])).toBe("inconclusive");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/lib/resolver/opening-hours-validation.test.ts`

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Add the helper**

Create `src/lib/resolver/opening-hours-validation.ts`:

```ts
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
  googleWeekdayDescriptions: string[] | null | undefined,
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
  const googleRange = googleDescriptions.map(parseGoogleWeekdayRange).filter((range): range is string => Boolean(range));

  if (googleRange.length === 0) {
    return "inconclusive";
  }

  const expectedRange = `${opensAt}-${closesAt}`;

  return googleRange.every((range) => range === expectedRange) ? "agrees" : "differs";
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/lib/resolver/opening-hours-validation.test.ts`

Expected: PASS.

- [ ] **Step 5: Checkpoint**

Run: `git status --short`

Expected changed files include `opening-hours-validation.ts` and its test. Do not commit unless authorized.

## Task 4: Resolution Scoring Core

**Files:**
- Create: `src/lib/resolver/place-location-resolution.ts`
- Create: `src/lib/resolver/place-location-resolution.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/resolver/place-location-resolution.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { resolvePlaceLocation, toPlaceLocationResolutionRow } from "./place-location-resolution";

const googleReference = { latitude: 12.5732978, longitude: 78.1692122 };

describe("place location resolution", () => {
  it("auto-approves a strong OSM and Overture agreement", () => {
    const resolution = resolvePlaceLocation({
      curatedPlace: baseCuratedPlace(),
      googleReference,
      osmCandidates: [baseOsmCandidate({ latitude: 12.5737478, longitude: 78.1692122 })],
      overtureCandidates: [baseOvertureCandidate({ latitude: 12.5737578, longitude: 78.1692122 })],
      googleWeekdayDescriptions: ["Monday: Open 24 hours"],
    });

    expect(resolution.status).toBe("auto_approved");
    expect(resolution.coordinateSource).toBe("osm_overture");
    expect(resolution.openingHours).toBe("24/7");
  });

  it("keeps 200-300m matches for review", () => {
    const resolution = resolvePlaceLocation({
      curatedPlace: baseCuratedPlace(),
      googleReference,
      osmCandidates: [baseOsmCandidate({ latitude: 12.5755478, longitude: 78.1692122 })],
      overtureCandidates: [],
      googleWeekdayDescriptions: [],
    });

    expect(resolution.status).toBe("needs_review");
    expect(resolution.reviewReason).toBe("weak_distance_200_300m");
  });

  it("keeps over-300m matches for review rather than rejecting", () => {
    const resolution = resolvePlaceLocation({
      curatedPlace: baseCuratedPlace(),
      googleReference,
      osmCandidates: [baseOsmCandidate({ latitude: 12.5782978, longitude: 78.1692122 })],
      overtureCandidates: [],
      googleWeekdayDescriptions: [],
    });

    expect(resolution.status).toBe("needs_review");
    expect(resolution.reviewReason).toBe("distance_over_300m");
  });

  it("builds a Supabase row without Google coordinate or raw Google hours", () => {
    const resolution = resolvePlaceLocation({
      curatedPlace: baseCuratedPlace(),
      googleReference,
      osmCandidates: [baseOsmCandidate({ latitude: 12.5737478, longitude: 78.1692122 })],
      overtureCandidates: [],
      googleWeekdayDescriptions: ["Monday: Open 24 hours"],
    });

    const row = toPlaceLocationResolutionRow(resolution);

    expect(row).toMatchObject({
      google_curated_place_id: "curated-1",
      google_place_id: "google-place-1",
      coordinate_source: "osm",
      opening_hours: "24/7",
    });
    expect(JSON.stringify(row)).not.toContain("googleReference");
    expect(JSON.stringify(row)).not.toContain("Monday: Open 24 hours");
  });
});

function baseCuratedPlace() {
  return {
    id: "curated-1",
    googlePlaceId: "google-place-1",
    seedName: "Lavato Krishnagiri",
    sourceCategory: "premium_restroom",
    cleanlinessTier: "tier_1",
    highwayName: "NH-44",
    routeContext: "Krishnagiri toll plaza",
  } as const;
}

function baseOsmCandidate(location: { latitude: number; longitude: number }) {
  return {
    source: "osm",
    sourceId: "node/123",
    name: "Lavato Krishnagiri",
    categories: ["toilets", "rest_area"],
    openingHours: "24/7",
    latitude: location.latitude,
    longitude: location.longitude,
  } as const;
}

function baseOvertureCandidate(location: { latitude: number; longitude: number }) {
  return {
    source: "overture",
    sourceId: "overture-123",
    name: "Lavato Krishnagiri",
    categories: ["restroom"],
    confidence: 0.91,
    operatingStatus: "open",
    latitude: location.latitude,
    longitude: location.longitude,
  } as const;
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/lib/resolver/place-location-resolution.test.ts`

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Add the scoring core**

Create `src/lib/resolver/place-location-resolution.ts`:

```ts
import { classifyReferenceDistance, distanceMeters, type LatLng } from "./geo";
import { compareOsmHoursWithGoogle, normalizeOsmOpeningHours, type GoogleHoursValidationStatus } from "./opening-hours-validation";

export type CuratedPlaceForResolution = {
  id: string;
  googlePlaceId: string;
  seedName: string;
  sourceCategory: string;
  cleanlinessTier: string;
  highwayName: string;
  routeContext: string | null;
};

export type OsmCandidate = LatLng & {
  source: "osm";
  sourceId: string;
  name: string;
  categories: string[];
  openingHours?: string | null;
};

export type OvertureCandidate = LatLng & {
  source: "overture";
  sourceId: string;
  name: string;
  categories: string[];
  confidence?: number;
  operatingStatus?: string;
};

export type PlaceLocationResolution = {
  curatedPlace: CuratedPlaceForResolution;
  status: "auto_approved" | "needs_review" | "rejected";
  reviewReason: string | null;
  coordinateSource: "osm" | "overture" | "osm_overture";
  coordinateSourceId: string;
  coordinateSourceLabel: string;
  coordinateConfidence: number;
  latitude: number;
  longitude: number;
  distanceToGoogleReferenceMeters: number;
  openSourceAgreementMeters: number | null;
  openingHours: string | null;
  openingHoursSource: "osm" | null;
  openingHoursSourceId: string | null;
  openingHoursGoogleValidationStatus: GoogleHoursValidationStatus;
};

export type PlaceLocationResolutionRow = {
  google_curated_place_id: string;
  google_place_id: string;
  latitude: number;
  longitude: number;
  coordinate_source: PlaceLocationResolution["coordinateSource"];
  coordinate_source_id: string;
  coordinate_source_label: string;
  coordinate_confidence: number;
  distance_to_google_reference_meters: number;
  open_source_agreement_meters: number | null;
  resolution_status: PlaceLocationResolution["status"];
  rejection_reason: string | null;
  opening_hours: string | null;
  opening_hours_source: "osm" | null;
  opening_hours_source_id: string | null;
  opening_hours_google_validation_status: GoogleHoursValidationStatus;
};

export function resolvePlaceLocation(input: {
  curatedPlace: CuratedPlaceForResolution;
  googleReference: LatLng;
  osmCandidates: OsmCandidate[];
  overtureCandidates: OvertureCandidate[];
  googleWeekdayDescriptions?: string[];
}): PlaceLocationResolution {
  const bestOsm = nearestCandidate(input.googleReference, input.osmCandidates);
  const bestOverture = nearestCandidate(input.googleReference, input.overtureCandidates);

  if (bestOsm && bestOverture) {
    const agreementMeters = distanceMeters(bestOsm.candidate, bestOverture.candidate);
    const preferred = bestOsm.distanceMeters <= bestOverture.distanceMeters ? bestOsm : bestOverture;
    const status = statusForDistance(preferred.distanceMeters, agreementMeters <= 200);

    return {
      curatedPlace: input.curatedPlace,
      status: status.status,
      reviewReason: status.reason,
      coordinateSource: "osm_overture",
      coordinateSourceId: `${bestOsm.candidate.sourceId}|${bestOverture.candidate.sourceId}`,
      coordinateSourceLabel: bestOsm.candidate.name,
      coordinateConfidence: confidenceFor(preferred.distanceMeters, agreementMeters),
      latitude: preferred.candidate.latitude,
      longitude: preferred.candidate.longitude,
      distanceToGoogleReferenceMeters: preferred.distanceMeters,
      openSourceAgreementMeters: agreementMeters,
      openingHours: normalizeOsmOpeningHours(bestOsm.candidate.openingHours),
      openingHoursSource: normalizeOsmOpeningHours(bestOsm.candidate.openingHours) ? "osm" : null,
      openingHoursSourceId: normalizeOsmOpeningHours(bestOsm.candidate.openingHours) ? bestOsm.candidate.sourceId : null,
      openingHoursGoogleValidationStatus: compareOsmHoursWithGoogle(bestOsm.candidate.openingHours, input.googleWeekdayDescriptions),
    };
  }

  if (bestOsm) {
    const status = statusForDistance(bestOsm.distanceMeters, false);

    return {
      curatedPlace: input.curatedPlace,
      status: status.status,
      reviewReason: status.reason,
      coordinateSource: "osm",
      coordinateSourceId: bestOsm.candidate.sourceId,
      coordinateSourceLabel: bestOsm.candidate.name,
      coordinateConfidence: confidenceFor(bestOsm.distanceMeters, null),
      latitude: bestOsm.candidate.latitude,
      longitude: bestOsm.candidate.longitude,
      distanceToGoogleReferenceMeters: bestOsm.distanceMeters,
      openSourceAgreementMeters: null,
      openingHours: normalizeOsmOpeningHours(bestOsm.candidate.openingHours),
      openingHoursSource: normalizeOsmOpeningHours(bestOsm.candidate.openingHours) ? "osm" : null,
      openingHoursSourceId: normalizeOsmOpeningHours(bestOsm.candidate.openingHours) ? bestOsm.candidate.sourceId : null,
      openingHoursGoogleValidationStatus: compareOsmHoursWithGoogle(bestOsm.candidate.openingHours, input.googleWeekdayDescriptions),
    };
  }

  if (bestOverture) {
    const status = statusForDistance(bestOverture.distanceMeters, false);

    return {
      curatedPlace: input.curatedPlace,
      status: status.status,
      reviewReason: status.reason,
      coordinateSource: "overture",
      coordinateSourceId: bestOverture.candidate.sourceId,
      coordinateSourceLabel: bestOverture.candidate.name,
      coordinateConfidence: confidenceFor(bestOverture.distanceMeters, null),
      latitude: bestOverture.candidate.latitude,
      longitude: bestOverture.candidate.longitude,
      distanceToGoogleReferenceMeters: bestOverture.distanceMeters,
      openSourceAgreementMeters: null,
      openingHours: null,
      openingHoursSource: null,
      openingHoursSourceId: null,
      openingHoursGoogleValidationStatus: "osm_missing",
    };
  }

  throw new Error(`No OSM or Overture candidate found for ${input.curatedPlace.googlePlaceId}`);
}

export function toPlaceLocationResolutionRow(resolution: PlaceLocationResolution): PlaceLocationResolutionRow {
  return {
    google_curated_place_id: resolution.curatedPlace.id,
    google_place_id: resolution.curatedPlace.googlePlaceId,
    latitude: resolution.latitude,
    longitude: resolution.longitude,
    coordinate_source: resolution.coordinateSource,
    coordinate_source_id: resolution.coordinateSourceId,
    coordinate_source_label: resolution.coordinateSourceLabel,
    coordinate_confidence: resolution.coordinateConfidence,
    distance_to_google_reference_meters: resolution.distanceToGoogleReferenceMeters,
    open_source_agreement_meters: resolution.openSourceAgreementMeters,
    resolution_status: resolution.status,
    rejection_reason: resolution.reviewReason,
    opening_hours: resolution.openingHours,
    opening_hours_source: resolution.openingHoursSource,
    opening_hours_source_id: resolution.openingHoursSourceId,
    opening_hours_google_validation_status: resolution.openingHoursGoogleValidationStatus,
  };
}

function nearestCandidate<T extends LatLng>(reference: LatLng, candidates: T[]): { candidate: T; distanceMeters: number } | null {
  return candidates
    .map((candidate) => ({ candidate, distanceMeters: distanceMeters(reference, candidate) }))
    .sort((left, right) => left.distanceMeters - right.distanceMeters)[0] ?? null;
}

function statusForDistance(distanceFromGoogleMeters: number, hasOpenSourceAgreement: boolean): { status: "auto_approved" | "needs_review"; reason: string | null } {
  const band = classifyReferenceDistance(distanceFromGoogleMeters);

  if (band === "excellent" || band === "strong") {
    return { status: "auto_approved", reason: null };
  }

  if (band === "acceptable" && hasOpenSourceAgreement) {
    return { status: "auto_approved", reason: null };
  }

  if (band === "acceptable") {
    return { status: "needs_review", reason: "acceptable_distance_without_open_source_agreement" };
  }

  if (band === "weak_review") {
    return { status: "needs_review", reason: "weak_distance_200_300m" };
  }

  return { status: "needs_review", reason: "distance_over_300m" };
}

function confidenceFor(distanceFromGoogleMeters: number, openSourceAgreementMeters: number | null): number {
  const distanceScore = Math.max(0, 1 - distanceFromGoogleMeters / 300);
  const agreementBonus = typeof openSourceAgreementMeters === "number" ? Math.max(0, 0.15 - openSourceAgreementMeters / 2_000) : 0;

  return Math.min(1, Number((distanceScore + agreementBonus).toFixed(3)));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/lib/resolver/place-location-resolution.test.ts`

Expected: PASS.

- [ ] **Step 5: Checkpoint**

Run: `git status --short`

Expected changed files include the resolver core and tests. Do not commit unless authorized.

## Task 5: Compact Source Candidate Loaders

**Files:**
- Create: `src/lib/resolver/source-candidates.ts`
- Create: `src/lib/resolver/source-candidates.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/resolver/source-candidates.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { loadOsmCandidatesFromJson, loadOvertureCandidatesFromJson } from "./source-candidates";

describe("source candidate loaders", () => {
  it("loads compact OSM candidates and preserves opening_hours", () => {
    const rows = loadOsmCandidatesFromJson(JSON.stringify([
      {
        id: "node/1",
        name: "Lavato Krishnagiri",
        lat: 12.5737,
        lon: 78.1692,
        tags: { amenity: "toilets", opening_hours: "24/7" },
      },
    ]));

    expect(rows).toEqual([
      {
        source: "osm",
        sourceId: "node/1",
        name: "Lavato Krishnagiri",
        latitude: 12.5737,
        longitude: 78.1692,
        categories: ["toilets"],
        openingHours: "24/7",
      },
    ]);
  });

  it("loads compact Overture candidates", () => {
    const rows = loadOvertureCandidatesFromJson(JSON.stringify([
      {
        id: "overture-1",
        names: { primary: "Lavato Krishnagiri" },
        geometry: { type: "Point", coordinates: [78.1692, 12.5737] },
        categories: { primary: "restroom" },
        confidence: 0.9,
        operating_status: "open",
      },
    ]));

    expect(rows[0]).toMatchObject({
      source: "overture",
      sourceId: "overture-1",
      name: "Lavato Krishnagiri",
      latitude: 12.5737,
      longitude: 78.1692,
      categories: ["restroom"],
      confidence: 0.9,
      operatingStatus: "open",
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/lib/resolver/source-candidates.test.ts`

Expected: FAIL because `source-candidates.ts` does not exist.

- [ ] **Step 3: Add the loaders**

Create `src/lib/resolver/source-candidates.ts`:

```ts
import type { OsmCandidate, OvertureCandidate } from "./place-location-resolution";

type CompactOsmRow = {
  id: string;
  name?: string;
  lat: number;
  lon: number;
  tags?: Record<string, string>;
};

type CompactOvertureRow = {
  id: string;
  names?: { primary?: string; common?: string };
  geometry?: { type: "Point"; coordinates: [number, number] };
  categories?: { primary?: string; alternate?: string[] };
  confidence?: number;
  operating_status?: string;
};

export function loadOsmCandidatesFromJson(json: string): OsmCandidate[] {
  const rows = JSON.parse(json) as CompactOsmRow[];

  return rows.map((row) => ({
    source: "osm",
    sourceId: row.id,
    name: row.name ?? row.tags?.name ?? row.id,
    latitude: row.lat,
    longitude: row.lon,
    categories: osmCategories(row.tags ?? {}),
    openingHours: row.tags?.opening_hours ?? null,
  }));
}

export function loadOvertureCandidatesFromJson(json: string): OvertureCandidate[] {
  const rows = JSON.parse(json) as CompactOvertureRow[];

  return rows.flatMap((row) => {
    if (row.geometry?.type !== "Point") {
      return [];
    }

    const [longitude, latitude] = row.geometry.coordinates;
    const primaryCategory = row.categories?.primary;

    return [{
      source: "overture" as const,
      sourceId: row.id,
      name: row.names?.primary ?? row.names?.common ?? row.id,
      latitude,
      longitude,
      categories: [primaryCategory, ...(row.categories?.alternate ?? [])].filter((category): category is string => Boolean(category)),
      confidence: row.confidence,
      operatingStatus: row.operating_status,
    }];
  });
}

function osmCategories(tags: Record<string, string>): string[] {
  return [tags.amenity, tags.shop, tags.tourism, tags.highway, tags.brand, tags.operator].filter(
    (value): value is string => Boolean(value),
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/lib/resolver/source-candidates.test.ts`

Expected: PASS.

- [ ] **Step 5: Checkpoint**

Run: `git status --short`

Expected changed files include source candidate loaders and tests. Do not commit unless authorized.

## Task 6: Batch Resolver Orchestration

**Files:**
- Create: `src/lib/resolver/place-location-resolution-import.ts`
- Create: `src/lib/resolver/place-location-resolution-import.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/resolver/place-location-resolution-import.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";

import { resolvePlaceLocationBatch } from "./place-location-resolution-import";

describe("place location resolution import", () => {
  it("resolves a batch with mocked Google details and compact source candidates", async () => {
    const getPlaceDetails = vi.fn(async () => ({
      id: "google-place-1",
      displayName: "Lavato Krishnagiri",
      location: { latitude: 12.5732978, longitude: 78.1692122 },
      types: ["public_bathroom"],
      weekdayDescriptions: ["Monday: Open 24 hours"],
    }));

    const summary = await resolvePlaceLocationBatch({
      googleMode: "assisted",
      maxGoogleDetailsRequests: 1,
      getPlaceDetails,
      curatedPlaces: [{
        id: "curated-1",
        googlePlaceId: "google-place-1",
        seedName: "Lavato Krishnagiri",
        sourceCategory: "premium_restroom",
        cleanlinessTier: "tier_1",
        highwayName: "NH-44",
        routeContext: "Krishnagiri toll plaza",
      }],
      osmCandidates: [{
        source: "osm",
        sourceId: "node/1",
        name: "Lavato Krishnagiri",
        latitude: 12.5737478,
        longitude: 78.1692122,
        categories: ["toilets"],
        openingHours: "24/7",
      }],
      overtureCandidates: [],
    });

    expect(summary).toMatchObject({
      googleDetailsRequests: 1,
      resolvedRows: 1,
      mapReadyRows: 1,
      reviewRows: 0,
    });
    expect(summary.rows[0]).toMatchObject({
      google_place_id: "google-place-1",
      opening_hours: "24/7",
      opening_hours_google_validation_status: "agrees",
    });
  });

  it("respects the Google Details cap", async () => {
    await expect(resolvePlaceLocationBatch({
      googleMode: "assisted",
      maxGoogleDetailsRequests: 0,
      getPlaceDetails: vi.fn(),
      curatedPlaces: [{
        id: "curated-1",
        googlePlaceId: "google-place-1",
        seedName: "Lavato Krishnagiri",
        sourceCategory: "premium_restroom",
        cleanlinessTier: "tier_1",
        highwayName: "NH-44",
        routeContext: "Krishnagiri toll plaza",
      }],
      osmCandidates: [],
      overtureCandidates: [],
    })).rejects.toThrow("Google-assisted resolver batch exceeds cap");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/lib/resolver/place-location-resolution-import.test.ts`

Expected: FAIL because module does not exist.

- [ ] **Step 3: Add batch orchestration**

Create `src/lib/resolver/place-location-resolution-import.ts`:

```ts
import { getPlaceDetails as defaultGetPlaceDetails, type GooglePlaceDetails } from "../google/places";
import { distanceMeters } from "./geo";
import {
  resolvePlaceLocation,
  toPlaceLocationResolutionRow,
  type CuratedPlaceForResolution,
  type OsmCandidate,
  type OvertureCandidate,
  type PlaceLocationResolutionRow,
} from "./place-location-resolution";

type GetPlaceDetails = (placeId: string) => Promise<GooglePlaceDetails>;

export type ResolvePlaceLocationBatchSummary = {
  googleDetailsRequests: number;
  resolvedRows: number;
  mapReadyRows: number;
  reviewRows: number;
  unresolvedRows: number;
  rows: PlaceLocationResolutionRow[];
  unresolved: Array<{ googlePlaceId: string; reason: string }>;
};

export async function resolvePlaceLocationBatch(input: {
  googleMode: "assisted";
  maxGoogleDetailsRequests: number;
  apiKey?: string;
  getPlaceDetails?: GetPlaceDetails;
  curatedPlaces: CuratedPlaceForResolution[];
  osmCandidates: OsmCandidate[];
  overtureCandidates: OvertureCandidate[];
}): Promise<ResolvePlaceLocationBatchSummary> {
  if (input.curatedPlaces.length > input.maxGoogleDetailsRequests) {
    throw new Error(
      `Google-assisted resolver batch exceeds cap: rows=${input.curatedPlaces.length} cap=${input.maxGoogleDetailsRequests}`,
    );
  }

  const getPlaceDetails = input.getPlaceDetails ?? (async (placeId: string) => {
    if (!input.apiKey) {
      throw new Error("GOOGLE_MAPS_SERVER_API_KEY is required for Google-assisted resolver mode.");
    }

    return defaultGetPlaceDetails(placeId, { apiKey: input.apiKey });
  });
  const rows: PlaceLocationResolutionRow[] = [];
  const unresolved: Array<{ googlePlaceId: string; reason: string }> = [];

  for (const curatedPlace of input.curatedPlaces) {
    const details = await getPlaceDetails(curatedPlace.googlePlaceId);

    if (!details.location) {
      unresolved.push({ googlePlaceId: curatedPlace.googlePlaceId, reason: "google_reference_missing_location" });
      continue;
    }

    const nearbyOsm = input.osmCandidates.filter((candidate) => distanceMeters(details.location!, candidate) <= 1_000);
    const nearbyOverture = input.overtureCandidates.filter((candidate) => distanceMeters(details.location!, candidate) <= 1_000);

    try {
      const resolution = resolvePlaceLocation({
        curatedPlace,
        googleReference: details.location,
        osmCandidates: nearbyOsm,
        overtureCandidates: nearbyOverture,
        googleWeekdayDescriptions: details.weekdayDescriptions,
      });
      rows.push(toPlaceLocationResolutionRow(resolution));
    } catch (error) {
      unresolved.push({
        googlePlaceId: curatedPlace.googlePlaceId,
        reason: error instanceof Error ? error.message : "unknown_resolution_error",
      });
    }
  }

  return {
    googleDetailsRequests: input.curatedPlaces.length,
    resolvedRows: rows.length,
    mapReadyRows: rows.filter((row) => row.resolution_status === "auto_approved").length,
    reviewRows: rows.filter((row) => row.resolution_status === "needs_review").length,
    unresolvedRows: unresolved.length,
    rows,
    unresolved,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/lib/resolver/place-location-resolution-import.test.ts`

Expected: PASS.

- [ ] **Step 5: Checkpoint**

Run: `git status --short`

Expected changed files include batch orchestration and tests. Do not commit unless authorized.

## Task 7: Resolver CLI

**Files:**
- Create: `scripts/resolve-place-locations.ts`
- Create: `src/lib/resolver/resolve-place-locations-script.test.ts`
- Modify: `package.json`

- [ ] **Step 1: Write the failing script test**

Create `src/lib/resolver/resolve-place-locations-script.test.ts`:

```ts
import { execFile } from "node:child_process";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);

describe("resolve-place-locations script", () => {
  it("prints a plan-only summary without Google or Supabase env", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "swachh-resolver-"));
    const curatedPath = join(tempDir, "curated.json");
    const osmPath = join(tempDir, "osm.json");
    const overturePath = join(tempDir, "overture.json");

    await writeFile(curatedPath, JSON.stringify([{ id: "curated-1", google_place_id: "google-place-1" }]));
    await writeFile(osmPath, JSON.stringify([]));
    await writeFile(overturePath, JSON.stringify([]));

    const { stdout } = await execFileAsync(
      "node",
      [
        "--experimental-transform-types",
        "scripts/resolve-place-locations.ts",
        "--plan-only",
        `--curated=${curatedPath}`,
        `--osm=${osmPath}`,
        `--overture=${overturePath}`,
        "--max-google-details-requests=5",
      ],
      { cwd: process.cwd(), env: { ...process.env, GOOGLE_MAPS_SERVER_API_KEY: "", SUPABASE_SERVICE_ROLE_KEY: "" } },
    );

    expect(JSON.parse(stdout)).toMatchObject({
      planOnly: true,
      curatedRows: 1,
      osmCandidates: 0,
      overtureCandidates: 0,
      maxGoogleDetailsRequests: 5,
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/lib/resolver/resolve-place-locations-script.test.ts`

Expected: FAIL because the script does not exist.

- [ ] **Step 3: Add package script**

Modify `package.json` scripts:

```json
"resolve:place-locations": "node --experimental-transform-types scripts/resolve-place-locations.ts"
```

- [ ] **Step 4: Add the CLI**

Create `scripts/resolve-place-locations.ts`:

```ts
import { existsSync, readFileSync } from "node:fs";

import { createClient } from "@supabase/supabase-js";

import { resolvePlaceLocationBatch } from "../src/lib/resolver/place-location-resolution-import.ts";
import { loadOsmCandidatesFromJson, loadOvertureCandidatesFromJson } from "../src/lib/resolver/source-candidates.ts";
import type { CuratedPlaceForResolution } from "../src/lib/resolver/place-location-resolution.ts";

type Args = {
  planOnly: boolean;
  dryRun: boolean;
  curatedPath: string;
  osmPath: string;
  overturePath: string;
  maxGoogleDetailsRequests: number;
  writeSupabase: boolean;
};

loadEnvFile(".env.local");

const args = parseArgs(process.argv.slice(2));
const curatedPlaces = loadCuratedPlaces(args.curatedPath);
const osmCandidates = loadOsmCandidatesFromJson(readFileSync(args.osmPath, "utf8"));
const overtureCandidates = loadOvertureCandidatesFromJson(readFileSync(args.overturePath, "utf8"));

if (args.planOnly) {
  console.log(JSON.stringify({
    planOnly: true,
    dryRun: args.dryRun,
    curatedRows: curatedPlaces.length,
    osmCandidates: osmCandidates.length,
    overtureCandidates: overtureCandidates.length,
    maxGoogleDetailsRequests: args.maxGoogleDetailsRequests,
    wouldWriteSupabase: args.writeSupabase && !args.dryRun,
  }, null, 2));
  process.exit(0);
}

const apiKey = requireEnv("GOOGLE_MAPS_SERVER_API_KEY");
const summary = await resolvePlaceLocationBatch({
  googleMode: "assisted",
  maxGoogleDetailsRequests: args.maxGoogleDetailsRequests,
  apiKey,
  curatedPlaces,
  osmCandidates,
  overtureCandidates,
});

console.log(JSON.stringify({
  dryRun: args.dryRun,
  googleDetailsRequests: summary.googleDetailsRequests,
  resolvedRows: summary.resolvedRows,
  mapReadyRows: summary.mapReadyRows,
  reviewRows: summary.reviewRows,
  unresolvedRows: summary.unresolvedRows,
}, null, 2));

if (args.dryRun || !args.writeSupabase) {
  process.exit(0);
}

const supabaseUrl = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
const serviceRoleKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });

for (const batch of chunk(summary.rows, 250)) {
  const { error } = await supabase.from("place_location_resolutions").upsert(batch, {
    onConflict: "google_curated_place_id,coordinate_source,coordinate_source_id",
  });

  if (error) {
    throw new Error(`Supabase place_location_resolutions upsert failed: ${error.message}`);
  }
}

function parseArgs(argv: string[]): Args {
  const planOnly = argv.includes("--plan-only");
  const dryRun = argv.includes("--dry-run") || planOnly;
  const writeSupabase = argv.includes("--write-supabase");
  const curatedPath = requiredArg(argv, "--curated=");
  const osmPath = requiredArg(argv, "--osm=");
  const overturePath = requiredArg(argv, "--overture=");
  const maxGoogleDetailsRequests = Number(requiredArg(argv, "--max-google-details-requests="));

  if (!Number.isInteger(maxGoogleDetailsRequests) || maxGoogleDetailsRequests < 0) {
    throw new Error("--max-google-details-requests must be a non-negative integer.");
  }

  return { planOnly, dryRun, curatedPath, osmPath, overturePath, maxGoogleDetailsRequests, writeSupabase };
}

function requiredArg(argv: string[], prefix: string): string {
  const value = argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length);

  if (!value) {
    throw new Error(`${prefix} is required.`);
  }

  return value;
}

function loadCuratedPlaces(path: string): CuratedPlaceForResolution[] {
  const rows = JSON.parse(readFileSync(path, "utf8")) as Array<{
    id: string;
    google_place_id: string;
    seed_name?: string;
    source_category?: string;
    cleanliness_tier?: string;
    highway_name?: string;
    route_context?: string | null;
  }>;

  return rows.map((row) => ({
    id: row.id,
    googlePlaceId: row.google_place_id,
    seedName: row.seed_name ?? row.google_place_id,
    sourceCategory: row.source_category ?? "generic_candidate",
    cleanlinessTier: row.cleanliness_tier ?? "tier_3",
    highwayName: row.highway_name ?? "unknown",
    routeContext: row.route_context ?? null,
  }));
}

function loadEnvFile(path: string) {
  if (!existsSync(path)) {
    return;
  }

  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);

    if (!match) {
      continue;
    }

    const [, key, rawValue] = match;
    process.env[key] ??= rawValue.replace(/^['"]|['"]$/g, "");
  }
}

function requireEnv(name: string): string {
  const value = process.env[name];

  if (!value) {
    throw new Error(`${name} is not configured.`);
  }

  return value;
}

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];

  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }

  return chunks;
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- src/lib/resolver/resolve-place-locations-script.test.ts`

Expected: PASS.

- [ ] **Step 6: Checkpoint**

Run: `git status --short`

Expected changed files include the CLI, package.json, and script test. Do not commit unless authorized.

## Task 8: Local Resolved Map Endpoint

**Files:**
- Create: `src/app/api/place-location-resolutions/route.ts`
- Create: `src/app/api/place-location-resolutions/route.test.ts`

- [ ] **Step 1: Write the failing endpoint test**

Create `src/app/api/place-location-resolutions/route.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";

vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn(() => ({
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          order: vi.fn(async () => ({
            data: [{
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
            }],
            error: null,
          })),
        })),
      })),
    })),
  })),
}));

describe("GET /api/place-location-resolutions", () => {
  it("returns map-ready local resolved coordinates without Google details", async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role";

    const { GET } = await import("./route");
    const response = await GET(new Request("http://localhost/api/place-location-resolutions"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      placeDetailsRequests: 0,
      points: [{
        id: "resolution-1",
        latitude: 12.5737,
        longitude: 78.1692,
        coordinateSource: "osm",
        openingHours: "24/7",
      }],
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/app/api/place-location-resolutions/route.test.ts`

Expected: FAIL because the route does not exist.

- [ ] **Step 3: Add the endpoint**

Create `src/app/api/place-location-resolutions/route.ts`:

```ts
import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

const MAP_RESPONSE_CACHE_CONTROL = "public, s-maxage=3600, stale-while-revalidate=86400";

type PlaceLocationResolutionRow = {
  id: string;
  google_curated_place_id: string;
  google_place_id: string;
  latitude: number;
  longitude: number;
  coordinate_source: string;
  coordinate_confidence: number;
  opening_hours: string | null;
  opening_hours_source: string | null;
  resolution_status: string;
};

export async function GET(_request: Request) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    return NextResponse.json({ error: "Place location resolutions are not configured.", points: [], placeDetailsRequests: 0 }, { status: 503 });
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data, error } = await supabase
    .from("place_location_resolutions")
    .select("id,google_curated_place_id,google_place_id,latitude,longitude,coordinate_source,coordinate_confidence,opening_hours,opening_hours_source,resolution_status")
    .eq("resolution_status", "auto_approved")
    .order("coordinate_confidence", { ascending: false });

  if (error) {
    return NextResponse.json({ error: "Resolved place locations could not be loaded.", points: [], placeDetailsRequests: 0 }, { status: 502 });
  }

  const points = ((data ?? []) as PlaceLocationResolutionRow[]).map((row) => ({
    id: row.id,
    googleCuratedPlaceId: row.google_curated_place_id,
    googlePlaceId: row.google_place_id,
    latitude: Number(row.latitude),
    longitude: Number(row.longitude),
    coordinateSource: row.coordinate_source,
    coordinateConfidence: Number(row.coordinate_confidence),
    openingHours: row.opening_hours,
    openingHoursSource: row.opening_hours_source,
    resolutionStatus: row.resolution_status,
  }));

  return NextResponse.json(
    { points, placeDetailsRequests: 0 },
    { headers: { "Cache-Control": MAP_RESPONSE_CACHE_CONTROL } },
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/app/api/place-location-resolutions/route.test.ts`

Expected: PASS.

- [ ] **Step 5: Checkpoint**

Run: `git status --short`

Expected changed files include the endpoint and test. Do not commit unless authorized.

## Task 9: Source Extraction Notes

**Files:**
- Create: `docs/data-sourcing/local-coordinate-resolver-source-extracts.md`

- [ ] **Step 1: Add extraction guidance doc**

Create `docs/data-sourcing/local-coordinate-resolver-source-extracts.md`:

````md
# Local Coordinate Resolver Source Extracts

Date: 2026-05-14

The resolver does not store raw OSM or Overture files in Supabase. Raw source files are temporary local inputs used to produce compact JSON candidates.

## OSM India Extract

1. Download the India `.osm.pbf` extract from Geofabrik to local scratch storage.
2. Filter only highway-relevant POIs such as toilets, fuel stations, restaurants, cafes, food courts, rest areas, service areas, parking, and service-road amenities.
3. Export compact rows shaped like:

```json
[
  {
    "id": "node/123",
    "name": "Example Food Plaza",
    "lat": 12.34,
    "lon": 78.9,
    "tags": { "amenity": "restaurant", "opening_hours": "Mo-Su 08:00-22:00" }
  }
]
```

4. Run `npm run resolve:place-locations -- --plan-only ...` first.
5. Run dry-run resolver batches with an explicit Google Details cap.
6. Delete the raw `.osm.pbf` after compact candidates and resolver ledgers are produced.

## Overture Places

Download only India or highway-relevant bounding boxes when possible. Export compact rows shaped like:

```json
[
  {
    "id": "overture-id",
    "names": { "primary": "Example Food Plaza" },
    "geometry": { "type": "Point", "coordinates": [78.9, 12.34] },
    "categories": { "primary": "restaurant" },
    "confidence": 0.91,
    "operating_status": "open"
  }
]
```

## Storage Rule

Supabase stores only `place_location_resolutions` rows. It never stores raw OSM extracts, raw Overture GeoParquet rows, Google coordinates, or Google opening-hour text.
````

- [ ] **Step 2: Check docs are present**

Run: `test -f docs/data-sourcing/local-coordinate-resolver-source-extracts.md && echo ok`

Expected: `ok`.

- [ ] **Step 3: Checkpoint**

Run: `git status --short`

Expected changed file includes the source extraction doc. Do not commit unless authorized.

## Task 10: Verification

**Files:**
- No new files. Run repository verification.

- [ ] **Step 1: Run focused resolver tests**

Run:

```bash
npm test -- src/lib/resolver src/lib/supabase/place-location-resolutions-migration.test.ts src/app/api/place-location-resolutions/route.test.ts
```

Expected: all resolver, migration, script, and endpoint tests PASS.

- [ ] **Step 2: Run full test suite**

Run: `npm test -- --testTimeout=10000`

Expected: all tests PASS.

- [ ] **Step 3: Run typecheck**

Run: `npm run typecheck`

Expected: `tsc --noEmit` exits with code 0.

- [ ] **Step 4: Run lint**

Run: `npm run lint`

Expected: `eslint . --max-warnings=0` exits with code 0.

- [ ] **Step 5: Run CLI plan-only smoke test**

Run the same command shape used in the script test with local fixture files. Expected JSON includes `planOnly: true`, candidate counts, and `wouldWriteSupabase: false`.

- [ ] **Step 6: Confirm no forbidden Google fields are stored**

Run:

```bash
rg "google_latitude|google_longitude|google_opening_hours|google_weekday_descriptions" supabase src scripts --glob '!**/*.test.ts'
```

Expected: no output.

- [ ] **Step 7: Final status**

Run: `git status --short`

Expected: only intentional files from this plan are changed. Do not commit unless authorized.