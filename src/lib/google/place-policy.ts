export const permittedStoredGooglePlaceFields = ["place_id"] as const;

export type StoredGooglePlaceReference = {
  placeId: string;
  seedName?: string;
  highwayContext?: string;
  routeContext?: string;
  restroomConfidence?: number;
};

export function toStoredGooglePlaceReference(input: StoredGooglePlaceReference): StoredGooglePlaceReference {
  return {
    placeId: input.placeId,
    seedName: input.seedName,
    highwayContext: input.highwayContext,
    routeContext: input.routeContext,
    restroomConfidence: input.restroomConfidence,
  };
}
