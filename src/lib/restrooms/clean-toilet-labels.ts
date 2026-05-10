import type { CleanlinessTier, SourceCategory } from "@/lib/discovery/highway-place-discovery";

export function cleanToiletDisplayLabel(input: {
  cleanlinessTier?: CleanlinessTier | null;
  sourceCategory?: SourceCategory | null;
}): string {
  if (input.sourceCategory === "premium_restroom") {
    return "Premium restroom";
  }

  if (input.sourceCategory === "official_wayside_amenity") {
    return "Official wayside amenity";
  }

  if (input.sourceCategory === "premium_fuel_program") {
    return "Likely clean fuel stop";
  }

  if (input.sourceCategory === "food_plaza" || input.sourceCategory === "organized_restaurant") {
    return "Likely clean restaurant stop";
  }

  if (input.cleanlinessTier === "tier_4") {
    return "Needs verification";
  }

  return "Highway restroom stop";
}