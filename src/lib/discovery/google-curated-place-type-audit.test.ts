import { describe, expect, it } from "vitest";

import { recommendManualReviewTier, type ManualReviewTierAuditInput } from "./google-curated-place-type-audit";

const baseRow: ManualReviewTierAuditInput = {
  reviewBucket: "already_rejected",
  displayReason: "already_rejected",
  verificationStatus: "rejected",
  seedName: "McDonald's",
  resolvedGoogleName: "McDonald's Family Restaurant",
  googleTypes: ["fast_food_restaurant", "restaurant", "food", "point_of_interest", "establishment"],
  proxyType: "qsr",
  cleanlinessTier: "tier_3",
  sourceCategory: "organized_restaurant",
  sourceEvidence: "International QSR baseline for reliable sanitation on highway food courts",
  distanceFromHighwayMeters: 125,
};

describe("manual review type-aware tier audit", () => {
  it("keeps dhaba-named restaurant rows out of public tiers", () => {
    const recommendation = recommendManualReviewTier({
      ...baseRow,
      seedName: "KFC",
      resolvedGoogleName: "Sher-e-Punjab DHABA",
      googleTypes: ["restaurant", "food", "point_of_interest", "establishment"],
    });

    expect(recommendation).toMatchObject({
      typeSignal: "dhaba_name",
      recommendedTier: "tier_4",
      recommendedAction: "keep_candidate_only",
      recommendedLabel: "Needs verification",
    });
    expect(recommendation.whyRecommended).toContain("Dhaba");
  });

  it("keeps exact Jio-bp gas stations in Tier 2", () => {
    const recommendation = recommendManualReviewTier({
      ...baseRow,
      seedName: "Jio-bp",
      resolvedGoogleName: "Jio bp pump",
      googleTypes: ["gas_station", "point_of_interest", "service", "establishment"],
      proxyType: "fuel_cafe",
      cleanlinessTier: "tier_2",
      sourceCategory: "premium_fuel_program",
      sourceEvidence: "Modern mobility station with sanitized washrooms",
    });

    expect(recommendation).toMatchObject({
      typeSignal: "fuel_stop_type",
      brandSignal: "premium_fuel_brand_match",
      recommendedTier: "tier_2",
      recommendedAction: "keep_on_map",
      recommendedVerificationStatus: "likely_clean",
      recommendedLabel: "Likely clean fuel stop",
    });
  });

  it("rescues exact Jio-bp gas stations found through Reliance seed searches", () => {
    const recommendation = recommendManualReviewTier({
      ...baseRow,
      seedName: "Reliance",
      resolvedGoogleName: "Jio-bp",
      googleTypes: ["gas_station", "supplier", "point_of_interest", "service", "establishment"],
      proxyType: "fuel_station",
      cleanlinessTier: "tier_2",
      sourceCategory: "premium_fuel_program",
    });

    expect(recommendation).toMatchObject({
      recommendedTier: "tier_2",
      recommendedAction: "keep_on_map",
      brandSignal: "premium_fuel_brand_match",
    });
  });

  it("downgrades generic fuel returned from premium fuel seeds to Tier 4", () => {
    const recommendation = recommendManualReviewTier({
      ...baseRow,
      seedName: "Indian Oil Swagat",
      resolvedGoogleName: "IndianOil",
      googleTypes: ["gas_station", "point_of_interest", "service", "establishment"],
      proxyType: "wayside_amenity",
      cleanlinessTier: "tier_2",
      sourceCategory: "premium_fuel_program",
      sourceEvidence: "Flagship wayside amenities at COCO pumps",
    });

    expect(recommendation).toMatchObject({
      typeSignal: "fuel_stop_type",
      brandSignal: "generic_fuel_from_premium_seed",
      recommendedTier: "tier_4",
      recommendedAction: "keep_candidate_only",
      recommendedLabel: "Needs verification",
    });
    expect(recommendation.whyRecommended).toContain("generic fuel");
  });

  it("keeps Indian Oil Swagat or COCO matches in Tier 2 only when the premium format is visible", () => {
    const recommendation = recommendManualReviewTier({
      ...baseRow,
      seedName: "Indian Oil Swagat",
      resolvedGoogleName: "Indian Oil Swagat COCO Wayside Amenity",
      googleTypes: ["gas_station", "convenience_store", "point_of_interest", "service", "establishment"],
      proxyType: "wayside_amenity",
      cleanlinessTier: "tier_2",
      sourceCategory: "premium_fuel_program",
      sourceEvidence: "Flagship wayside amenities at COCO pumps",
    });

    expect(recommendation).toMatchObject({
      typeSignal: "fuel_stop_type",
      brandSignal: "premium_fuel_brand_match",
      recommendedTier: "tier_2",
      recommendedAction: "keep_on_map",
    });
  });

  it("places known organized restaurants in Tier 3 when they are not dhabas", () => {
    const recommendation = recommendManualReviewTier(baseRow);

    expect(recommendation).toMatchObject({
      typeSignal: "food_stop_type",
      brandSignal: "organized_food_brand_match",
      recommendedTier: "tier_3",
      recommendedAction: "keep_on_map",
      recommendedVerificationStatus: "matched",
      recommendedLabel: "Likely clean restaurant stop",
    });
  });

  it("keeps route, bridge, and toll results out of public tiers", () => {
    const recommendation = recommendManualReviewTier({
      ...baseRow,
      seedName: "Lavato",
      resolvedGoogleName: "National Highway 160A",
      googleTypes: ["route"],
      proxyType: "premium_lavatory",
      cleanlinessTier: "tier_1",
      sourceCategory: "premium_restroom",
    });

    expect(recommendation).toMatchObject({
      typeSignal: "road_or_area_type",
      recommendedTier: "tier_4",
      recommendedAction: "remove",
      recommendedLabel: "Needs verification",
    });
  });
});
