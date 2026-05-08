export const permittedStoredGooglePlaceFields = ["place_id"] as const;

export type StoredGooglePlaceReference = {
  placeId: string;
  seedName?: string;
  highwayContext?: string;
  routeContext?: string;
  restroomConfidence?: number;
};

export type GooglePlaceStorageRow = {
  place_id: string;
  seed_name?: string;
  highway_context?: string;
  route_context?: string;
  restroom_confidence?: number;
};

export function toStoredGooglePlaceReference(input: StoredGooglePlaceReference): StoredGooglePlaceReference {
  if (!input || typeof input.placeId !== "string" || input.placeId.trim() === "") {
    throw new Error("stored place reference missing placeId");
  }

  return {
    placeId: input.placeId,
    seedName: input.seedName,
    highwayContext: input.highwayContext,
    routeContext: input.routeContext,
    restroomConfidence: input.restroomConfidence,
  };
}

export function toGooglePlaceStorageRow(input: StoredGooglePlaceReference): GooglePlaceStorageRow {
  const stored = toStoredGooglePlaceReference(input);

  const row: GooglePlaceStorageRow = {
    place_id: stored.placeId,
  };

  if (stored.seedName !== undefined) row.seed_name = stored.seedName;
  if (stored.highwayContext !== undefined) row.highway_context = stored.highwayContext;
  if (stored.routeContext !== undefined) row.route_context = stored.routeContext;
  if (stored.restroomConfidence !== undefined) row.restroom_confidence = stored.restroomConfidence;

  return row;
}
