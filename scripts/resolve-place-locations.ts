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
  writeSupabase: boolean;
};

loadEnvFile(".env.local");

const args = parseArgs(process.argv.slice(2));
const curatedPlaces = loadCuratedPlaces(args.curatedPath);
const osmCandidates = loadOsmCandidatesFromJson(readFileSync(args.osmPath, "utf8"));
const overtureCandidates = loadOvertureCandidatesFromJson(readFileSync(args.overturePath, "utf8"));

if (args.planOnly) {
  console.log(
    JSON.stringify(
      {
        planOnly: true,
        dryRun: args.dryRun,
        curatedRows: curatedPlaces.length,
        osmCandidates: osmCandidates.length,
        overtureCandidates: overtureCandidates.length,
        googleDetailsRequests: 0,
        wouldWriteSupabase: args.writeSupabase && !args.dryRun,
      },
      null,
      2,
    ),
  );
  process.exit(0);
}

const summary = await resolvePlaceLocationBatch({
  curatedPlaces,
  osmCandidates,
  overtureCandidates,
});

console.log(
  JSON.stringify(
    {
      dryRun: args.dryRun,
      googleDetailsRequests: summary.googleDetailsRequests,
      resolvedRows: summary.resolvedRows,
      mapReadyRows: summary.mapReadyRows,
      reviewRows: summary.reviewRows,
      unresolvedRows: summary.unresolvedRows,
    },
    null,
    2,
  ),
);

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

  return { planOnly, dryRun, curatedPath, osmPath, overturePath, writeSupabase };
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
    seed_name?: string;
    source_category?: string;
    cleanliness_tier?: string;
    highway_name?: string;
    route_context?: string | null;
  }>;

  return rows.map((row) => ({
    id: row.id,
    seedName: row.seed_name ?? row.id,
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

    const key = match[1];
    const rawValue = match[2];

    if (!key || rawValue === undefined) {
      continue;
    }

    process.env[key] ??= rawValue.replace(/^["']|["']$/g, "");
  }
}

function requireEnv(name: string): string {
  const value = process.env[name];

  if (!value) {
    throw new Error(`${name} is not configured.`);
  }

  return value;
}

function chunk<T>(items: readonly T[], size: number): T[][] {
  const chunks: T[][] = [];

  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }

  return chunks;
}