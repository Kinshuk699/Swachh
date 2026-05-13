import { describe, expect, it } from "vitest";

import {
  createGoogleCuratedPlacesManualReview,
  toManualReviewRow,
  type GoogleCuratedPlaceManualReviewRecord,
} from "./google-curated-place-manual-review";

const baseRecord: GoogleCuratedPlaceManualReviewRecord = {
  id: "row-id",
  google_place_id: "place-id",
  seed_name: "PATH Recharge",
  region: "India",
  proxy_type: "wayside_amenity",
  cleanliness_tier: "tier_1",
  source_category: "official_wayside_amenity",
  source_evidence: "Mall-like wayside amenities with EV charging",
  highway_name: "NH-320G",
  route_context: "Hat Gamaria - Jagannathpur Road.",
  restroom_confidence: 0.88,
  distance_from_highway_meters: 72,
  local_notes: "Mall-like wayside amenities with EV charging",
  verification_status: "likely_clean",
  matched_at: "2026-05-13T00:00:00.000Z",
  updated_at: "2026-05-13T00:00:00.000Z",
};

describe("Google curated places manual review export", () => {
  it("puts road quarantines ahead of rejected rows in the CSV review order", () => {
    const quarantineRow = toManualReviewRow({
      bucket: "road_object_quarantine",
      displayReason: "road_object_quarantine",
      record: baseRecord,
      details: {
        id: "place-id",
        displayName: "National Highway 320G",
        location: { latitude: 22.1, longitude: 85.8 },
        types: ["route"],
        googleMapsUri: "https://maps.google.com/?cid=road",
        weekdayDescriptions: [],
      },
    });
    const rejectedRow = toManualReviewRow({
      bucket: "already_rejected",
      displayReason: "already_rejected",
      record: { ...baseRecord, id: "rejected-row-id", google_place_id: "rejected-place-id", verification_status: "rejected" },
      details: {
        id: "rejected-place-id",
        displayName: "Wrong Restaurant",
        location: { latitude: 23, longitude: 72 },
        types: ["restaurant"],
        weekdayDescriptions: [],
      },
    });

    const review = createGoogleCuratedPlacesManualReview({
      generatedDate: "2026-05-13",
      supabaseUrl: "https://example.supabase.co",
      googleUsage: { textSearchRequests: 0, placeDetailsRequests: 2, placeDetailsFailures: 0 },
      rows: [rejectedRow, quarantineRow],
    });

    expect(review.csv.split("\n")[0]).toContain("review_bucket,review_priority,display_reason");
    expect(review.csv.split("\n")[1]).toContain("road_object_quarantine,1,road_object_quarantine");
    expect(review.csv.split("\n")[2]).toContain("already_rejected,4,already_rejected");
    expect(review.markdown).toContain("1. road_object_quarantine");
    expect(review.markdown).toContain("4. already_rejected");
  });
});