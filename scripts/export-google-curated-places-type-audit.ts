import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import {
  recommendManualReviewTier,
  type ManualReviewTierAuditInput,
  type ManualReviewTierRecommendation,
} from "../src/lib/discovery/google-curated-place-type-audit.ts";
import type { CleanlinessTier, ProxyType, SourceCategory } from "../src/lib/discovery/highway-place-discovery.ts";
import type { GoogleCuratedPlaceManualReviewRow } from "../src/lib/discovery/google-curated-place-manual-review.ts";

type ExportArgs = {
  generatedDate: string;
  inputPath: string;
  outputDir: string;
};

type AuditRow = {
  recommendation: ManualReviewTierRecommendation;
  original: ManualReviewTierAuditInput & {
    reviewDecision: string;
    googleMapsUrl: string;
    googlePlaceId: string;
    highwayName: string;
    routeContext: string;
    region: string;
    restroomConfidence: string;
    localNotes: string;
    id: string;
    matchedAt: string;
    updatedAt: string;
  };
};

if (process.argv.includes("--help") || process.argv.includes("-h")) {
  console.log(
    [
      "export-google-curated-places-type-audit",
      "",
      "Exports a type-aware tier recommendation ledger from an existing Google curated places manual review CSV.",
      "This command performs 0 Google requests and 0 Supabase requests. It only reads the input CSV.",
      "",
      "Options:",
      "  --date=YYYY-MM-DD       Date suffix for default input/output files.",
      "  --input=PATH            Input manual review CSV. Defaults to docs/data-sourcing/google-curated-places-manual-review-<date>.csv.",
      "  --output-dir=PATH        Output directory. Defaults to docs/data-sourcing.",
    ].join("\n"),
  );
  process.exit(0);
}

const args = parseArgs(process.argv.slice(2));

if (!existsSync(args.inputPath)) {
  throw new Error(`Input CSV does not exist: ${args.inputPath}`);
}

const rows = parseManualReviewCsv(readFileSync(args.inputPath, "utf8"));
const auditRows = rows.map((row) => ({ recommendation: recommendManualReviewTier(row), original: row })).sort(compareAuditRows);

mkdirSync(args.outputDir, { recursive: true });

const baseName = `google-curated-places-type-aware-review-${args.generatedDate}`;
const csvPath = join(args.outputDir, `${baseName}.csv`);
const markdownPath = join(args.outputDir, `${baseName}.md`);

writeFileSync(csvPath, `${toCsv(auditRows)}\n`);
writeFileSync(markdownPath, `${toMarkdown({ generatedDate: args.generatedDate, inputPath: args.inputPath, rows: auditRows })}\n`);

console.log(
  JSON.stringify(
    {
      ok: true,
      inputPath: args.inputPath,
      rowsRead: rows.length,
      auditRows: auditRows.length,
      googleUsage: { textSearchRequests: 0, placeDetailsRequests: 0 },
      csvPath,
      markdownPath,
      byRecommendedTier: Object.fromEntries(countBy(auditRows, (row) => row.recommendation.recommendedTier)),
      byRecommendedAction: Object.fromEntries(countBy(auditRows, (row) => row.recommendation.recommendedAction)),
    },
    null,
    2,
  ),
);

function parseArgs(argv: string[]): ExportArgs {
  const dateArg = argv.find((arg) => arg.startsWith("--date="));
  const inputArg = argv.find((arg) => arg.startsWith("--input="));
  const outputDirArg = argv.find((arg) => arg.startsWith("--output-dir="));
  const generatedDate = dateArg?.slice("--date=".length) ?? new Date().toISOString().slice(0, 10);
  const outputDir = outputDirArg?.slice("--output-dir=".length) ?? "docs/data-sourcing";
  const inputPath = inputArg?.slice("--input=".length) ?? join(outputDir, `google-curated-places-manual-review-${generatedDate}.csv`);

  if (!/^\d{4}-\d{2}-\d{2}$/.test(generatedDate)) {
    throw new Error("--date must use YYYY-MM-DD format.");
  }

  return { generatedDate, inputPath, outputDir };
}

