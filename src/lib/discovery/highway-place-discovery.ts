import { toStoredGooglePlaceReference, type StoredGooglePlaceReference } from "../google/place-policy.ts";

export const googleTextSearchFieldMask = "places.id,places.name,places.location,places.displayName,places.types";
export const defaultMaxHighwayDiversionMeters = 2_000;

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

export type CleanlinessTier = "tier_1" | "tier_2" | "tier_3" | "tier_4";

export type SourceCategory =
  | "premium_restroom"
  | "official_wayside_amenity"
  | "premium_fuel_program"
  | "organized_restaurant"
  | "food_plaza"
  | "dhaba_candidate"
  | "generic_candidate";

export type CleanToiletClassification = {
  cleanlinessTier: CleanlinessTier;
  sourceCategory: SourceCategory;
  sourceEvidence: string;
};

export type HygieneProxyBrand = {
  brandName: string;
  region: string;
  proxyType: ProxyType;
  defaultConfidence: number;
  notes: string;
  corridorIds?: string[];
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
  cleanlinessTier?: CleanlinessTier;
  sourceCategory?: SourceCategory;
  sourceEvidence?: string;
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
  cleanlinessTier?: CleanlinessTier;
  sourceCategory?: SourceCategory;
  sourceEvidence?: string;
  localNotes?: string;
};

export type RejectedDiscoveredHighwayPlace = DiscoveredHighwayPlace & {
  rejectionReason: "seed_name_mismatch";
};

const weakPlaceNameTokens = new Set(["and", "the", "fuel", "cafe", "restaurant", "hotel", "highway", "official", "service"]);
const significantShortPlaceNameTokens = new Set(["bp", "hp"]);
const fuelStationSignalTokens = new Set(["energy", "fuel", "fuels", "outlet", "petrol", "petroleum", "pump", "station", "mobility"]);
const fuelStationGoogleTypes = new Set(["gas_station"]);
const broadRecallSeedKeys = new Set(["lavato", "pathrecharge"]);
const brandSeedAliases = new Map<string, string[]>([
  ["bpclghar", ["bpcl", "bharatpetrol", "bharatpetroleum"]],
  ["indianoilcoco", ["indianoil", "iocl"]],
  ["indianoilswagat", ["indianoil", "iocl"]],
  ["jiobp", ["jiobp"]],
  ["wildbeancafe", ["wildbean"]],
]);

