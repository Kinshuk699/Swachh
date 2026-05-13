import type { GoogleTextSearchJob, GoogleTextSearchPlace } from "@/lib/discovery/highway-place-discovery";

const GOOGLE_PLACES_TEXT_SEARCH_URL = "https://places.googleapis.com/v1/places:searchText";
const GOOGLE_PLACES_DETAILS_URL = "https://places.googleapis.com/v1/places";
const googlePlaceDetailsFieldMask = "id,displayName,location,types,businessStatus,googleMapsUri,currentOpeningHours";
const defaultGooglePlacesTimeoutMs = 20_000;

type Fetcher = typeof fetch;
type GooglePlacesRequestOptions = { apiKey: string; fetcher?: Fetcher; timeoutMs?: number };

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
  options: GooglePlacesRequestOptions,
): Promise<GoogleTextSearchResponse> {
  const fetcher = options.fetcher ?? fetch;
  const timeoutMs = options.timeoutMs ?? defaultGooglePlacesTimeoutMs;
  const response = await fetchWithTimeout({
    fetcher,
    url: GOOGLE_PLACES_TEXT_SEARCH_URL,
    init: {
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
    },
    timeoutMs,
    timeoutMessage: `Google Places Text Search timed out for job ${job.id} after ${timeoutMs}ms`,
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
  options: GooglePlacesRequestOptions,
): Promise<GooglePlaceDetails> {
  const fetcher = options.fetcher ?? fetch;
  const timeoutMs = options.timeoutMs ?? defaultGooglePlacesTimeoutMs;
  const response = await fetchWithTimeout({
    fetcher,
    url: `${GOOGLE_PLACES_DETAILS_URL}/${encodeURIComponent(placeId)}`,
    init: {
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": options.apiKey,
        "X-Goog-FieldMask": googlePlaceDetailsFieldMask,
      },
    },
    timeoutMs,
    timeoutMessage: `Google Place Details timed out for ${placeId} after ${timeoutMs}ms`,
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

async function fetchWithTimeout(input: {
  fetcher: Fetcher;
  url: string;
  init: RequestInit;
  timeoutMs: number;
  timeoutMessage: string;
}): Promise<Response> {
  const controller = new AbortController();
  let timedOut = false;
  const timeout = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, input.timeoutMs);

  try {
    return await input.fetcher(input.url, { ...input.init, signal: controller.signal });
  } catch (error) {
    if (timedOut || isAbortError(error)) {
      throw new Error(input.timeoutMessage);
    }

    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}