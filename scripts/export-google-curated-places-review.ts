import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { createClient } from "@supabase/supabase-js";

import {
  defaultMaxHighwayDiversionMeters,
  type CleanlinessTier,
  type ProxyType,
} from "../src/lib/discovery/highway-place-discovery.ts";
import {
  classifyGoogleCuratedPlaceDisplay,
  type GoogleCuratedPlaceDisplayReason,
} from "../src/lib/discovery/google-curated-place-display.ts";
import {
  createGoogleCuratedPlacesManualReview,
  toManualReviewRow,
  type GoogleCuratedPlaceManualReviewBucket,
  type GoogleCuratedPlaceManualReviewRecord,
} from "../src/lib/discovery/google-curated-place-manual-review.ts";
import { getPlaceDetails } from "../src/lib/google/places.ts";

type ExportArgs = {
  generatedDate: string;
  outputDir: string;
};

const reviewRowsPageSize = 1000;
const placeDetailsMinIntervalMs = 125;
const placeDetailsMaxAttempts = 4;
let nextPlaceDetailsRequestAt = 0;
const acceptedReviewStatuses = ["likely_clean", "matched", "approved", "verified_clean"] as const;
const acceptedReviewTiers = ["tier_1", "tier_2", "tier_3"] as const satisfies CleanlinessTier[];
const reviewColumns = [
  "id",
  "google_place_id",
  "seed_name",
  "region",
  "proxy_type",
  "cleanliness_tier",
  "source_category",
  "source_evidence",
  "highway_name",
  "route_context",
  "restroom_confidence",
  "distance_from_highway_meters",
  "local_notes",
  "verification_status",
  "matched_at",
  "updated_at",
].join(",");

if (process.argv.includes("--help") || process.argv.includes("-h")) {
  console.log(
    [
      "export-google-curated-places-review",
      "",
      "Exports a manual review CSV/Markdown containing user-display-excluded accepted rows plus all rejected rows.",
      "This command performs 0 Text Search requests. It uses Place Details for known stored place_id values only.",
      "",
      "Options:",
      "  --date=YYYY-MM-DD       Date suffix for generated files.",
      "  --output-dir=PATH        Output directory. Defaults to docs/data-sourcing.",
    ].join("\n"),
  );
  process.exit(0);
}

loadEnvFile(".env.local");

const args = parseArgs(process.argv.slice(2));
const googleApiKey = requireEnv("GOOGLE_MAPS_SERVER_API_KEY");
const supabaseUrl = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
const serviceRoleKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const acceptedRecords = await fetchAcceptedGoogleCuratedPlaceRecords();
const rejectedRecords = await fetchRejectedGoogleCuratedPlaceRecords();
const rows = [];
let acceptedDisplayableRows = 0;
let placeDetailsRequests = 0;
let placeDetailsFailures = 0;

for (const record of acceptedRecords) {
  placeDetailsRequests += 1;

  try {
    const details = await getPlaceDetailsForExport(record.google_place_id);
    const decision = classifyGoogleCuratedPlaceDisplay(
      {
        seed_name: record.seed_name,
        proxy_type: record.proxy_type as ProxyType,
        source_category: record.source_category,
      },
      details,
    );

    if (decision.displayable) {
      acceptedDisplayableRows += 1;
      continue;
    }

    rows.push(
      toManualReviewRow({
        bucket: bucketForDisplayReason(decision.reason),
        displayReason: decision.reason,
        record,
        details,
      }),
    );
  } catch (error) {
    placeDetailsFailures += 1;
    rows.push(
      toManualReviewRow({
        bucket: "details_unavailable",
        displayReason: "details_unavailable",
        record,
        message: describeGoogleDetailsError(error),
      }),
    );
  }
}

for (const record of rejectedRecords) {
  placeDetailsRequests += 1;

  try {
    const details = await getPlaceDetailsForExport(record.google_place_id);
    rows.push(toManualReviewRow({ bucket: "already_rejected", displayReason: "already_rejected", record, details }));
  } catch (error) {
    placeDetailsFailures += 1;
    rows.push(
      toManualReviewRow({
        bucket: "already_rejected",
        displayReason: "details_unavailable",
        record,
        message: describeGoogleDetailsError(error),
      }),
    );
  }
}

const review = createGoogleCuratedPlacesManualReview({
  generatedDate: args.generatedDate,
  supabaseUrl,
  googleUsage: { textSearchRequests: 0, placeDetailsRequests, placeDetailsFailures },
  rows,
});

mkdirSync(args.outputDir, { recursive: true });

const baseName = `google-curated-places-manual-review-${args.generatedDate}`;
const csvPath = join(args.outputDir, `${baseName}.csv`);
const markdownPath = join(args.outputDir, `${baseName}.md`);

writeFileSync(csvPath, `${review.csv}\n`);
writeFileSync(markdownPath, `${review.markdown}\n`);

