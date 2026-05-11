import { NextResponse } from "next/server";

import {
  buildHighwayPlacesSearchJobs,
  defaultMaxHighwayDiversionMeters,
  dedupeDiscoveredHighwayPlaces,
  filterHighwayPlaceMatches,
  type DiscoveredHighwayPlace,
  type GoogleTextSearchJob,
  type GoogleTextSearchPlace,
  type HighwaySearchCorridor,
  type ProxyType,
} from "@/lib/discovery/highway-place-discovery";
import { curatedStopCandidates, highwaySearchCorridors, proxyBrands } from "@/lib/discovery/seed-catalog";
import { searchTextPlaces } from "@/lib/google/places";
import type { HighwayStop } from "@/lib/restrooms/sample-stops";

const DEFAULT_PREVIEW_LIMIT = 40;
const DEFAULT_MAX_PREVIEW_LIMIT = 120;

export async function GET(request: Request) {
  if (process.env.GOOGLE_DISCOVERY_PREVIEW_ENABLED !== "true") {
    return NextResponse.json(
      {
        error: "Live Google Places Text Search preview is disabled.",
        places: [],
        totalJobs: 0,
        searchedJobs: 0,
        textSearchRequests: 0,
        capped: true,
      },
      { status: 403 },
    );
  }

  const apiKey = process.env.GOOGLE_MAPS_SERVER_API_KEY;
  const jobs = buildHighwayPlacesSearchJobs({ proxyBrands, curatedStopCandidates, corridors: highwaySearchCorridors });
  const limit = getRequestedLimit(request, jobs.length);

  if (!apiKey) {
    return NextResponse.json(
      { error: "Google Maps server key is not configured", places: [], totalJobs: jobs.length, searchedJobs: 0, capped: true },
      { status: 503 },
    );
  }

  const placeById = new Map<string, GoogleTextSearchPlace>();
  const discoveredPlaces: DiscoveredHighwayPlace[] = [];
  let searchedJobs = 0;

  for (const job of jobs.slice(0, limit)) {
    const corridor = findCorridorForJob(job);

    if (!corridor) {
      continue;
    }

    searchedJobs += 1;

    try {
      const response = await searchTextPlaces(job, { apiKey });
      const matches = filterHighwayPlaceMatches({
        job,
        corridor,
        places: response.places,
        maxDiversionMeters: defaultMaxHighwayDiversionMeters,
      });

      for (const place of response.places) {
        if (place.id) {
          placeById.set(place.id, place);
        }
      }

      discoveredPlaces.push(...matches);
    } catch {
      continue;
    }
  }

  const places = dedupeDiscoveredHighwayPlaces(discoveredPlaces)
    .map((place) => toHighwayStop(place, placeById.get(place.placeId)))
    .filter((place): place is HighwayStop => Boolean(place));

  return NextResponse.json({ places, totalJobs: jobs.length, searchedJobs, textSearchRequests: searchedJobs, capped: limit < jobs.length });
}

function getRequestedLimit(request: Request, totalJobs: number): number {
  const rawLimit = Number(new URL(request.url).searchParams.get("limit") ?? DEFAULT_PREVIEW_LIMIT);
  const envMax = Number(process.env.GOOGLE_DISCOVERY_PREVIEW_MAX ?? DEFAULT_MAX_PREVIEW_LIMIT);
  const maxLimit = Number.isFinite(envMax) && envMax > 0 ? envMax : DEFAULT_MAX_PREVIEW_LIMIT;
  const requestedLimit = Number.isFinite(rawLimit) && rawLimit > 0 ? rawLimit : DEFAULT_PREVIEW_LIMIT;

  return Math.min(totalJobs, maxLimit, Math.floor(requestedLimit));
}

function findCorridorForJob(job: GoogleTextSearchJob): HighwaySearchCorridor | undefined {
  return highwaySearchCorridors.find(
    (corridor) => corridor.highwayName === job.expectedHighwayContext && corridor.routeContext === job.expectedRouteContext,
  );
}

function toHighwayStop(place: DiscoveredHighwayPlace, googlePlace: GoogleTextSearchPlace | undefined): HighwayStop | null {
  if (!googlePlace?.location) {
    return null;
  }

  return {
    id: `google-${place.placeId}`,
    name: googlePlace.displayName?.text ?? place.seedName,
    category: toStopCategory(place.proxyType),
    distanceFromRouteMeters: place.distanceFromHighwayMeters,
    distanceFromHighwayMeters: place.distanceFromHighwayMeters,
    detourMinutes: Math.max(1, Math.round(place.distanceFromHighwayMeters / 500)),
    isEndpointStagingArea: false,
    isInsideDenseCity: false,
    source: "google_place",
    confidence: place.confidence,
    openNow: false,
    verified: true,
    lat: googlePlace.location.latitude,
    lng: googlePlace.location.longitude,
    highway: place.highwayContext,
    locality: place.routeContext,
    priceLabel: place.proxyType === "premium_lavatory" ? "Paid" : "Customer access",
    facilities: toFacilities(place),
    placeId: place.placeId,
    googlePlaceName: googlePlace.displayName?.text,
    isPaidPremium: place.proxyType === "premium_lavatory",
  };
}

function toStopCategory(proxyType: ProxyType): HighwayStop["category"] {
  if (proxyType === "fuel_cafe" || proxyType === "fuel_station") {
    return "fuel_station";
  }

  if (proxyType === "food_plaza" || proxyType === "wayside_amenity") {
    return "food_plaza";
  }

  if (proxyType === "premium_lavatory") {
    return "public_restroom";
  }

  return "restaurant_proxy";
}

function toFacilities(place: DiscoveredHighwayPlace): string[] {
  const facilities = ["Google place", "Highway-filtered", place.routeContext];

  if (place.proxyType === "premium_lavatory") {
    facilities.unshift("Paid premium lounge");
  }

  return facilities;
}