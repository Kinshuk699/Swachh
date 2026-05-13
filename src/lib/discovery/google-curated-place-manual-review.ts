import type { GooglePlaceDetails } from "../google/places.ts";
import type { CleanlinessTier, SourceCategory } from "./highway-place-discovery.ts";
import type { GoogleCuratedPlaceDisplayReason } from "./google-curated-place-display.ts";

export type GoogleCuratedPlaceManualReviewBucket =
  | "road_object_quarantine"
  | "details_unavailable"
  | "missing_location"
  | "name_type_mismatch"
  | "already_rejected";

export type GoogleCuratedPlaceManualReviewRecord = {
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
  verification_status: "matched" | "likely_clean" | "rejected" | "approved" | "verified_clean";
  matched_at: string;
  updated_at: string;
};

export type GoogleCuratedPlaceManualReviewRow = {
  reviewBucket: GoogleCuratedPlaceManualReviewBucket;
  reviewPriority: number;
  displayReason: GoogleCuratedPlaceDisplayReason | "already_rejected";
  reviewDecision: string;
  verificationStatus: GoogleCuratedPlaceManualReviewRecord["verification_status"];
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

export function toManualReviewRow(input: {
  bucket: GoogleCuratedPlaceManualReviewBucket;
  displayReason: GoogleCuratedPlaceManualReviewRow["displayReason"];
  record: GoogleCuratedPlaceManualReviewRecord;
  details?: GooglePlaceDetails;
  message?: string;
}): GoogleCuratedPlaceManualReviewRow {
  return {
    reviewBucket: input.bucket,
    reviewPriority: reviewPriorityForBucket(input.bucket),
    displayReason: input.displayReason,
    reviewDecision: "",
    verificationStatus: input.record.verification_status,
    seedName: input.record.seed_name,
    resolvedGoogleName: input.details?.displayName ?? "Google Details unavailable",
    googleTypes: input.details?.types.length ? input.details.types : [input.displayReason],
    googleMapsUrl: input.details?.googleMapsUri ?? "",
    googlePlaceId: input.record.google_place_id,
    highwayName: input.record.highway_name,
    routeContext: input.record.route_context ?? "",
    region: input.record.region,
    proxyType: input.record.proxy_type,
    cleanlinessTier: input.record.cleanliness_tier,
    sourceCategory: input.record.source_category,
    restroomConfidence: input.record.restroom_confidence,
    distanceFromHighwayMeters: input.record.distance_from_highway_meters,
    localNotes: compactJoin([input.message, input.record.local_notes], " | ").replace(/\s+/g, " ").trim(),
    sourceEvidence: input.record.source_evidence,
    id: input.record.id,
    matchedAt: input.record.matched_at,
    updatedAt: input.record.updated_at,
  };
}

export function createGoogleCuratedPlacesManualReview(input: {
  generatedDate: string;
  supabaseUrl: string;
  googleUsage: { textSearchRequests: number; placeDetailsRequests: number; placeDetailsFailures: number };
  rows: GoogleCuratedPlaceManualReviewRow[];
}): { csv: string; markdown: string } {
  const sortedRows = [...input.rows].sort(compareManualReviewRows);

  return {
    csv: toCsv(sortedRows),
    markdown: toMarkdown({ ...input, rows: sortedRows }),
  };
}

function reviewPriorityForBucket(bucket: GoogleCuratedPlaceManualReviewBucket): number {
  switch (bucket) {
    case "road_object_quarantine":
      return 1;
    case "details_unavailable":
      return 2;
    case "missing_location":
      return 2;
    case "name_type_mismatch":
      return 3;
    case "already_rejected":
      return 4;
  }
}

function toCsv(rows: GoogleCuratedPlaceManualReviewRow[]): string {
  const header = [
    "review_bucket",
    "review_priority",
    "display_reason",
    "review_decision",
    "verification_status",
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
      row.reviewBucket,
      String(row.reviewPriority),
      row.displayReason,
      row.reviewDecision,
      row.verificationStatus,
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
  googleUsage: { textSearchRequests: number; placeDetailsRequests: number; placeDetailsFailures: number };
  rows: GoogleCuratedPlaceManualReviewRow[];
}): string {
  return [
    `# Google Curated Places Manual Review - ${input.generatedDate}`,
    "",
    `Generated from hosted Supabase project ${input.supabaseUrl} for manual review of rejected and user-display-excluded Google place matches.`,
    "",
    `Google usage for this export: ${input.googleUsage.textSearchRequests} Text Search requests, ${input.googleUsage.placeDetailsRequests} Place Details requests, ${input.googleUsage.placeDetailsFailures} Place Details failures.`,
    "",
    "## Review Precedence",
    "",
    "1. road_object_quarantine - likely remove from user map unless it is actually a named service area/restroom.",
    "2. details_unavailable or missing_location - refresh/check Place ID before deciding.",
    "3. name_type_mismatch - possible rescue candidates if Google name is a real stop despite seed mismatch.",
    "4. already_rejected - lowest-priority rescue list from original Text Search rejection logic.",
    "",
    "## Current Counts By Review Bucket",
    "",
    ...formatCounts(countBy(input.rows, (row) => row.reviewBucket)),
    "",
    "## Current Counts By Display Reason",
    "",
    ...formatCounts(countBy(input.rows, (row) => row.displayReason)),
    "",
    "## Current Counts By Seed",
    "",
    ...formatCounts(countBy(input.rows, (row) => row.seedName)),
    "",
    "## Review Guidance",
    "",
    "- Fill review_decision with keep_on_map, keep_candidate_only, remove, or needs_more_context.",
    "- Restoring a row should not require new Text Search because the CSV keeps the Google place_id.",
  ].join("\n");
}

function compareManualReviewRows(left: GoogleCuratedPlaceManualReviewRow, right: GoogleCuratedPlaceManualReviewRow): number {
  return (
    left.reviewPriority - right.reviewPriority ||
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

function compactJoin(parts: Array<string | null | undefined>, separator: string): string {
  return parts.filter((part): part is string => Boolean(part?.trim())).join(separator);
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
