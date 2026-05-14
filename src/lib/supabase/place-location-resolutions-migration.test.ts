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