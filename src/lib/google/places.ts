import type { GoogleTextSearchJob, GoogleTextSearchPlace } from "@/lib/discovery/highway-place-discovery";

const GOOGLE_PLACES_TEXT_SEARCH_URL = "https://places.googleapis.com/v1/places:searchText";

type Fetcher = typeof fetch;

export type GoogleTextSearchResponse = {
  places: GoogleTextSearchPlace[];
  nextPageToken?: string;
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