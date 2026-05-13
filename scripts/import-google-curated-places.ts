import { existsSync, readFileSync } from "node:fs";

import { createClient } from "@supabase/supabase-js";

import { buildNationalHighwaySearchCorridors } from "../src/lib/discovery/national-highway-corridors.ts";
import {
  discoverGoogleCuratedPlaces,
  filterAcceptedGoogleCuratedPlaceRowsForUpsert,
  planGoogleCuratedPlaceDiscovery,
  shouldAbortGoogleCuratedPlaceImport,
  toGoogleCuratedPlaceRows,
  toRejectedGoogleCuratedPlaceRows,
  type ExistingGoogleCuratedPlaceRow,
} from "../src/lib/discovery/google-curated-place-import.ts";
import { getCachedNationalHighwayOverlays } from "../src/lib/highways/national-highways.ts";
import {
  defaultMaxHighwayDiversionMeters,
  type CleanlinessTier,
  type HighwaySearchCorridor,
} from "../src/lib/discovery/highway-place-discovery.ts";

type ImportArgs = {
  dryRun: boolean;
  planOnly: boolean;
  corridorSource: "seeded" | "national-highways";
  jobOffset?: number;
  jobLimit?: number;
  seedNames?: string[];
  cleanlinessTiers?: CleanlinessTier[];
  maxTextSearchRequests?: number;
  maxDiversionMeters?: number;
  concurrency?: number;
  requestSpacingMs?: number;
  maxFailureRate?: number;
};

const defaultTextSearchMonthlyFreeCap = 35_000;
const defaultMaxFailureRate = 0.5;
const defaultFailureRateMinimumSearchedJobs = 10;

loadEnvFile(".env.local");

const args = parseArgs(process.argv.slice(2));
const corridors = buildDiscoveryCorridors(args.corridorSource);
const maxTextSearchRequests =
  args.maxTextSearchRequests ??
  readPositiveIntegerEnv("GOOGLE_PLACES_TEXT_SEARCH_MONTHLY_REMAINING") ??
  defaultTextSearchMonthlyFreeCap;

const plan = planGoogleCuratedPlaceDiscovery({
  corridors,
  jobOffset: args.jobOffset,
  jobLimit: args.jobLimit,
  seedNames: args.seedNames,
  cleanlinessTiers: args.cleanlinessTiers,
  maxTextSearchRequests,
  maxDiversionMeters: args.maxDiversionMeters,
});

if (args.planOnly) {
  console.log(
    JSON.stringify(
      {
        planOnly: true,
        dryRun: args.dryRun,
        corridorSource: args.corridorSource,
        seedNames: args.seedNames,
        cleanlinessTiers: args.cleanlinessTiers,
        ...plan,
      },
      null,
      2,
    ),
  );
  process.exit(0);
}

const googleApiKey = requireEnv("GOOGLE_MAPS_SERVER_API_KEY");
const supabaseUrl = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
const serviceRoleKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
const maxFailureRate = args.maxFailureRate ?? defaultMaxFailureRate;

const discovery = await discoverGoogleCuratedPlaces({
  apiKey: googleApiKey,
  corridors,
  jobOffset: args.jobOffset,
  jobLimit: args.jobLimit,
  seedNames: args.seedNames,
  cleanlinessTiers: args.cleanlinessTiers,
  maxTextSearchRequests,
  maxDiversionMeters: args.maxDiversionMeters,
  maxConcurrentSearches: args.concurrency,
  requestSpacingMs: args.requestSpacingMs,
  maxFailureRate,
  minimumFailureRateSampleSize: defaultFailureRateMinimumSearchedJobs,
  onProgress: ({ searchedJobs, totalJobs, matches, failures }) => {
    if (searchedJobs === 1 || searchedJobs % 100 === 0 || searchedJobs === totalJobs) {
      console.log(`searched=${searchedJobs}/${totalJobs} raw_matches=${matches} failures=${failures}`);
    }
  },
});

const rows = toGoogleCuratedPlaceRows(discovery.places);
const rejectedRows = toRejectedGoogleCuratedPlaceRows(discovery.rejectedPlaces);
const abortForFailureRate = discovery.abortedForFailureRate || shouldAbortGoogleCuratedPlaceImport({
  searchedJobs: discovery.searchedJobs,
  failedJobs: discovery.failedJobs,
  maxFailureRate,
  minimumSearchedJobs: defaultFailureRateMinimumSearchedJobs,
});

