import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { createClient } from "@supabase/supabase-js";

import {
  defaultMaxHighwayDiversionMeters,
  type CleanlinessTier,
  type ProxyType,
  type SourceCategory,
} from "../src/lib/discovery/highway-place-discovery.ts";
import { classifyGoogleCuratedPlaceDisplay } from "../src/lib/discovery/google-curated-place-display.ts";
import { getPlaceDetails, type GooglePlaceDetails } from "../src/lib/google/places.ts";
import { sampleHighwayStops } from "../src/lib/restrooms/sample-stops.ts";

type ExportArgs = {
  generatedDate: string;
  outputDir: string;
  limit: number;
};

type GoogleCuratedMapRecord = {
  id: string;
  google_place_id: string;
  seed_name: string;
  region: string;
  proxy_type: ProxyType;
  cleanliness_tier: CleanlinessTier;
  source_category: SourceCategory;
  source_evidence: string;
  highway_name: string;
  route_context: string | null;
  restroom_confidence: number;
  distance_from_highway_meters: number;
  local_notes: string | null;
  verification_status: "matched" | "likely_clean" | "approved" | "verified_clean";
  matched_at: string;
  updated_at: string;
};

type MapLedgerRow = {
  mapSource: string;
  displayDecision: string;
  whyOnMap: string;
  resolvedGoogleName: string;
  seedName: string;
  googlePlaceId: string;
  googleTypes: string[];
  googleMapsUrl: string;
  category: string;
  proxyType: string;
  cleanlinessTier: string;
  sourceCategory: string;
  verificationStatus: string;
  restroomConfidence: string;
  distanceFromHighwayMeters: string;
  highwayName: string;
  routeContext: string;
  region: string;
  priceLabel: string;
  facilities: string[];
  openNow: string;
  verified: string;
  localNotes: string;
  sourceEvidence: string;
  id: string;
  matchedAt: string;
  updatedAt: string;
};

type ExclusionSummary = {
  reason: string;
  seedName: string;
  resolvedGoogleName: string;
  googleTypes: string[];
};

const allFoundMapStatuses = ["likely_clean", "matched", "verified_clean", "approved"] as const;
const allFoundMapTiers = ["tier_1", "tier_2", "tier_3"] as const satisfies CleanlinessTier[];
const allFoundMapTierSet = new Set<CleanlinessTier>(allFoundMapTiers);
const defaultMapLimit = 1500;
const defaultStoredRowLimit = 2000;
const pageSize = 1000;
const placeDetailsMinIntervalMs = 125;
const placeDetailsMaxAttempts = 4;
let nextPlaceDetailsRequestAt = 0;

