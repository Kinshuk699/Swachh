import type { CleanlinessTier, SourceCategory } from "./highway-place-discovery";
import type { GoogleCuratedPlaceManualReviewRow } from "./google-curated-place-manual-review";

export type TypeSignal = "dhaba_name" | "road_or_area_type" | "fuel_stop_type" | "food_stop_type" | "lodging_type" | "restroom_type" | "weak_or_other_type";
export type BrandSignal =
  | "premium_restroom_brand_match"
  | "official_wayside_brand_match"
  | "premium_fuel_brand_match"
  | "generic_fuel_from_premium_seed"
  | "organized_food_brand_match"
  | "generic_or_unclear_brand";
export type RecommendedAction = "keep_on_map" | "keep_candidate_only" | "remove" | "needs_more_context";
export type RecommendedVerificationStatus = "matched" | "likely_clean" | "rejected" | "approved" | "verified_clean";

export type ManualReviewTierAuditInput = Pick<
  GoogleCuratedPlaceManualReviewRow,
  | "reviewBucket"
  | "displayReason"
  | "verificationStatus"
  | "seedName"
  | "resolvedGoogleName"
  | "googleTypes"
  | "proxyType"
  | "cleanlinessTier"
  | "sourceCategory"
  | "sourceEvidence"
  | "distanceFromHighwayMeters"
>;

export type ManualReviewTierRecommendation = {
  typeSignal: TypeSignal;
  brandSignal: BrandSignal;
  recommendedTier: CleanlinessTier;
  recommendedSourceCategory: SourceCategory;
  recommendedAction: RecommendedAction;
  recommendedVerificationStatus: RecommendedVerificationStatus;
  recommendedLabel: string;
  whyRecommended: string;
};

const roadOrAreaTypes = new Set([
  "bridge",
  "intersection",
  "locality",
  "political",
  "route",
  "street_address",
  "sublocality",
  "sublocality_level_1",
  "sublocality_level_2",
  "sublocality_level_3",
  "toll_station",
]);

const fuelTypes = new Set(["gas_station"]);
const restroomTypes = new Set(["public_bath", "public_bathroom", "rest_stop"]);
const lodgingTypes = new Set(["bed_and_breakfast", "extended_stay_hotel", "guest_house", "hostel", "hotel", "inn", "lodging", "motel", "private_guest_room", "resort_hotel"]);
const foodTypes = new Set([
  "bakery",
  "breakfast_restaurant",
  "cafe",
  "chinese_restaurant",
  "coffee_shop",
  "family_restaurant",
  "fast_food_restaurant",
  "food_court",
  "indian_restaurant",
  "meal_takeaway",
  "north_indian_restaurant",
  "pizza_restaurant",
  "restaurant",
  "south_indian_restaurant",
  "vegetarian_restaurant",
]);

const organizedFoodBrandNeedles = [
  "7midwayplaza",
  "a2b",
  "adyaranandabhavan",
  "bigbayindia",
  "bikanervala",
  "burgerking",
  "cheetalgrand",
  "costacoffee",
  "gallopsfoodplaza",
  "gujarattourismtoran",
  "haldiram",
  "haryanatourism",
  "highwayking",
  "honestrestaurant",
  "hotelkamatlokaruchi",
  "kfc",
  "kstdc",
  "ktdc",
  "mcdonald",
  "mptourismhighwaytreat",
  "mtdc",
  "pizzahut",
  "rajugarithota",
  "rtdcmidway",
  "snhighwayfoodmall",
  "shreedattasnacks",
  "telanganaharitha",
  "ttdchoteltamilnadu",
  "villagefoodcourts",
  "vithalkamats",
];

