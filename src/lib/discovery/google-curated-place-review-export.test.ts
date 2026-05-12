import { describe, expect, it } from "vitest";

import {
  createRejectedGoogleCuratedPlacesReview,
  toRejectedGoogleCuratedPlaceReviewUnavailableRow,
  toRejectedGoogleCuratedPlaceReviewRow,
  type RejectedGoogleCuratedPlaceRecord,
} from "./google-curated-place-review-export";

const rejectedRecord: RejectedGoogleCuratedPlaceRecord = {
  id: "row-id",
  google_place_id: "bad-cube-place-id",
  seed_name: "Cube Stop",
  region: "North India",
  proxy_type: "wayside_amenity",
  cleanliness_tier: "tier_1",
  source_category: "official_wayside_amenity",
  source_evidence: "Cube Highways amenity with dedicated Wash Stop",
  highway_name: "NH-58",
  route_context: "Delhi-Haridwar",
  restroom_confidence: 0.9,
  distance_from_highway_meters: 318,
  local_notes: "Rejected false-positive Google match: seed did not match resolved place name",
  matched_at: "2026-05-11T00:00:00.000Z",
  updated_at: "2026-05-11T00:00:00.000Z",
};

describe("rejected Google curated place review export", () => {
  it("combines stored app annotations with live Google details for manual review", () => {
    const row = toRejectedGoogleCuratedPlaceReviewRow(rejectedRecord, {
      id: "bad-cube-place-id",
      displayName: "Icecube Digital",
      types: ["point_of_interest", "service", "establishment"],
      googleMapsUri: "https://maps.google.com/?cid=123",
      weekdayDescriptions: [],
    });

    expect(row).toMatchObject({
      reviewDecision: "",
      seedName: "Cube Stop",
      resolvedGoogleName: "Icecube Digital",
      googleTypes: ["point_of_interest", "service", "establishment"],
      googleMapsUrl: "https://maps.google.com/?cid=123",
      googlePlaceId: "bad-cube-place-id",
      cleanlinessTier: "tier_1",
      sourceCategory: "official_wayside_amenity",
      distanceFromHighwayMeters: 318,
    });
  });

  it("writes CSV and Markdown with tier and seed summaries", () => {
    const review = createRejectedGoogleCuratedPlacesReview({
      generatedDate: "2026-05-11",
      supabaseUrl: "https://example.supabase.co",
      googleUsage: { textSearchRequests: 0, placeDetailsRequests: 1 },
      rows: [
        toRejectedGoogleCuratedPlaceReviewRow(rejectedRecord, {
          id: "bad-cube-place-id",
          displayName: "Icecube Digital, Ahmedabad",
          types: ["service", "point_of_interest"],
          googleMapsUri: "https://maps.google.com/?cid=123",
          weekdayDescriptions: [],
        }),
      ],
    });

    expect(review.csv.split("\n")[0]).toContain("review_decision,seed_name,resolved_google_name,google_types");
    expect(review.csv).toContain('Cube Stop,"Icecube Digital, Ahmedabad",service|point_of_interest');
    expect(review.markdown).toContain("# Rejected Google Curated Places Review - 2026-05-11");
    expect(review.markdown).toContain("- tier_1: 1");
    expect(review.markdown).toContain("- Cube Stop: 1");
    expect(review.markdown).toContain("Google usage for this export: 0 Text Search requests, 1 Place Details requests.");
  });

  it("keeps rejected rows in the review sheet when Google Details is unavailable", () => {
    const row = toRejectedGoogleCuratedPlaceReviewUnavailableRow(rejectedRecord, "404 Place ID is no longer valid");

    expect(row).toMatchObject({
      seedName: "Cube Stop",
      resolvedGoogleName: "Google Details unavailable",
      googleTypes: ["details_unavailable"],
      googleMapsUrl: "",
      googlePlaceId: "bad-cube-place-id",
    });
    expect(row.localNotes).toContain("Google Place Details unavailable: 404 Place ID is no longer valid");
  });
});