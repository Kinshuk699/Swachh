import { buildGoogleSearchText } from "@/lib/seeds/seed-records";

export type PlaceSearchSeed = {
  name: string;
  highwayContext?: string;
  routeContext?: string;
  localityHint?: string;
};

export type GooglePlaceTextSearchRequest = {
  textQuery: string;
  regionCode: "IN";
  includedType: "establishment";
};

export type GooglePlaceTextSearchResult = {
  id: string;
  displayName?: { text: string };
  formattedAddress?: string;
  rating?: number;
};

export type StoredPlaceMatchInput = {
  seedName: string;
  highwayContext: string;
  routeContext: string;
  restroomConfidence: number;
};

export type StoredPlaceMatch = StoredPlaceMatchInput & {
  placeId: string;
};

export function buildTextSearchRequest(seed: PlaceSearchSeed): GooglePlaceTextSearchRequest {
  return {
    textQuery: buildGoogleSearchText({
      name: seed.name,
      highwayContext: seed.highwayContext ?? "",
      routeContext: seed.routeContext ?? "",
      localityHint: seed.localityHint ?? "",
    }),
    regionCode: "IN",
    includedType: "establishment",
  };
}

export function toStoredPlaceMatch(result: GooglePlaceTextSearchResult, annotations: StoredPlaceMatchInput): StoredPlaceMatch {
  if (!result || typeof result.id !== "string" || result.id.trim() === "") {
    throw new Error("Google place result is missing id");
  }

  return {
    placeId: result.id,
    seedName: annotations.seedName,
    highwayContext: annotations.highwayContext,
    routeContext: annotations.routeContext,
    restroomConfidence: annotations.restroomConfidence,
  };
}