export function recommendManualReviewTier(input: ManualReviewTierAuditInput): ManualReviewTierRecommendation {
  const typeSignal = typeSignalForInput(input);

  if (typeSignal === "road_or_area_type") {
    return recommendation({
      typeSignal,
      brandSignal: "generic_or_unclear_brand",
      recommendedTier: "tier_4",
      recommendedSourceCategory: "generic_candidate",
      recommendedAction: "remove",
      recommendedVerificationStatus: "rejected",
      recommendedLabel: "Needs verification",
      whyRecommended: "Google types identify this as a road, bridge, toll, route, or area object rather than a traveller stop.",
    });
  }

  if (typeSignal === "dhaba_name") {
    return recommendation({
      typeSignal,
      brandSignal: "generic_or_unclear_brand",
      recommendedTier: "tier_4",
      recommendedSourceCategory: "dhaba_candidate",
      recommendedAction: "keep_candidate_only",
      recommendedVerificationStatus: "matched",
      recommendedLabel: "Needs verification",
      whyRecommended: "Dhaba appears in the resolved Google name, so this must not be promoted into Tier 1, 2, or 3 without human verification.",
    });
  }

  if (typeSignal === "restroom_type" && isPremiumRestroomBrandMatch(input)) {
    return recommendation({
      typeSignal,
      brandSignal: "premium_restroom_brand_match",
      recommendedTier: "tier_1",
      recommendedSourceCategory: "premium_restroom",
      recommendedAction: "keep_on_map",
      recommendedVerificationStatus: "likely_clean",
      recommendedLabel: "Premium restroom",
      whyRecommended: "The row has a restroom-first Google type and matches a premium restroom seed/name.",
    });
  }

  if (typeSignal === "food_stop_type" && isOfficialWaysideBrandMatch(input)) {
    return recommendation({
      typeSignal,
      brandSignal: "official_wayside_brand_match",
      recommendedTier: "tier_1",
      recommendedSourceCategory: "official_wayside_amenity",
      recommendedAction: "keep_on_map",
      recommendedVerificationStatus: "likely_clean",
      recommendedLabel: "Official wayside amenity",
      whyRecommended: "The row matches an official or purpose-built wayside amenity brand and has traveller food/amenity Google types.",
    });
  }

  if (typeSignal === "fuel_stop_type") {
    if (isPremiumFuelBrandMatch(input)) {
      return recommendation({
        typeSignal,
        brandSignal: "premium_fuel_brand_match",
        recommendedTier: "tier_2",
        recommendedSourceCategory: "premium_fuel_program",
        recommendedAction: "keep_on_map",
        recommendedVerificationStatus: "likely_clean",
        recommendedLabel: "Likely clean fuel stop",
        whyRecommended: "Google types identify a fuel station and the resolved Google name matches a premium/highway fuel format.",
      });
    }

    return recommendation({
      typeSignal,
      brandSignal: "generic_fuel_from_premium_seed",
      recommendedTier: "tier_4",
      recommendedSourceCategory: "generic_candidate",
      recommendedAction: "keep_candidate_only",
      recommendedVerificationStatus: "matched",
      recommendedLabel: "Needs verification",
      whyRecommended: "Google types identify a fuel station, but the resolved name looks like generic fuel rather than the premium/highway format promised by the seed.",
    });
  }

  if (typeSignal === "food_stop_type" && isOrganizedFoodBrandMatch(input)) {
    return recommendation({
      typeSignal,
      brandSignal: "organized_food_brand_match",
      recommendedTier: "tier_3",
      recommendedSourceCategory: "organized_restaurant",
      recommendedAction: "keep_on_map",
      recommendedVerificationStatus: "matched",
      recommendedLabel: "Likely clean restaurant stop",
      whyRecommended: "Google types identify a restaurant/cafe/food stop and the seed/name matches an organized restaurant or food-plaza proxy.",
    });
  }

  if (typeSignal === "food_stop_type") {
    return recommendation({
      typeSignal,
      brandSignal: "generic_or_unclear_brand",
      recommendedTier: "tier_4",
      recommendedSourceCategory: "generic_candidate",
      recommendedAction: "keep_candidate_only",
      recommendedVerificationStatus: "matched",
      recommendedLabel: "Needs verification",
      whyRecommended: "Google types identify food/restaurant, but the operator quality is unclear, so this remains candidate-only.",
    });
  }

  if (typeSignal === "lodging_type") {
    return recommendation({
      typeSignal,
      brandSignal: "generic_or_unclear_brand",
      recommendedTier: "tier_4",
      recommendedSourceCategory: "generic_candidate",
      recommendedAction: "keep_candidate_only",
      recommendedVerificationStatus: "matched",
      recommendedLabel: "Needs verification",
      whyRecommended: "Lodging/resort types may have restrooms, but traveller access is uncertain for a highway restroom planner.",
    });
  }

  return recommendation({
    typeSignal,
    brandSignal: "generic_or_unclear_brand",
    recommendedTier: "tier_4",
    recommendedSourceCategory: "generic_candidate",
    recommendedAction: "remove",
    recommendedVerificationStatus: "rejected",
    recommendedLabel: "Needs verification",
    whyRecommended: "Google types do not provide enough fuel, food, restroom, or official wayside evidence for public map inclusion.",
  });
}

