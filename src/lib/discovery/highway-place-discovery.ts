import { toStoredGooglePlaceReference, type StoredGooglePlaceReference } from "../google/place-policy.ts";

export const googleTextSearchFieldMask = "places.id,places.name,places.location,places.displayName,places.types";

export type LatLng = {
  latitude: number;
  longitude: number;
};

export type ProxyType =
  | "qsr"
  | "wayside_amenity"
  | "fuel_cafe"
  | "fuel_station"
  | "food_plaza"
  | "restaurant_proxy"
  | "premium_lavatory"
  | "dhaba_proxy";

export type HygieneProxyBrand = {
  brandName: string;
  region: string;
  proxyType: ProxyType;
  defaultConfidence: number;
  notes: string;
};

export type CuratedStopCandidate = {
  name: string;
  region: string;
  proxyType: ProxyType;
  highwayContext: string;
  routeContext: string;
  localityHint?: string;
  defaultConfidence: number;
  notes: string;
};

export type HighwaySearchAnchor = LatLng & {
  radiusMeters: number;
};

export type HighwaySearchCorridor = {
  id: string;
  highwayName: string;
  routeContext: string;
  region: string;
  anchors: HighwaySearchAnchor[];
  polyline: LatLng[];
};

export type GoogleTextSearchJob = {
  id: string;
  sourceKind: "proxy_brand" | "curated_stop";
  textQuery: string;
  seedName: string;
  expectedHighwayContext: string;
  expectedRouteContext: string;
  region: string;
  proxyType: ProxyType;
  confidence: number;
  notes?: string;
  pageSize: number;
  regionCode: "IN";
  fieldMask: typeof googleTextSearchFieldMask;
  locationBias?: {
    circle: {
      center: LatLng;
      radius: number;
    };
  };
};

export type GoogleTextSearchPlace = {
  id?: string;
  name?: string;
  displayName?: { text?: string; languageCode?: string };
  location?: LatLng;
  types?: string[];
};

export type DiscoveredHighwayPlace = {
  placeId: string;
  seedName: string;
  highwayContext: string;
  routeContext: string;
  region: string;
  proxyType: ProxyType;
  confidence: number;
  distanceFromHighwayMeters: number;
  source: "google_places_text_search";
  localNotes?: string;
};

export function buildHighwayPlacesSearchJobs(input: {
  proxyBrands: HygieneProxyBrand[];
  curatedStopCandidates: CuratedStopCandidate[];
  corridors: HighwaySearchCorridor[];
}): GoogleTextSearchJob[] {
  const brandJobs: GoogleTextSearchJob[] = input.proxyBrands.flatMap((brand) =>
    input.corridors.flatMap((corridor) =>
      corridor.anchors.map((anchor, anchorIndex) => ({
        id: `proxy-brand:${slugify(brand.brandName)}:${corridor.id}:${anchorIndex}`,
        sourceKind: "proxy_brand" as const,
        textQuery: compactJoin([brand.brandName, corridor.highwayName, corridor.routeContext, "India"]),
        seedName: brand.brandName,
        expectedHighwayContext: corridor.highwayName,
        expectedRouteContext: corridor.routeContext,
        region: corridor.region,
        proxyType: brand.proxyType,
        confidence: clampConfidence(brand.defaultConfidence),
        notes: brand.notes,
        pageSize: 10,
        regionCode: "IN" as const,
        fieldMask: googleTextSearchFieldMask,
        locationBias: {
          circle: {
            center: { latitude: anchor.latitude, longitude: anchor.longitude },
            radius: Math.min(anchor.radiusMeters, 50_000),
          },
        },
      })),
    ),
  );

  const curatedJobs: GoogleTextSearchJob[] = input.curatedStopCandidates.map((candidate) => ({
    id: `curated-stop:${slugify(candidate.name)}:${slugify(candidate.highwayContext)}:${slugify(candidate.routeContext)}`,
    sourceKind: "curated_stop" as const,
    textQuery: compactJoin([
      candidate.name,
      searchQualifierForProxyType(candidate.proxyType),
      candidate.highwayContext,
      candidate.routeContext,
      candidate.localityHint,
      "India",
    ]),
    seedName: candidate.name,
    expectedHighwayContext: candidate.highwayContext,
    expectedRouteContext: candidate.routeContext,
    region: candidate.region,
    proxyType: candidate.proxyType,
    confidence: clampConfidence(candidate.defaultConfidence),
    notes: candidate.notes,
    pageSize: 5,
    regionCode: "IN" as const,
    fieldMask: googleTextSearchFieldMask,
  }));

  return [...curatedJobs, ...brandJobs];
}