const columns = [
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
      "export-google-curated-places-map-ledger",
      "",
      "Exports the current map-visible places ledger for accepted all_found Google curated places plus local sample stops.",
      "This command performs 0 Text Search requests. It uses Place Details for known stored place_id values only.",
      "",
      "Options:",
      "  --date=YYYY-MM-DD       Date suffix for generated files.",
      "  --output-dir=PATH        Output directory. Defaults to docs/data-sourcing.",
      "  --limit=NUMBER          Current map limit to mirror. Defaults to 1500.",
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

const storedRecords = await fetchAcceptedMapRecords();
const allFoundRecords = storedRecords.filter((record) => allFoundMapTierSet.has(record.cleanliness_tier));
const diversifiedRecords = diversifyStoredRows(allFoundRecords);
const maxPlaceDetailsRequests = Math.min(diversifiedRecords.length, args.limit * 2);
const mapRows: MapLedgerRow[] = [];
const exclusions: ExclusionSummary[] = [];
let placeDetailsRequests = 0;
let placeDetailsFailures = 0;

for (const record of diversifiedRecords.slice(0, maxPlaceDetailsRequests)) {
  if (mapRows.filter((row) => row.mapSource === "google_curated_hydrated").length >= args.limit) {
    break;
  }

  placeDetailsRequests += 1;

  try {
    const details = await getPlaceDetailsForExport(record.google_place_id);
    const decision = classifyGoogleCuratedPlaceDisplay(record, details);

    if (!decision.displayable) {
      exclusions.push({
        reason: decision.reason,
        seedName: record.seed_name,
        resolvedGoogleName: details.displayName,
        googleTypes: details.types,
      });
      continue;
    }

    mapRows.push(toGoogleCuratedMapLedgerRow(record, details));
  } catch (error) {
    placeDetailsFailures += 1;
    exclusions.push({
      reason: describeGoogleDetailsError(error),
      seedName: record.seed_name,
      resolvedGoogleName: "Google Details unavailable",
      googleTypes: ["details_unavailable"],
    });
  }
}

mapRows.push(...sampleHighwayStops.map(toLocalSampleMapLedgerRow));

const sortedRows = mapRows.sort(compareMapLedgerRows);
const summary = {
  generatedDate: args.generatedDate,
  supabaseUrl,
  googleUsage: { textSearchRequests: 0, placeDetailsRequests, placeDetailsFailures },
  storedRowsScanned: storedRecords.length,
  acceptedAllFoundRows: allFoundRecords.length,
  mapRows: sortedRows,
  exclusions,
};

mkdirSync(args.outputDir, { recursive: true });

const baseName = `google-curated-places-map-ledger-${args.generatedDate}`;
const csvPath = join(args.outputDir, `${baseName}.csv`);
const markdownPath = join(args.outputDir, `${baseName}.md`);

writeFileSync(csvPath, `${toCsv(sortedRows)}\n`);
writeFileSync(markdownPath, `${toMarkdown(summary)}\n`);

console.log(
  JSON.stringify(
    {
      ok: true,
      storedRowsScanned: storedRecords.length,
      acceptedAllFoundRows: allFoundRecords.length,
      mapRows: sortedRows.length,
      googleCuratedMapRows: sortedRows.filter((row) => row.mapSource === "google_curated_hydrated").length,
      localSampleRows: sortedRows.filter((row) => row.mapSource === "local_sample_stop").length,
      excludedRows: exclusions.length,
      googleUsage: summary.googleUsage,
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
  const limitArg = argv.find((arg) => arg.startsWith("--limit="));
  const generatedDate = dateArg?.slice("--date=".length) ?? new Date().toISOString().slice(0, 10);
  const outputDir = outputDirArg?.slice("--output-dir=".length) ?? "docs/data-sourcing";
  const rawLimit = Number(limitArg?.slice("--limit=".length) ?? defaultMapLimit);

  if (!/^\d{4}-\d{2}-\d{2}$/.test(generatedDate)) {
    throw new Error("--date must use YYYY-MM-DD format.");
  }

  if (!Number.isFinite(rawLimit) || rawLimit <= 0) {
    throw new Error("--limit must be a positive number.");
  }

  return { generatedDate, outputDir, limit: Math.floor(rawLimit) };
}

async function fetchAcceptedMapRecords(): Promise<GoogleCuratedMapRecord[]> {
  const records: GoogleCuratedMapRecord[] = [];

  for (let from = 0; from < defaultStoredRowLimit; from += pageSize) {
    const to = Math.min(from + pageSize - 1, defaultStoredRowLimit - 1);
    const { data, error } = await supabase
      .from("google_curated_places")
      .select(columns)
      .in("verification_status", allFoundMapStatuses)
      .lte("distance_from_highway_meters", defaultMaxHighwayDiversionMeters)
      .order("cleanliness_tier", { ascending: true })
      .order("restroom_confidence", { ascending: false })
      .range(from, to);

    if (error) {
      throw new Error(`Supabase map ledger query failed: ${error.message}`);
    }

    const pageRecords = (data ?? []) as unknown as GoogleCuratedMapRecord[];
    records.push(...pageRecords);

    if (pageRecords.length < to - from + 1) {
      break;
    }
  }

  return records;
}

function diversifyStoredRows(records: GoogleCuratedMapRecord[]): GoogleCuratedMapRecord[] {
  const groups = new Map<string, GoogleCuratedMapRecord[]>();

  for (const record of records) {
    const groupKey = `${record.source_category}:${record.seed_name.toLowerCase()}`;
    const group = groups.get(groupKey) ?? [];
    group.push(record);
    groups.set(groupKey, group);
  }

  const diversifiedRecords: GoogleCuratedMapRecord[] = [];
  const groupValues = [...groups.values()];
  let groupIndex = 0;

  while (groupValues.some((group) => group.length > 0)) {
    const group = groupValues[groupIndex % groupValues.length];
    const record = group.shift();

    if (record) {
      diversifiedRecords.push(record);
    }

    groupIndex += 1;
  }

  return diversifiedRecords;
}

function toGoogleCuratedMapLedgerRow(record: GoogleCuratedMapRecord, details: GooglePlaceDetails): MapLedgerRow {
  return {
    mapSource: "google_curated_hydrated",
    displayDecision: "shown_on_map",
    whyOnMap: whyGoogleCuratedRecordIsOnMap(record, details),
    resolvedGoogleName: details.displayName,
    seedName: record.seed_name,
    googlePlaceId: record.google_place_id,
    googleTypes: details.types,
    googleMapsUrl: details.googleMapsUri ?? "",
    category: toStopCategory(record.proxy_type),
    proxyType: record.proxy_type,
    cleanlinessTier: record.cleanliness_tier,
    sourceCategory: record.source_category,
    verificationStatus: record.verification_status,
    restroomConfidence: String(record.restroom_confidence),
    distanceFromHighwayMeters: String(record.distance_from_highway_meters),
    highwayName: record.highway_name,
    routeContext: record.route_context ?? "",
    region: record.region,
    priceLabel: record.proxy_type === "premium_lavatory" ? "Paid" : "Customer access",
    facilities: [cleanToiletDisplayLabel(record.cleanliness_tier, record.source_category), "Highway-filtered", record.route_context ?? record.region],
    openNow: String(details.openNow ?? false),
    verified: String(record.verification_status === "verified_clean" || record.verification_status === "approved"),
    localNotes: record.local_notes ?? "",
    sourceEvidence: record.source_evidence,
    id: record.id,
    matchedAt: record.matched_at,
    updatedAt: record.updated_at,
  };
}

function toLocalSampleMapLedgerRow(stop: (typeof sampleHighwayStops)[number]): MapLedgerRow {
  return {
    mapSource: "local_sample_stop",
    displayDecision: "shown_on_map",
    whyOnMap: "Built-in local/sample stop currently passed into MapCanvas by the planner UI.",
    resolvedGoogleName: stop.googlePlaceName ?? stop.name,
    seedName: stop.name,
    googlePlaceId: stop.placeId ?? "",
    googleTypes: [],
    googleMapsUrl: stop.googleMapsUri ?? "",
    category: stop.category,
    proxyType: stop.category,
    cleanlinessTier: stop.cleanlinessTier ?? "",
    sourceCategory: stop.source,
    verificationStatus: stop.verified ? "verified_clean" : "local_sample",
    restroomConfidence: String(stop.confidence),
    distanceFromHighwayMeters: String(stop.distanceFromHighwayMeters),
    highwayName: stop.highway,
    routeContext: stop.locality,
    region: "local_sample",
    priceLabel: stop.priceLabel,
    facilities: stop.facilities,
    openNow: String(stop.openNow),
    verified: String(stop.verified),
    localNotes: stop.isInsideDenseCity ? "Inside dense city/local staging sample." : "",
    sourceEvidence: "Local sample data bundled in src/lib/restrooms/sample-stops.ts.",
    id: stop.id,
    matchedAt: "",
    updatedAt: "",
  };
}

function whyGoogleCuratedRecordIsOnMap(record: GoogleCuratedMapRecord, details: GooglePlaceDetails): string {
  return [
    `${record.cleanliness_tier} ${record.source_category.replaceAll("_", " ")} candidate`,
    `seeded by ${record.seed_name}`,
    `status ${record.verification_status}`,
    `${record.distance_from_highway_meters}m from ${record.highway_name}`,
    `Google name/types passed display validation as ${details.displayName}${details.types.length ? ` (${details.types.join("|")})` : ""}`,
  ].join("; ");
}

function toStopCategory(proxyType: ProxyType): string {
  if (proxyType === "fuel_cafe" || proxyType === "fuel_station") {
    return "fuel_station";
  }

  if (proxyType === "food_plaza" || proxyType === "wayside_amenity") {
    return "food_plaza";
  }

  if (proxyType === "premium_lavatory") {
    return "public_restroom";
  }

  return "restaurant_proxy";
}

function cleanToiletDisplayLabel(cleanlinessTier: CleanlinessTier, sourceCategory: SourceCategory): string {
  if (sourceCategory === "premium_restroom") {
    return "Premium restroom";
  }

  if (sourceCategory === "official_wayside_amenity") {
    return "Official wayside amenity";
  }

  if (sourceCategory === "premium_fuel_program") {
    return "Likely clean fuel stop";
  }

  if (sourceCategory === "food_plaza" || sourceCategory === "organized_restaurant") {
    return "Likely clean restaurant stop";
  }

  if (cleanlinessTier === "tier_4") {
    return "Needs verification";
  }

  return "Highway restroom stop";
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
    return "details_unavailable_404_stale_place_id";
  }

  if (isRetriableGoogleDetailsError(error)) {
    return "details_unavailable_rate_limited";
  }

  return message.replace(/\s+/g, " ").slice(0, 160);
}

function toCsv(rows: MapLedgerRow[]): string {
  const header = [
    "map_source",
    "display_decision",
    "why_on_map",
    "resolved_google_name",
    "seed_name",
    "google_place_id",
    "google_types",
    "google_maps_url",
    "category",
    "proxy_type",
    "cleanliness_tier",
    "source_category",
    "verification_status",
    "restroom_confidence",
    "distance_from_highway_meters",
    "highway_name",
    "route_context",
    "region",
    "price_label",
    "facilities",
    "open_now",
    "verified",
    "local_notes",
    "source_evidence",
    "id",
    "matched_at",
    "updated_at",
  ];

  const lines = rows.map((row) =>
    [
      row.mapSource,
      row.displayDecision,
      row.whyOnMap,
      row.resolvedGoogleName,
      row.seedName,
      row.googlePlaceId,
      row.googleTypes.join("|"),
      row.googleMapsUrl,
      row.category,
      row.proxyType,
      row.cleanlinessTier,
      row.sourceCategory,
      row.verificationStatus,
      row.restroomConfidence,
      row.distanceFromHighwayMeters,
      row.highwayName,
      row.routeContext,
      row.region,
      row.priceLabel,
      row.facilities.join("|"),
      row.openNow,
      row.verified,
      row.localNotes,
      row.sourceEvidence,
      row.id,
      row.matchedAt,
      row.updatedAt,
    ].map(csvCell).join(","),
  );

  return [header.join(","), ...lines].join("\n");
}

function toMarkdown(input: {
  generatedDate: string;
  supabaseUrl: string;
  googleUsage: { textSearchRequests: number; placeDetailsRequests: number; placeDetailsFailures: number };
  storedRowsScanned: number;
  acceptedAllFoundRows: number;
  mapRows: MapLedgerRow[];
  exclusions: ExclusionSummary[];
}): string {
  const googleRows = input.mapRows.filter((row) => row.mapSource === "google_curated_hydrated");
  const localRows = input.mapRows.filter((row) => row.mapSource === "local_sample_stop");

  return [
    `# Google Curated Places Map Ledger - ${input.generatedDate}`,
    "",
    `Generated from hosted Supabase project ${input.supabaseUrl} for places currently eligible to appear on the map.` ,
    "",
    `Google usage for this export: ${input.googleUsage.textSearchRequests} Text Search requests, ${input.googleUsage.placeDetailsRequests} Place Details requests, ${input.googleUsage.placeDetailsFailures} Place Details failures.`,
    "",
    "## What This Ledger Is",
    "",
    "This is the map inventory: rows that passed the same all_found Tier 1-3, highway-distance, Google Place Details, and display-filter checks used by the map, plus the local sample stops bundled into the app.",
    "",
    "## Counts",
    "",
    `- stored rows scanned before display filtering: ${input.storedRowsScanned}`,
    `- accepted all_found Tier 1-3 rows: ${input.acceptedAllFoundRows}`,
    `- Google curated rows shown on map: ${googleRows.length}`,
    `- local/sample rows shown on map: ${localRows.length}`,
    `- total ledger rows: ${input.mapRows.length}`,
    `- accepted rows excluded from map after display filtering or Details failure: ${input.exclusions.length}`,
    "",
    "## Counts By Map Source",
    "",
    ...formatCounts(countBy(input.mapRows, (row) => row.mapSource)),
    "",
    "## Counts By Cleanliness Tier",
    "",
    ...formatCounts(countBy(googleRows, (row) => row.cleanlinessTier || "local_or_unknown")),
    "",
    "## Counts By Source Category",
    "",
    ...formatCounts(countBy(googleRows, (row) => row.sourceCategory || "local_or_unknown")),
    "",
    "## Top Seeds On Map",
    "",
    ...formatCounts(countBy(googleRows, (row) => row.seedName)).slice(0, 30),
    "",
    "## Exclusions After Display Filtering",
    "",
    ...formatCounts(countBy(input.exclusions, (row) => row.reason)),
    "",
    "## Review Guidance",
    "",
    "- Use this ledger to understand why something is currently on the map.",
    "- Use the manual review ledger to decide what excluded/rejected rows should be removed, kept as candidates, or rescued onto the map.",
    "- The resolved_google_name column is the Google Maps display name returned by Place Details for the stored google_place_id.",
  ].join("\n");
}

function compareMapLedgerRows(left: MapLedgerRow, right: MapLedgerRow): number {
  return (
    left.mapSource.localeCompare(right.mapSource) ||
    left.cleanlinessTier.localeCompare(right.cleanlinessTier) ||
    left.seedName.localeCompare(right.seedName) ||
    Number(left.distanceFromHighwayMeters) - Number(right.distanceFromHighwayMeters) ||
    left.resolvedGoogleName.localeCompare(right.resolvedGoogleName)
  );
}

function csvCell(value: string): string {
  if (!/[",\n\r]/.test(value)) {
    return value;
  }

  return `"${value.replaceAll('"', '""')}"`;
}

function countBy<T>(items: T[], keyForItem: (item: T) => string): Map<string, number> {
  const counts = new Map<string, number>();

  for (const item of items) {
    const key = keyForItem(item);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  return counts;
}

function formatCounts(counts: Map<string, number>): string[] {
  if (counts.size === 0) {
    return ["- None"];
  }

  return [...counts.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .map(([label, count]) => `- ${label}: ${count}`);
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
