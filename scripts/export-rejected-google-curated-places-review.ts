import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { createClient } from "@supabase/supabase-js";

import {
  createRejectedGoogleCuratedPlacesReview,
  toRejectedGoogleCuratedPlaceReviewRow,
  type RejectedGoogleCuratedPlaceRecord,
} from "../src/lib/discovery/google-curated-place-review-export.ts";
import { getPlaceDetails } from "../src/lib/google/places.ts";

type ExportArgs = {
  generatedDate: string;
  outputDir: string;
};

loadEnvFile(".env.local");

const args = parseArgs(process.argv.slice(2));
const googleApiKey = requireEnv("GOOGLE_MAPS_SERVER_API_KEY");
const supabaseUrl = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
const serviceRoleKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const { data, error } = await supabase
  .from("google_curated_places")
  .select(
    "id,google_place_id,seed_name,region,proxy_type,cleanliness_tier,source_category,source_evidence,highway_name,route_context,restroom_confidence,distance_from_highway_meters,local_notes,matched_at,updated_at",
  )
  .eq("verification_status", "rejected")
  .order("cleanliness_tier", { ascending: true })
  .order("seed_name", { ascending: true })
  .order("distance_from_highway_meters", { ascending: true });

if (error) {
  throw new Error(`Supabase rejected-row query failed: ${error.message}`);
}

const records = (data ?? []) as RejectedGoogleCuratedPlaceRecord[];
const rows = [];

for (const record of records) {
  const details = await getPlaceDetails(record.google_place_id, { apiKey: googleApiKey });
  rows.push(toRejectedGoogleCuratedPlaceReviewRow(record, details));
}

const review = createRejectedGoogleCuratedPlacesReview({
  generatedDate: args.generatedDate,
  supabaseUrl,
  googleUsage: { textSearchRequests: 0, placeDetailsRequests: records.length },
  rows,
});

mkdirSync(args.outputDir, { recursive: true });

const baseName = `rejected-google-curated-places-review-${args.generatedDate}`;
const csvPath = join(args.outputDir, `${baseName}.csv`);
const markdownPath = join(args.outputDir, `${baseName}.md`);

writeFileSync(csvPath, `${review.csv}\n`);
writeFileSync(markdownPath, `${review.markdown}\n`);

console.log(
  JSON.stringify(
    {
      ok: true,
      rejectedRows: records.length,
      googleUsage: { textSearchRequests: 0, placeDetailsRequests: records.length },
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