export function filterHighwayPlaceMatches(input: {
  job: GoogleTextSearchJob;
  corridor: HighwaySearchCorridor;
  places: GoogleTextSearchPlace[];
  maxDiversionMeters: number;
}): DiscoveredHighwayPlace[] {
  return input.places
    .flatMap((place): DiscoveredHighwayPlace[] => {
      if (!place.id || !place.location) {
        return [];
      }

      const distanceFromHighwayMeters = Math.round(distanceToPolylineMeters(place.location, input.corridor.polyline));

      if (distanceFromHighwayMeters > input.maxDiversionMeters) {
        return [];
      }

      return [
        {
          placeId: place.id,
          seedName: input.job.seedName,
          highwayContext: input.job.expectedHighwayContext,
          routeContext: input.job.expectedRouteContext,
          region: input.job.region,
          proxyType: input.job.proxyType,
          confidence: input.job.confidence,
          distanceFromHighwayMeters,
          source: "google_places_text_search",
          localNotes: input.job.notes,
        },
      ];
    })
    .sort((left, right) => left.distanceFromHighwayMeters - right.distanceFromHighwayMeters);
}

export function dedupeDiscoveredHighwayPlaces(places: DiscoveredHighwayPlace[]): DiscoveredHighwayPlace[] {
  const bestByPlaceId = new Map<string, DiscoveredHighwayPlace>();

  for (const place of places) {
    const existing = bestByPlaceId.get(place.placeId);

    if (!existing || scoreDiscoveredPlace(place) > scoreDiscoveredPlace(existing)) {
      bestByPlaceId.set(place.placeId, place);
    }
  }

  return [...bestByPlaceId.values()].sort((left, right) => scoreDiscoveredPlace(right) - scoreDiscoveredPlace(left));
}

export function toStoredCuratedPlaceReference(place: DiscoveredHighwayPlace): StoredGooglePlaceReference {
  const localNotes = compactJoin([place.seedName, place.region, place.routeContext, place.localNotes], " | ");

  return toStoredGooglePlaceReference({
    placeId: place.placeId,
    highwayContext: place.highwayContext,
    restroomConfidence: place.confidence,
    localNotes,
  });
}

function scoreDiscoveredPlace(place: DiscoveredHighwayPlace): number {
  return place.confidence * 100 - place.distanceFromHighwayMeters / 100;
}

function compactJoin(parts: Array<string | undefined>, separator = " "): string {
  return parts.filter((part): part is string => Boolean(part?.trim())).join(separator);
}

function clampConfidence(confidence: number): number {
  return Math.min(1, Math.max(0, confidence));
}

function searchQualifierForProxyType(proxyType: ProxyType): string | undefined {
  if (proxyType === "premium_lavatory") {
    return "washroom";
  }

  return undefined;
}

function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function distanceToPolylineMeters(point: LatLng, polyline: LatLng[]): number {
  if (polyline.length === 0) {
    return Number.POSITIVE_INFINITY;
  }

  if (polyline.length === 1) {
    return haversineMeters(point, polyline[0]);
  }

  let minimumDistance = Number.POSITIVE_INFINITY;

  for (let index = 0; index < polyline.length - 1; index += 1) {
    minimumDistance = Math.min(minimumDistance, distanceToSegmentMeters(point, polyline[index], polyline[index + 1]));
  }

  return minimumDistance;
}

function distanceToSegmentMeters(point: LatLng, start: LatLng, end: LatLng): number {
  const origin = start;
  const projectedPoint = projectMeters(point, origin);
  const projectedStart = projectMeters(start, origin);
  const projectedEnd = projectMeters(end, origin);
  const segmentX = projectedEnd.x - projectedStart.x;
  const segmentY = projectedEnd.y - projectedStart.y;
  const segmentLengthSquared = segmentX * segmentX + segmentY * segmentY;

  if (segmentLengthSquared === 0) {
    return haversineMeters(point, start);
  }

  const rawProjection =
    ((projectedPoint.x - projectedStart.x) * segmentX + (projectedPoint.y - projectedStart.y) * segmentY) /
    segmentLengthSquared;
  const projection = Math.min(1, Math.max(0, rawProjection));
  const closestX = projectedStart.x + projection * segmentX;
  const closestY = projectedStart.y + projection * segmentY;

  return Math.hypot(projectedPoint.x - closestX, projectedPoint.y - closestY);
}

function projectMeters(point: LatLng, origin: LatLng): { x: number; y: number } {
  const earthRadiusMeters = 6_371_000;
  const meanLatitude = toRadians((point.latitude + origin.latitude) / 2);

  return {
    x: toRadians(point.longitude - origin.longitude) * earthRadiusMeters * Math.cos(meanLatitude),
    y: toRadians(point.latitude - origin.latitude) * earthRadiusMeters,
  };
}

function haversineMeters(left: LatLng, right: LatLng): number {
  const earthRadiusMeters = 6_371_000;
  const deltaLatitude = toRadians(right.latitude - left.latitude);
  const deltaLongitude = toRadians(right.longitude - left.longitude);
  const leftLatitude = toRadians(left.latitude);
  const rightLatitude = toRadians(right.latitude);
  const haversine =
    Math.sin(deltaLatitude / 2) ** 2 +
    Math.cos(leftLatitude) * Math.cos(rightLatitude) * Math.sin(deltaLongitude / 2) ** 2;

  return 2 * earthRadiusMeters * Math.asin(Math.sqrt(haversine));
}

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}