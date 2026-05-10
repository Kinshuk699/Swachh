import { existsSync, readFileSync } from "node:fs";

import { createClient } from "@supabase/supabase-js";

import {
  discoverGoogleCuratedPlaces,
  toGoogleCuratedPlaceRows,
} from "../src/lib/discovery/google-curated-place-import.ts";

type ImportArgs = {
  dryRun: boolean;
  jobLimit?: number;
  maxTextSearchRequests?: number;
};

const defaultTextSearchMonthlyFreeCap = 35_000;

loadEnvFile(".env.local");

const args = parseArgs(process.argv.slice(2));
const googleApiKey = requireEnv("GOOGLE_MAPS_SERVER_API_KEY");
const supabaseUrl = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
const serviceRoleKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
const maxTextSearchRequests =
  args.maxTextSearchRequests ??
  readPositiveIntegerEnv("GOOGLE_PLACES_TEXT_SEARCH_MONTHLY_REMAINING") ??
  defaultTextSearchMonthlyFreeCap;

const discovery = await discoverGoogleCuratedPlaces({
  apiKey: googleApiKey,
  jobLimit: args.jobLimit,
  maxTextSearchRequests,
  onProgress: ({ searchedJobs, totalJobs, matches, failures }) => {
    if (searchedJobs === 1 || searchedJobs % 100 === 0 || searchedJobs === totalJobs) {
      console.log(`searched=${searchedJobs}/${totalJobs} raw_matches=${matches} failures=${failures}`);
    }
  },
});

const rows = toGoogleCuratedPlaceRows(discovery.places);

console.log(
  JSON.stringify(
    {
      dryRun: args.dryRun,
      maxTextSearchRequests,
      totalJobs: discovery.totalJobs,
      searchedJobs: discovery.searchedJobs,
      missingCorridorJobs: discovery.missingCorridorJobs,
      failedJobs: discovery.failedJobs,
      rawMatches: discovery.rawMatches,
      uniquePlaces: discovery.places.length,
      rowsToUpsert: rows.length,
    },
    null,
    2,
  ),
);

if (args.dryRun) {
  process.exit(0);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

let upsertedRows = 0;
for (const batch of chunk(rows, 250)) {
  const { error } = await supabase.from("google_curated_places").upsert(batch, { onConflict: "google_place_id" });

  if (error) {
    throw new Error(`Supabase upsert failed: ${error.message}`);
  }

  upsertedRows += batch.length;
  console.log(`upserted=${upsertedRows}/${rows.length}`);
}

console.log(JSON.stringify({ ok: true, upsertedRows }, null, 2));

function parseArgs(argv: string[]): ImportArgs {
  const dryRun = argv.includes("--dry-run");
  const jobLimitArg = argv.find((arg) => arg.startsWith("--job-limit="));
  const maxTextSearchRequestsArg = argv.find((arg) => arg.startsWith("--max-text-search-requests="));
  const jobLimit = jobLimitArg ? Number(jobLimitArg.slice("--job-limit=".length)) : undefined;
  const maxTextSearchRequests = maxTextSearchRequestsArg
    ? Number(maxTextSearchRequestsArg.slice("--max-text-search-requests=".length))
    : undefined;

  if (typeof jobLimit === "number" && (!Number.isInteger(jobLimit) || jobLimit <= 0)) {
    throw new Error("--job-limit must be a positive integer.");
  }

  if (
    typeof maxTextSearchRequests === "number" &&
    (!Number.isInteger(maxTextSearchRequests) || maxTextSearchRequests <= 0)
  ) {
    throw new Error("--max-text-search-requests must be a positive integer.");
  }

  return { dryRun, jobLimit, maxTextSearchRequests };
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

function readPositiveIntegerEnv(name: string): number | undefined {
  const value = process.env[name];

  if (!value) {
    return undefined;
  }

  const parsedValue = Number(value);

  if (!Number.isInteger(parsedValue) || parsedValue <= 0) {
    throw new Error(`${name} must be a positive integer.`);
  }

  return parsedValue;
}

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];

  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }

  return chunks;
}