function typeSignalForInput(input: ManualReviewTierAuditInput): TypeSignal {
  if (hasRoadOrAreaType(input.googleTypes)) {
    return "road_or_area_type";
  }

  if (containsDhaba(input.resolvedGoogleName)) {
    return "dhaba_name";
  }

  if (hasAnyType(input.googleTypes, restroomTypes)) {
    return "restroom_type";
  }

  if (hasAnyType(input.googleTypes, fuelTypes)) {
    return "fuel_stop_type";
  }

  if (hasAnyType(input.googleTypes, foodTypes)) {
    return "food_stop_type";
  }

  if (hasAnyType(input.googleTypes, lodgingTypes)) {
    return "lodging_type";
  }

  return "weak_or_other_type";
}

function hasRoadOrAreaType(types: string[]): boolean {
  return hasAnyType(types, roadOrAreaTypes);
}

function hasAnyType(types: string[], typeSet: Set<string>): boolean {
  return types.some((type) => typeSet.has(type));
}

function containsDhaba(input: string): boolean {
  return /\bdhab+a\b/i.test(input);
}

function isPremiumRestroomBrandMatch(input: ManualReviewTierAuditInput): boolean {
  const combined = normalizedCombinedName(input);
  return combined.includes("lavato") || combined.includes("premiumlounge") || combined.includes("premiumrestroom");
}

function isOfficialWaysideBrandMatch(input: ManualReviewTierAuditInput): boolean {
  const combined = normalizedCombinedName(input);
  return [
    "cubestop",
    "highwaynest",
    "highwayvillage",
    "nhaiwayside",
    "nhlmlwayside",
    "pathrecharge",
    "expresswayrestarea",
    "expresswayservicearea",
    "officialexpresswayservice",
  ].some((needle) => combined.includes(needle));
}

function isPremiumFuelBrandMatch(input: ManualReviewTierAuditInput): boolean {
  const seedName = normalize(input.seedName);
  const googleName = normalize(input.resolvedGoogleName);

  if (googleName.includes("jiobp")) {
    return true;
  }

  if (seedName.includes("jiobp")) {
    return googleName.includes("jiobp");
  }

  if (seedName.includes("shellselect") || seedName.includes("shellcafe")) {
    return googleName.includes("shell");
  }

  if (seedName.includes("wildbeancafe")) {
    return googleName.includes("wildbean");
  }

  if (seedName.includes("indianoilswagat") || seedName.includes("indianoilcoco")) {
    return googleName.includes("swagat") || googleName.includes("coco");
  }

  if (seedName.includes("bpclghar")) {
    return googleName.includes("bpclghar") || googleName.includes("onestop") || googleName.includes("trucker") || googleName.includes("truckers");
  }

  if (seedName.includes("bpclpureforsure") || seedName.includes("pureforsureplatinum")) {
    return googleName.includes("pureforsure") || googleName.includes("platinum");
  }

  if (seedName.includes("hpclfocus")) {
    return googleName.includes("focus");
  }

  if (seedName.includes("clubhp")) {
    return googleName.includes("clubhp");
  }

  return false;
}

function isOrganizedFoodBrandMatch(input: ManualReviewTierAuditInput): boolean {
  const combined = normalizedCombinedName(input);
  return organizedFoodBrandNeedles.some((needle) => combined.includes(needle));
}

function normalizedCombinedName(input: ManualReviewTierAuditInput): string {
  return normalize(`${input.seedName} ${input.resolvedGoogleName}`);
}

function normalize(input: string): string {
  return input.toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, "");
}

function recommendation(input: ManualReviewTierRecommendation): ManualReviewTierRecommendation {
  return input;
}
