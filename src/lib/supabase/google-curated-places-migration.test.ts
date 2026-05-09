import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("Google curated places migration", () => {
  const migrationSql = readFileSync(
    join(process.cwd(), "supabase/migrations/202605090002_google_curated_places.sql"),
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
});