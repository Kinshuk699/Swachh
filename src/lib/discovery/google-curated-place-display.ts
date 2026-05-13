import type { GooglePlaceDetails } from "../google/places.ts";
import { isRelevantGooglePlaceCandidate, type ProxyType, type SourceCategory } from "./highway-place-discovery.ts";

export type GoogleCuratedPlaceDisplayReason =
  | "displayable"
  | "road_object_quarantine"
  | "name_type_mismatch"
  | "missing_location"
  | "details_unavailable";

export type GoogleCuratedPlaceDisplayDecision =
  | { displayable: true; reason: "displayable" }
  | { displayable: false; reason: Exclude<GoogleCuratedPlaceDisplayReason, "displayable"> };

export type GoogleCuratedPlaceDisplayRow = {
  seed_name: string;
  proxy_type: ProxyType;
  source_category?: SourceCategory;
};

const roadObjectGoogleTypes = new Set([
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

const travellerStopGoogleTypes = new Set([
  "cafe",
  "convenience_store",
  "food_court",
  "gas_station",
  "lodging",
  "public_bathroom",
  "restaurant",
  "rest_stop",
]);

const roadObjectNamePatterns = [
  /^national highway\s+\d+[a-z]?\b/i,
  /^nh\s*-?\s*\d+[a-z]?\b/i,
  /\b(?:bridge|flyover)\b/i,
  /\b(?:road|rd)\s*&\s*(?:national highway|nh)\b/i,
  /\b(?:national highway|nh)\s*\d+[a-z]?\s*&\b/i,
];

export function classifyGoogleCuratedPlaceDisplay(
  row: GoogleCuratedPlaceDisplayRow,
  details: GooglePlaceDetails,
): GoogleCuratedPlaceDisplayDecision {
  if (!details.location) {
    return { displayable: false, reason: "missing_location" };
  }

  if (isRoadObjectGooglePlace(details)) {
    return { displayable: false, reason: "road_object_quarantine" };
  }

  if (
    !isRelevantGooglePlaceCandidate({
      seedName: row.seed_name,
      proxyType: row.proxy_type,
      placeName: details.displayName,
      types: details.types,
    })
  ) {
    return { displayable: false, reason: "name_type_mismatch" };
  }

  return { displayable: true, reason: "displayable" };
}

export function isRoadObjectGooglePlace(details: Pick<GooglePlaceDetails, "displayName" | "types">): boolean {
  if (details.types.some((type) => travellerStopGoogleTypes.has(type))) {
    return false;
  }

  return details.types.some((type) => roadObjectGoogleTypes.has(type)) || roadObjectNamePatterns.some((pattern) => pattern.test(details.displayName));
}