export function buildHighwayPlacesSearchJobs(input: {
  proxyBrands: HygieneProxyBrand[];
  curatedStopCandidates: CuratedStopCandidate[];
  corridors: HighwaySearchCorridor[];
}): GoogleTextSearchJob[] {
  const brandJobs: GoogleTextSearchJob[] = input.proxyBrands.flatMap((brand) =>
    input.corridors.filter((corridor) => !brand.corridorIds?.length || brand.corridorIds.includes(corridor.id)).flatMap((corridor) =>
      corridor.anchors.map((anchor, anchorIndex) => ({
        ...classifyCleanToiletCandidate({ seedName: brand.brandName, proxyType: brand.proxyType, notes: brand.notes }),
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
    ...classifyCleanToiletCandidate({ seedName: candidate.name, proxyType: candidate.proxyType, notes: candidate.notes }),
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
  return partitionHighwayPlaceMatches(input).accepted;
}

export function partitionHighwayPlaceMatches(input: {
  job: GoogleTextSearchJob;
  corridor: HighwaySearchCorridor;
  places: GoogleTextSearchPlace[];
  maxDiversionMeters: number;
}): { accepted: DiscoveredHighwayPlace[]; rejected: RejectedDiscoveredHighwayPlace[] } {
  const accepted: DiscoveredHighwayPlace[] = [];
  const rejected: RejectedDiscoveredHighwayPlace[] = [];

  for (const place of input.places) {
    if (!place.id || !place.location) {
      continue;
    }

    const distanceFromHighwayMeters = Math.round(distanceToPolylineMeters(place.location, input.corridor.polyline));

    if (distanceFromHighwayMeters > input.maxDiversionMeters) {
      continue;
    }

    const classification = getJobCleanToiletClassification(input.job);
    const basePlace: DiscoveredHighwayPlace = {
      placeId: place.id,
      seedName: input.job.seedName,
      highwayContext: input.job.expectedHighwayContext,
      routeContext: input.job.expectedRouteContext,
      region: input.job.region,
      proxyType: input.job.proxyType,
      confidence: input.job.confidence,
      distanceFromHighwayMeters,
      source: "google_places_text_search",
      ...classification,
      localNotes: input.job.notes,
    };

    if (
      !isRelevantGooglePlaceCandidate({
        seedName: input.job.seedName,
        proxyType: input.job.proxyType,
        placeName: place.displayName?.text,
        types: place.types,
      })
    ) {
      rejected.push({ ...basePlace, rejectionReason: "seed_name_mismatch" });
      continue;
    }

    accepted.push(basePlace);
  }

  return {
    accepted: accepted.sort((left, right) => left.distanceFromHighwayMeters - right.distanceFromHighwayMeters),
    rejected: rejected.sort((left, right) => left.distanceFromHighwayMeters - right.distanceFromHighwayMeters),
  };
}

export function dedupeDiscoveredHighwayPlaces<T extends DiscoveredHighwayPlace>(places: T[]): T[] {
  const bestByPlaceId = new Map<string, T>();

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

export function classifyCleanToiletCandidate(input: {
  seedName: string;
  proxyType: ProxyType;
  notes?: string;
}): CleanToiletClassification {
  const seedName = input.seedName.toLowerCase();
  const evidence = input.notes ?? input.seedName;

  if (
    input.proxyType === "premium_lavatory" ||
    includesAny(seedName, ["lavato", "premium lavatory", "premium restroom"])
  ) {
    return { cleanlinessTier: "tier_1", sourceCategory: "premium_restroom", sourceEvidence: evidence };
  }

  if (
    includesAny(seedName, [
      "nhai wayside",
      "nhlml wayside",
      "highway nest",
      "highway village",
      "cube stop",
      "path recharge",
      "expressway rest area",
      "expressway service area",
      "official expressway service",
      "delhi mumbai expressway",
      "agra lucknow expressway",
      "samruddhi",
      "purvanchal expressway",
      "bundelkhand expressway",
      "yamuna expressway facilities",
    ])
  ) {
    return { cleanlinessTier: "tier_1", sourceCategory: "official_wayside_amenity", sourceEvidence: evidence };
  }

  if (
    input.proxyType === "fuel_cafe" ||
    includesAny(seedName, [
      "hpcl focus",
      "club hp",
      "bpcl pure for sure",
      "pure for sure platinum",
      "bpcl ghar",
      "indian oil swagat",
      "indian oil coco",
      "jio-bp",
      "shell select",
      "shell cafe",
      "wild bean cafe",
      "reliance",
      "reliance petroleum",
      "reliance bp mobility",
      "nayara",
      "nayara energy",
    ])
  ) {
    return { cleanlinessTier: "tier_2", sourceCategory: "premium_fuel_program", sourceEvidence: evidence };
  }

  if (input.proxyType === "food_plaza") {
    return { cleanlinessTier: "tier_3", sourceCategory: "food_plaza", sourceEvidence: evidence };
  }

  if (input.proxyType === "qsr" || input.proxyType === "restaurant_proxy") {
    return { cleanlinessTier: "tier_3", sourceCategory: "organized_restaurant", sourceEvidence: evidence };
  }

  if (input.proxyType === "dhaba_proxy") {
    return { cleanlinessTier: "tier_4", sourceCategory: "dhaba_candidate", sourceEvidence: evidence };
  }

  return { cleanlinessTier: "tier_4", sourceCategory: "generic_candidate", sourceEvidence: evidence };
}

export function getPlaceCleanToiletClassification(place: DiscoveredHighwayPlace): CleanToiletClassification {
  if (place.cleanlinessTier && place.sourceCategory && place.sourceEvidence) {
    return {
      cleanlinessTier: place.cleanlinessTier,
      sourceCategory: place.sourceCategory,
      sourceEvidence: place.sourceEvidence,
    };
  }

  return classifyCleanToiletCandidate({ seedName: place.seedName, proxyType: place.proxyType, notes: place.localNotes });
}

function scoreDiscoveredPlace(place: DiscoveredHighwayPlace): number {
  return place.confidence * 100 - place.distanceFromHighwayMeters / 100;
}

function getJobCleanToiletClassification(job: GoogleTextSearchJob): CleanToiletClassification {
  if (job.cleanlinessTier && job.sourceCategory && job.sourceEvidence) {
    return {
      cleanlinessTier: job.cleanlinessTier,
      sourceCategory: job.sourceCategory,
      sourceEvidence: job.sourceEvidence,
    };
  }

  return classifyCleanToiletCandidate({ seedName: job.seedName, proxyType: job.proxyType, notes: job.notes });
}

export function isRelevantGooglePlaceNameMatch(seedName: string, placeName: string | undefined): boolean {
  if (!placeName) {
    return false;
  }

  const normalizedPlaceName = normalizeForPlaceMatch(placeName);
  const normalizedSeedName = normalizeForPlaceMatch(seedName);
  const placeTokens = tokenizeForPlaceMatch(placeName);

  if (!normalizedPlaceName || !normalizedSeedName) {
    return false;
  }

  if (normalizedSeedName.startsWith("cubestop")) {
    return placeTokens[0] === "cube" && placeTokens[1] === "stop";
  }

  if (normalizedSeedName.startsWith("shell")) {
    return placeTokens[0] === "shell";
  }

  if (normalizedSeedName.includes("highwaynest")) {
    return placeTokens.includes("highway") && placeTokens.includes("nest") && (!normalizedSeedName.includes("mini") || placeTokens.includes("mini"));
  }

  if (normalizedSeedName.includes("highwayvillage")) {
    return placeTokens.includes("highway") && placeTokens.includes("village");
  }

  if (isRelianceFuelSeed(normalizedSeedName)) {
    return placeTokens.includes("reliance") && hasFuelStationSignal(placeTokens);
  }

  if (isNayaraFuelSeed(normalizedSeedName)) {
    return placeTokens.includes("nayara") && hasFuelStationSignal(placeTokens);
  }

  if (broadRecallSeedKeys.has(normalizedSeedName)) {
    return true;
  }

  if (normalizedPlaceName.includes(normalizedSeedName)) {
    return true;
  }

  const aliases = brandSeedAliases.get(normalizedSeedName) ?? [];
  if (aliases.some((alias) => normalizedPlaceName.includes(alias))) {
    return true;
  }

  const tokens = tokenizeForPlaceMatch(seedName)
    .filter((token) => (token.length >= 3 || significantShortPlaceNameTokens.has(token)) && !weakPlaceNameTokens.has(token));
  const placeTokenSet = new Set(placeTokens);

  return (
    tokens.length > 0 &&
    tokens.every((token) => (significantShortPlaceNameTokens.has(token) ? placeTokenSet.has(token) : normalizedPlaceName.includes(token)))
  );
}

export function isRelevantGooglePlaceCandidate(input: {
  seedName: string;
  proxyType: ProxyType;
  placeName: string | undefined;
  types: string[] | undefined;
}): boolean {
  if (!isRelevantGooglePlaceNameMatch(input.seedName, input.placeName)) {
    return false;
  }

  if (isStrictFuelOperatorSeed(input.seedName)) {
    return hasFuelStationGoogleType(input.types);
  }

  return true;
}

function normalizeForPlaceMatch(input: string): string {
  return input.toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, "");
}

function tokenizeForPlaceMatch(input: string): string[] {
  return input
    .toLowerCase()
    .replace(/&/g, " and ")
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

function includesAny(input: string, needles: string[]): boolean {
  return needles.some((needle) => input.includes(needle));
}

function hasFuelStationSignal(tokens: string[]): boolean {
  return tokens.some((token) => fuelStationSignalTokens.has(token));
}

function hasFuelStationGoogleType(types: string[] | undefined): boolean {
  return Boolean(types?.some((type) => fuelStationGoogleTypes.has(type)));
}

function isStrictFuelOperatorSeed(seedName: string): boolean {
  const normalizedSeedName = normalizeForPlaceMatch(seedName);

  return isRelianceFuelSeed(normalizedSeedName) || isNayaraFuelSeed(normalizedSeedName);
}

function isRelianceFuelSeed(normalizedSeedName: string): boolean {
  return normalizedSeedName === "reliance" || normalizedSeedName.includes("reliancepetroleum") || normalizedSeedName.includes("reliancebpmobility");
}

function isNayaraFuelSeed(normalizedSeedName: string): boolean {
  return normalizedSeedName === "nayara" || normalizedSeedName.includes("nayaraenergy");
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