function parseManualReviewCsv(input: string): AuditRow["original"][] {
  const parsedRows = parseCsv(input);
  const [header, ...bodyRows] = parsedRows;

  if (!header) {
    return [];
  }

  const columnIndex = new Map(header.map((columnName, index) => [columnName, index]));

  return bodyRows
    .filter((row) => row.length === header.length)
    .map((row) => {
      const get = (columnName: string) => row[columnIndex.get(columnName) ?? -1] ?? "";

      return {
        reviewBucket: get("review_bucket") as GoogleCuratedPlaceManualReviewRow["reviewBucket"],
        displayReason: get("display_reason") as GoogleCuratedPlaceManualReviewRow["displayReason"],
        reviewDecision: get("review_decision"),
        verificationStatus: get("verification_status") as GoogleCuratedPlaceManualReviewRow["verificationStatus"],
        seedName: get("seed_name"),
        resolvedGoogleName: get("resolved_google_name"),
        googleTypes: get("google_types").split("|").filter(Boolean),
        googleMapsUrl: get("google_maps_url"),
        googlePlaceId: get("google_place_id"),
        highwayName: get("highway_name"),
        routeContext: get("route_context"),
        region: get("region"),
        proxyType: get("proxy_type") as ProxyType,
        cleanlinessTier: get("cleanliness_tier") as CleanlinessTier,
        sourceCategory: get("source_category") as SourceCategory,
        restroomConfidence: get("restroom_confidence"),
        distanceFromHighwayMeters: Number(get("distance_from_highway_meters")),
        localNotes: get("local_notes"),
        sourceEvidence: get("source_evidence"),
        id: get("id"),
        matchedAt: get("matched_at"),
        updatedAt: get("updated_at"),
      };
    });
}

