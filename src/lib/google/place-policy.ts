export const permittedStoredGooglePlaceFields = ["place_id"] as const;

export type StoredGooglePlaceReference = {
  placeId: string;
  localNotes?: string;
  highwayContext?: string;
  restroomConfidence?: number;
};

export function toStoredGooglePlaceReference(input: StoredGooglePlaceReference): StoredGooglePlaceReference {
  return {
    placeId: input.placeId,
    localNotes: input.localNotes,
    highwayContext: input.highwayContext,
    restroomConfidence: input.restroomConfidence,
  };
}
