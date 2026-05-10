import type { GooglePlaceDetails } from "../google/places";
import type { CleanlinessTier, SourceCategory } from "./highway-place-discovery";

export type RejectedGoogleCuratedPlaceRecord = {
  id: string;
  google_place_id: string;
  seed_name: string;
  region: string;
  proxy_type: string;
  cleanliness_tier: CleanlinessTier;
  source_category: SourceCategory;
  source_evidence: string;
  highway_name: string;
  route_context: string | null;
  restroom_confidence: number;
  distance_from_highway_meters: number;
  local_notes: string | null;
  matched_at: string;
  updated_at: string;
};

export type RejectedGoogleCuratedPlaceReviewRow = {
  reviewDecision: string;
  seedName: string;
  resolvedGoogleName: string;
  googleTypes: string[];
  googleMapsUrl: string;
  googlePlaceId: string;
  highwayName: string;
  routeContext: string;
  region: string;
  proxyType: string;
  cleanlinessTier: CleanlinessTier;
  sourceCategory: SourceCategory;
  restroomConfidence: number;
  distanceFromHighwayMeters: number;
  localNotes: string;
  sourceEvidence: string;
  id: string;
  matchedAt: string;
  updatedAt: string;
};

export function toRejectedGoogleCuratedPlaceReviewRow(
  record: RejectedGoogleCuratedPlaceRecord,
  details: GooglePlaceDetails,
): RejectedGoogleCuratedPlaceReviewRow {
  return {
    reviewDecision: "",
    seedName: record.seed_name,
    resolvedGoogleName: details.displayName,
    googleTypes: details.types,
    googleMapsUrl: details.googleMapsUri ?? "",
    googlePlaceId: record.google_place_id,
    highwayName: record.highway_name,
    routeContext: record.route_context ?? "",
    region: record.region,
    proxyType: record.proxy_type,
    cleanlinessTier: record.cleanliness_tier,
    sourceCategory: record.source_category,
    restroomConfidence: record.restroom_confidence,
    distanceFromHighwayMeters: record.distance_from_highway_meters,
    localNotes: record.local_notes ?? "",
    sourceEvidence: record.source_evidence,
    id: record.id,
    matchedAt: record.matched_at,
    updatedAt: record.updated_at,
  };
}

export function createRejectedGoogleCuratedPlacesReview(input: {
  generatedDate: string;
  supabaseUrl: string;
  googleUsage: { textSearchRequests: number; placeDetailsRequests: number };
  rows: RejectedGoogleCuratedPlaceReviewRow[];
}): { csv: string; markdown: string } {
  const sortedRows = [...input.rows].sort(compareReviewRows);

  return {
    csv: toCsv(sortedRows),
    markdown: toMarkdown({ ...input, rows: sortedRows }),
  };
}

function toCsv(rows: RejectedGoogleCuratedPlaceReviewRow[]): string {
  const header = [
    "review_decision",
    "seed_name",
    "resolved_google_name",
    "google_types",
    "google_maps_url",
    "google_place_id",
    "highway_name",
    "route_context",
    "region",
    "proxy_type",
    "cleanliness_tier",
    "source_category",
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
      row.reviewDecision,
      row.seedName,
      row.resolvedGoogleName,
      row.googleTypes.join("|"),
      row.googleMapsUrl,
      row.googlePlaceId,
      row.highwayName,
      row.routeContext,
      row.region,
      row.proxyType,
      row.cleanlinessTier,
      row.sourceCategory,
      String(row.restroomConfidence),
      String(row.distanceFromHighwayMeters),
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
  googleUsage: { textSearchRequests: number; placeDetailsRequests: number };
  rows: RejectedGoogleCuratedPlaceReviewRow[];
}): string {
  return [
    `# Rejected Google Curated Places Review - ${input.generatedDate}`,
    "",
    `Generated from hosted Supabase project ${input.supabaseUrl} for manual review of rejected Google place matches.`,
    "",
    `Google usage for this export: ${input.googleUsage.textSearchRequests} Text Search requests, ${input.googleUsage.placeDetailsRequests} Place Details requests.`,
    "",
    "## Current Counts",
    "",
    `- Remaining rejected rows for manual review: ${input.rows.length}`,
    "",
    "## Remaining Rejected Rows By Tier",
    "",
    ...formatCounts(countBy(input.rows, (row) => row.cleanlinessTier)),
    "",
    "## Remaining Rejected Rows By Seed",
    "",
    ...formatCounts(countBy(input.rows, (row) => row.seedName)),
    "",
    "## Remaining Rejected Rows By Source Category",
    "",
    ...formatCounts(countBy(input.rows, (row) => row.sourceCategory)),
    "",
    "## Review Guidance",
    "",
    "- Fill review_decision in the CSV with approve, reject, or needs_more_context.",
    "- Approved rows can be manually promoted later without re-running Text Search because the CSV keeps the Google place_id.",
  ].join("\n");
}

function compareReviewRows(left: RejectedGoogleCuratedPlaceReviewRow, right: RejectedGoogleCuratedPlaceReviewRow): number {
  return (
    left.cleanlinessTier.localeCompare(right.cleanlinessTier) ||
    left.seedName.localeCompare(right.seedName) ||
    left.distanceFromHighwayMeters - right.distanceFromHighwayMeters ||
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