console.log(
  JSON.stringify(
    {
      ok: true,
      acceptedRowsScanned: acceptedRecords.length,
      acceptedDisplayableRows,
      displayReviewRows: rows.length - rejectedRecords.length,
      rejectedRows: rejectedRecords.length,
      totalReviewRows: rows.length,
      googleUsage: { textSearchRequests: 0, placeDetailsRequests, placeDetailsFailures },
      csvPath,
      markdownPath,
    },
    null,
    2,
  ),
);

function parseArgs(argv: string[]): ExportArgs {
  const dateArg = argv.find((arg) => arg.startsWith("--date="));
  const outputDirArg = argv.find((arg) => arg.startsWith("--output-dir="));
  const generatedDate = dateArg?.slice("--date=".length) ?? new Date().toISOString().slice(0, 10);
  const outputDir = outputDirArg?.slice("--output-dir=".length) ?? "docs/data-sourcing";

  if (!/^\d{4}-\d{2}-\d{2}$/.test(generatedDate)) {
    throw new Error("--date must use YYYY-MM-DD format.");
  }

  return { generatedDate, outputDir };
}

async function fetchAcceptedGoogleCuratedPlaceRecords(): Promise<GoogleCuratedPlaceManualReviewRecord[]> {
  return fetchGoogleCuratedPlaceRecords("accepted");
}

async function fetchRejectedGoogleCuratedPlaceRecords(): Promise<GoogleCuratedPlaceManualReviewRecord[]> {
  return fetchGoogleCuratedPlaceRecords("rejected");
}

async function fetchGoogleCuratedPlaceRecords(kind: "accepted" | "rejected"): Promise<GoogleCuratedPlaceManualReviewRecord[]> {
  const records: GoogleCuratedPlaceManualReviewRecord[] = [];

  for (let page = 0; ; page += 1) {
    const from = page * reviewRowsPageSize;
    const to = from + reviewRowsPageSize - 1;
    let query = supabase
      .from("google_curated_places")
      .select(reviewColumns)
      .lte("distance_from_highway_meters", defaultMaxHighwayDiversionMeters)
      .order("cleanliness_tier", { ascending: true })
      .order("seed_name", { ascending: true })
      .order("distance_from_highway_meters", { ascending: true })
      .range(from, to);

    if (kind === "accepted") {
      query = query.in("verification_status", acceptedReviewStatuses).in("cleanliness_tier", acceptedReviewTiers);
    } else {
      query = query.eq("verification_status", "rejected");
    }

    const { data, error } = await query;

    if (error) {
      throw new Error(`Supabase ${kind} review query failed: ${error.message}`);
    }

    const pageRecords = (data ?? []) as unknown as GoogleCuratedPlaceManualReviewRecord[];
    records.push(...pageRecords);

    if (pageRecords.length < reviewRowsPageSize) {
      return records;
    }
  }
}

function bucketForDisplayReason(reason: Exclude<GoogleCuratedPlaceDisplayReason, "displayable">): GoogleCuratedPlaceManualReviewBucket {
  switch (reason) {
    case "road_object_quarantine":
      return "road_object_quarantine";
    case "details_unavailable":
      return "details_unavailable";
    case "missing_location":
      return "missing_location";
    case "name_type_mismatch":
      return "name_type_mismatch";
  }
}

async function getPlaceDetailsForExport(placeId: string) {
  let lastError: unknown;

  for (let attempt = 1; attempt <= placeDetailsMaxAttempts; attempt += 1) {
    try {
      await waitForPlaceDetailsSlot();
      return await getPlaceDetails(placeId, { apiKey: googleApiKey });
    } catch (error) {
      lastError = error;

      if (!isRetriableGoogleDetailsError(error) || attempt === placeDetailsMaxAttempts) {
        throw error;
      }

      await delay(attempt * 2_000);
    }
  }

  throw lastError;
}

async function waitForPlaceDetailsSlot() {
  const now = Date.now();
  const waitMs = Math.max(0, nextPlaceDetailsRequestAt - now);
  nextPlaceDetailsRequestAt = Math.max(now, nextPlaceDetailsRequestAt) + placeDetailsMinIntervalMs;

  if (waitMs > 0) {
    await delay(waitMs);
  }
}

function isRetriableGoogleDetailsError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes("429") || message.includes("RESOURCE_EXHAUSTED") || message.includes("RATE_LIMIT_EXCEEDED");
}

function describeGoogleDetailsError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);

  if (message.includes("404") || message.includes("NOT_FOUND")) {
    return "Google Place Details unavailable: 404 NOT_FOUND stale place_id; refresh this stored place_id before review.";
  }

  if (isRetriableGoogleDetailsError(error)) {
    return "Google Place Details unavailable after retry due to Google rate limiting.";
  }

  return message.replace(/\s+/g, " ").slice(0, 300);
}

function delay(milliseconds: number) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
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
    process.env[key] ??= rawValue.replace(/^[']|[']$/g, "").replace(/^["]|["]$/g, "");
  }
}

function requireEnv(name: string): string {
  const value = process.env[name];

  if (!value) {
    throw new Error(`${name} is not configured.`);
  }

  return value;
}
