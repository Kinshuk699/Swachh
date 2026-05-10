import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("Google curated places migration", () => {
  const migrationSql = readFileSync(
    join(process.cwd(), "supabase/migrations/202605090002_google_curated_places.sql"),
    "utf8",
  );
  const tierMigrationSql = readFileSync(
    join(process.cwd(), "supabase/migrations/202605100001_google_curated_place_tiers.sql"),
    "utf8",
  );

  it("stores Google place_id plus local highway annotations", () => {
    expect(migrationSql).toContain("create table if not exists public.google_curated_places");
    expect(migrationSql).toContain("google_place_id text not null unique");
    expect(migrationSql).toContain("highway_name text not null");
    expect(migrationSql).toContain("restroom_confidence numeric");
    expect(migrationSql).toContain("distance_from_highway_meters int");
  });

  it("does not persist copied Google details in the curated table", () => {
    expect(migrationSql).not.toMatch(/formatted_address|google_rating|opening_hours|google_phone|google_latitude|google_longitude/i);
  });

  it("adds clean-toilet tier provenance without storing copied Google details", () => {
    expect(tierMigrationSql).toContain("cleanliness_tier text");
    expect(tierMigrationSql).toContain("source_category text");
    expect(tierMigrationSql).toContain("source_evidence text");
    expect(tierMigrationSql).toContain("tier_1");
    expect(tierMigrationSql).toContain("likely_clean");
    expect(tierMigrationSql).toContain("verified_clean");
    expect(tierMigrationSql).not.toMatch(/formatted_address|google_rating|opening_hours|google_phone|google_latitude|google_longitude/i);
  });

  it("expands verification statuses before writing likely clean rows", () => {
    const statusConstraintIndex = tierMigrationSql.indexOf("drop constraint if exists google_curated_places_verification_status_check");
    const likelyCleanUpdateIndex = tierMigrationSql.indexOf("set verification_status = 'likely_clean'");

    expect(statusConstraintIndex).toBeGreaterThanOrEqual(0);
    expect(likelyCleanUpdateIndex).toBeGreaterThanOrEqual(0);
    expect(statusConstraintIndex).toBeLessThan(likelyCleanUpdateIndex);
  });
});