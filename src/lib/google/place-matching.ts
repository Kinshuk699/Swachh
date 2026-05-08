export type PlaceSearchSeed = {
  name: string;
  highwayContext?: string;
  routeContext?: string;
  localityHint?: string;
};

export type GooglePlaceTextSearchRequest = {
  textQuery: string;
  regionCode: string;
  includedType: string;
};

export type GooglePlaceTextSearchResult = {
  id: string;
  displayName?: { text: string };
  formattedAddress?: string;
  rating?: number;
};

export type StoredPlaceMatchInput = {
  seedName?: string;
  highwayContext?: string;
  routeContext?: string;
  restroomConfidence?: number;
};

export type StoredPlaceMatch = StoredPlaceMatchInput & {
  placeId: string;
};

function buildGoogleSearchText(seed: PlaceSearchSeed): string {
  const parts: string[] = [];
  if (seed.name) parts.push(seed.name.trim());
  if (seed.highwayContext) parts.push(seed.highwayContext.trim());
  if (seed.routeContext) parts.push(seed.routeContext.trim());
  if (seed.localityHint) parts.push(seed.localityHint.trim());
  // Append country bias for better regional results
  parts.push("India");
  return parts.join(" ");
}

export function buildTextSearchRequest(seed: PlaceSearchSeed): GooglePlaceTextSearchRequest {
  return {
    textQuery: buildGoogleSearchText(seed),
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