console.log(
  JSON.stringify(
    {
      dryRun: args.dryRun,
      corridorSource: args.corridorSource,
      maxTextSearchRequests,
      concurrency: args.concurrency ?? 1,
      requestSpacingMs: args.requestSpacingMs ?? 0,
      maxDiversionMeters: args.maxDiversionMeters ?? defaultMaxHighwayDiversionMeters,
      totalJobs: discovery.totalJobs,
      searchedJobs: discovery.searchedJobs,
      missingCorridorJobs: discovery.missingCorridorJobs,
      failedJobs: discovery.failedJobs,
      failureRate: discovery.searchedJobs > 0 ? discovery.failedJobs / discovery.searchedJobs : 0,
      maxFailureRate,
      minimumFailureRateSampleSize: defaultFailureRateMinimumSearchedJobs,
      abortForFailureRate,
      failureSamples: discovery.failures.slice(0, 5),
      rawMatches: discovery.rawMatches,
      rawRejectedMatches: discovery.rawRejectedMatches,
      uniquePlaces: discovery.places.length,
      uniqueRejectedPlaces: discovery.rejectedPlaces.length,
      rowsToUpsert: rows.length,
      rejectedRowsToUpsert: rejectedRows.length,
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
const existingRows = await fetchExistingGoogleCuratedPlaceRows(supabase, rows.map((row) => row.google_place_id));
const rowsToUpsert = filterAcceptedGoogleCuratedPlaceRowsForUpsert(rows, existingRows);
const skippedAcceptedRows = rows.length - rowsToUpsert.length;

if (skippedAcceptedRows > 0) {
  console.log(`accepted_rows_skipped_existing_stronger=${skippedAcceptedRows}`);
}

for (const batch of chunk(rowsToUpsert, 250)) {
  const { error } = await supabase.from("google_curated_places").upsert(batch, { onConflict: "google_place_id" });

  if (error) {
    throw new Error(`Supabase upsert failed: ${error.message}`);
  }

  upsertedRows += batch.length;
  console.log(`upserted=${upsertedRows}/${rowsToUpsert.length}`);
}

let rejectedRowsAttempted = 0;
for (const batch of chunk(rejectedRows, 250)) {
  const { error } = await supabase.from("google_curated_places").upsert(batch, {
    onConflict: "google_place_id",
    ignoreDuplicates: true,
  });

  if (error) {
    throw new Error(`Supabase rejected-row upsert failed: ${error.message}`);
  }

  rejectedRowsAttempted += batch.length;
  console.log(`rejected_rows_attempted=${rejectedRowsAttempted}/${rejectedRows.length}`);
}

console.log(JSON.stringify({ ok: !abortForFailureRate, upsertedRows, skippedAcceptedRows, rejectedRowsAttempted }, null, 2));

if (abortForFailureRate) {
  process.exit(1);
}

function parseArgs(argv: string[]): ImportArgs {
  const dryRun = argv.includes("--dry-run");
  const planOnly = argv.includes("--plan-only");
  const corridorSourceArg = argv.find((arg) => arg.startsWith("--corridor-source="));
  const jobOffsetArg = argv.find((arg) => arg.startsWith("--job-offset="));
  const jobLimitArg = argv.find((arg) => arg.startsWith("--job-limit="));
  const seedArgs = argv.filter((arg) => arg.startsWith("--seed="));
  const tierArgs = argv.filter((arg) => arg.startsWith("--tier="));
  const maxTextSearchRequestsArg = argv.find((arg) => arg.startsWith("--max-text-search-requests="));
  const maxDiversionMetersArg = argv.find((arg) => arg.startsWith("--max-diversion-meters="));
  const concurrencyArg = argv.find((arg) => arg.startsWith("--concurrency="));
  const requestSpacingMsArg = argv.find((arg) => arg.startsWith("--request-spacing-ms="));
  const maxFailureRateArg = argv.find((arg) => arg.startsWith("--max-failure-rate="));
  const jobOffset = jobOffsetArg ? Number(jobOffsetArg.slice("--job-offset=".length)) : undefined;
  const jobLimit = jobLimitArg ? Number(jobLimitArg.slice("--job-limit=".length)) : undefined;
  const seedNames = parseCommaSeparatedArgs(seedArgs, "--seed=");
  const cleanlinessTiers = parseTierArgs(tierArgs);
  const maxTextSearchRequests = maxTextSearchRequestsArg
    ? Number(maxTextSearchRequestsArg.slice("--max-text-search-requests=".length))
    : undefined;
  const maxDiversionMeters = maxDiversionMetersArg
    ? Number(maxDiversionMetersArg.slice("--max-diversion-meters=".length))
    : undefined;
  const concurrency = concurrencyArg ? Number(concurrencyArg.slice("--concurrency=".length)) : undefined;
  const requestSpacingMs = requestSpacingMsArg ? Number(requestSpacingMsArg.slice("--request-spacing-ms=".length)) : undefined;
  const maxFailureRate = maxFailureRateArg ? Number(maxFailureRateArg.slice("--max-failure-rate=".length)) : undefined;
  const corridorSource = corridorSourceArg?.slice("--corridor-source=".length) ?? "seeded";

  if (corridorSource !== "seeded" && corridorSource !== "national-highways") {
    throw new Error("--corridor-source must be either seeded or national-highways.");
  }

  if (typeof jobOffset === "number" && (!Number.isInteger(jobOffset) || jobOffset < 0)) {
    throw new Error("--job-offset must be a non-negative integer.");
  }

  if (typeof jobLimit === "number" && (!Number.isInteger(jobLimit) || jobLimit <= 0)) {
    throw new Error("--job-limit must be a positive integer.");
  }

  if (
    typeof maxTextSearchRequests === "number" &&
    (!Number.isInteger(maxTextSearchRequests) || maxTextSearchRequests <= 0)
  ) {
    throw new Error("--max-text-search-requests must be a positive integer.");
  }

  if (typeof maxDiversionMeters === "number" && (!Number.isInteger(maxDiversionMeters) || maxDiversionMeters <= 0)) {
    throw new Error("--max-diversion-meters must be a positive integer.");
  }

  if (typeof concurrency === "number" && (!Number.isInteger(concurrency) || concurrency <= 0)) {
    throw new Error("--concurrency must be a positive integer.");
  }

  if (typeof requestSpacingMs === "number" && (!Number.isInteger(requestSpacingMs) || requestSpacingMs < 0)) {
    throw new Error("--request-spacing-ms must be a non-negative integer.");
  }

  if (typeof maxFailureRate === "number" && (!(maxFailureRate > 0) || maxFailureRate > 1)) {
    throw new Error("--max-failure-rate must be greater than 0 and less than or equal to 1.");
  }

  return { dryRun, planOnly, corridorSource, jobOffset, jobLimit, seedNames, cleanlinessTiers, maxTextSearchRequests, maxDiversionMeters, concurrency, requestSpacingMs, maxFailureRate };
}

function buildDiscoveryCorridors(corridorSource: ImportArgs["corridorSource"]): HighwaySearchCorridor[] | undefined {
  return corridorSource === "national-highways" ? buildNationalHighwaySearchCorridors(getCachedNationalHighwayOverlays()) : undefined;
}

function parseCommaSeparatedArgs(args: string[], prefix: string): string[] | undefined {
  const values = args.flatMap((arg) => arg.slice(prefix.length).split(",")).map((value) => value.trim()).filter(Boolean);

  return values.length > 0 ? values : undefined;
}

function parseTierArgs(args: string[]): CleanlinessTier[] | undefined {
  const values = parseCommaSeparatedArgs(args, "--tier=");

  if (!values) {
    return undefined;
  }

  for (const value of values) {
    if (!["tier_1", "tier_2", "tier_3", "tier_4"].includes(value)) {
      throw new Error(`Unsupported --tier value: ${value}`);
    }
  }

  return values as CleanlinessTier[];
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

async function fetchExistingGoogleCuratedPlaceRows(
  supabaseClient: typeof supabase,
  googlePlaceIds: string[],
): Promise<ExistingGoogleCuratedPlaceRow[]> {
  const uniquePlaceIds = [...new Set(googlePlaceIds)];
  const existingRows: ExistingGoogleCuratedPlaceRow[] = [];

  for (const batch of chunk(uniquePlaceIds, 250)) {
    const { data, error } = await supabaseClient
      .from("google_curated_places")
      .select("google_place_id,cleanliness_tier,verification_status")
      .in("google_place_id", batch);

    if (error) {
      throw new Error(`Supabase existing-row lookup failed: ${error.message}`);
    }

    existingRows.push(...((data ?? []) as ExistingGoogleCuratedPlaceRow[]));
  }

  return existingRows;
}