function parseCsv(input: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;

  for (let index = 0; index < input.length; index += 1) {
    const character = input[index];
    const nextCharacter = input[index + 1];

    if (inQuotes) {
      if (character === '"' && nextCharacter === '"') {
        cell += '"';
        index += 1;
      } else if (character === '"') {
        inQuotes = false;
      } else {
        cell += character;
      }
      continue;
    }

    if (character === '"') {
      inQuotes = true;
    } else if (character === ",") {
      row.push(cell);
      cell = "";
    } else if (character === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else if (character !== "\r") {
      cell += character;
    }
  }

  if (cell || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }

  return rows;
}

function toCsv(rows: AuditRow[]): string {
  const header = [
    "recommended_action",
    "recommended_tier",
    "recommended_source_category",
    "recommended_verification_status",
    "recommended_label",
    "type_signal",
    "brand_signal",
    "why_recommended",
    "original_review_bucket",
    "original_display_reason",
    "original_review_decision",
    "original_verification_status",
    "seed_name",
    "resolved_google_name",
    "google_types",
    "google_maps_url",
    "google_place_id",
    "highway_name",
    "route_context",
    "region",
    "proxy_type",
    "original_cleanliness_tier",
    "original_source_category",
    "restroom_confidence",
    "distance_from_highway_meters",
    "local_notes",
    "source_evidence",
    "id",
    "matched_at",
    "updated_at",
  ];

  const lines = rows.map((row) =>
    [
      row.recommendation.recommendedAction,
      row.recommendation.recommendedTier,
      row.recommendation.recommendedSourceCategory,
      row.recommendation.recommendedVerificationStatus,
      row.recommendation.recommendedLabel,
      row.recommendation.typeSignal,
      row.recommendation.brandSignal,
      row.recommendation.whyRecommended,
      row.original.reviewBucket,
      row.original.displayReason,
      row.original.reviewDecision,
      row.original.verificationStatus,
      row.original.seedName,
      row.original.resolvedGoogleName,
      row.original.googleTypes.join("|"),
      row.original.googleMapsUrl,
      row.original.googlePlaceId,
      row.original.highwayName,
      row.original.routeContext,
      row.original.region,
      row.original.proxyType,
      row.original.cleanlinessTier,
      row.original.sourceCategory,
      row.original.restroomConfidence,
      String(row.original.distanceFromHighwayMeters),
      row.original.localNotes,
      row.original.sourceEvidence,
      row.original.id,
      row.original.matchedAt,
      row.original.updatedAt,
    ].map(csvCell).join(","),
  );

  return [header.join(","), ...lines].join("\n");
}

function toMarkdown(input: { generatedDate: string; inputPath: string; rows: AuditRow[] }): string {
  const keepOnMapRows = input.rows.filter((row) => row.recommendation.recommendedAction === "keep_on_map");
  const candidateRows = input.rows.filter((row) => row.recommendation.recommendedAction === "keep_candidate_only");
  const removeRows = input.rows.filter((row) => row.recommendation.recommendedAction === "remove");

  return [
    `# Google Curated Places Type-Aware Review - ${input.generatedDate}`,
    "",
    `Generated from ${input.inputPath}.`,
    "",
    "Google usage for this export: 0 Text Search requests, 0 Place Details requests.",
    "",
    "## What This Ledger Is",
    "",
    "This ledger applies the new type-aware tier rubric to the existing manual review CSV. It does not mutate Supabase or the source CSV.",
    "",
    "## Rubric Summary",
    "",
    "- Dhaba in the resolved Google name always stays Tier 4/candidate-only.",
    "- Road, bridge, route, toll, and area objects are recommended for removal.",
    "- Fuel rows become Tier 2 only when Google types identify a fuel stop and the resolved Google name shows a premium/highway format, such as Jio-bp, Swagat, COCO, Shell, Club HP, or Pure for Sure/Platinum.",
    "- Generic fuel stations stay Tier 4/candidate-only even when a premium seed found them.",
    "- Known organized restaurant, cafe, food-plaza, and tourism stops become Tier 3 when they are not dhabas.",
    "- Lodging/resort rows stay Tier 4/candidate-only unless separately verified.",
    "",
    "## Counts",
    "",
    `- total rows reviewed: ${input.rows.length}`,
    `- recommended keep_on_map: ${keepOnMapRows.length}`,
    `- recommended keep_candidate_only: ${candidateRows.length}`,
    `- recommended remove: ${removeRows.length}`,
    "",
    "## Counts By Recommended Tier",
    "",
    ...formatCounts(countBy(input.rows, (row) => row.recommendation.recommendedTier)),
    "",
    "## Counts By Recommended Action",
    "",
    ...formatCounts(countBy(input.rows, (row) => row.recommendation.recommendedAction)),
    "",
    "## Counts By Type Signal",
    "",
    ...formatCounts(countBy(input.rows, (row) => row.recommendation.typeSignal)),
    "",
    "## Counts By Brand Signal",
    "",
    ...formatCounts(countBy(input.rows, (row) => row.recommendation.brandSignal)),
    "",
    "## Keep-On-Map Seeds",
    "",
    ...formatCounts(countBy(keepOnMapRows, (row) => row.original.seedName)).slice(0, 40),
    "",
    "## Candidate-Only Seeds",
    "",
    ...formatCounts(countBy(candidateRows, (row) => row.original.seedName)).slice(0, 40),
    "",
    "## Review Guidance",
    "",
    "- Review keep_on_map rows first because these are proposed rescues into Tier 1/2/3.",
    "- Review keep_candidate_only rows next; these should not appear on the public map until verified.",
    "- Removal rows are mostly road/infrastructure or weak non-traveller matches.",
  ].join("\n");
}

function compareAuditRows(left: AuditRow, right: AuditRow): number {
  return (
    actionRank(left.recommendation.recommendedAction) - actionRank(right.recommendation.recommendedAction) ||
    tierRank(left.recommendation.recommendedTier) - tierRank(right.recommendation.recommendedTier) ||
    left.recommendation.typeSignal.localeCompare(right.recommendation.typeSignal) ||
    left.original.seedName.localeCompare(right.original.seedName) ||
    left.original.distanceFromHighwayMeters - right.original.distanceFromHighwayMeters ||
    left.original.resolvedGoogleName.localeCompare(right.original.resolvedGoogleName)
  );
}

function actionRank(action: AuditRow["recommendation"]["recommendedAction"]): number {
  switch (action) {
    case "keep_on_map":
      return 1;
    case "keep_candidate_only":
      return 2;
    case "needs_more_context":
      return 3;
    case "remove":
      return 4;
  }
}

function tierRank(tier: CleanlinessTier): number {
  switch (tier) {
    case "tier_1":
      return 1;
    case "tier_2":
      return 2;
    case "tier_3":
      return 3;
    case "tier_4":
      return 4;
  }
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

  return new Map([...counts.entries()].sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0])));
}

function formatCounts(counts: Map<string, number>): string[] {
  if (counts.size === 0) {
    return ["- None"];
  }

  return [...counts.entries()].map(([label, count]) => `- ${label}: ${count}`);
}
