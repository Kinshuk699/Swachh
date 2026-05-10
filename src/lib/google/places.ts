import type { GoogleTextSearchJob, GoogleTextSearchPlace } from "@/lib/discovery/highway-place-discovery";

const GOOGLE_PLACES_TEXT_SEARCH_URL = "https://places.googleapis.com/v1/places:searchText";
const GOOGLE_PLACES_DETAILS_URL = "https://places.googleapis.com/v1/places";
const googlePlaceDetailsFieldMask = "id,displayName,location,types,businessStatus,googleMapsUri,currentOpeningHours";

type Fetcher = typeof fetch;

export type GoogleTextSearchResponse = {
  places: GoogleTextSearchPlace[];
  nextPageToken?: string;
};

export type GooglePlaceDetails = {
  id: string;
  displayName: string;
  location?: { latitude: number; longitude: number };
  types: string[];
  businessStatus?: string;
  googleMapsUri?: string;
  openNow?: boolean;
  weekdayDescriptions: string[];
};

export async function searchTextPlaces(
  job: GoogleTextSearchJob,
  options: { apiKey: string; fetcher?: Fetcher },
): Promise<GoogleTextSearchResponse> {
  const fetcher = options.fetcher ?? fetch;
  const response = await fetcher(GOOGLE_PLACES_TEXT_SEARCH_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": options.apiKey,
      "X-Goog-FieldMask": job.fieldMask,
    },
    body: JSON.stringify({
      textQuery: job.textQuery,
      pageSize: job.pageSize,
      regionCode: job.regionCode,
      languageCode: "en-IN",
      ...(job.locationBias ? { locationBias: job.locationBias } : {}),
    }),
  });

  if (!response.ok) {
    const responseBody = await response.text();
    throw new Error(`Google Places Text Search failed for job ${job.id}: ${response.status} ${responseBody}`);
  }

  const body = (await response.json()) as GoogleTextSearchResponse;

  return {
    places: body.places ?? [],
    nextPageToken: body.nextPageToken,
  };
}

export async function getPlaceDetails(
  placeId: string,
  options: { apiKey: string; fetcher?: Fetcher },
): Promise<GooglePlaceDetails> {
  const fetcher = options.fetcher ?? fetch;
  const response = await fetcher(`${GOOGLE_PLACES_DETAILS_URL}/${encodeURIComponent(placeId)}`, {
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": options.apiKey,
      "X-Goog-FieldMask": googlePlaceDetailsFieldMask,
    },
  });

  if (!response.ok) {
    const responseBody = await response.text();
    throw new Error(`Google Place Details failed for ${placeId}: ${response.status} ${responseBody}`);
  }

  const body = (await response.json()) as {
    id?: string;
    displayName?: { text?: string };
    location?: { latitude: number; longitude: number };
    types?: string[];
    businessStatus?: string;
    googleMapsUri?: string;
    currentOpeningHours?: { openNow?: boolean; weekdayDescriptions?: string[] };
  };

  return {
    id: body.id ?? placeId,
    displayName: body.displayName?.text ?? placeId,
    location: body.location,
    types: body.types ?? [],
    businessStatus: body.businessStatus,
    googleMapsUri: body.googleMapsUri,
    openNow: body.currentOpeningHours?.openNow,
    weekdayDescriptions: body.currentOpeningHours?.weekdayDescriptions ?? [],
  };
}