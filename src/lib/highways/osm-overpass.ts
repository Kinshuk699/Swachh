import type { CachedNationalHighwayFeature } from "@/data/highways/india-national-highways";

type OverpassLatLng = { lat: number; lon: number };

type OverpassElement = {
  type: string;
  id: number;
  tags?: Record<string, string>;
  geometry?: OverpassLatLng[];
};

type OverpassJson = {
  elements?: OverpassElement[];
};

type FormatDatasetInput = {
  generatedAt: string;
  features: CachedNationalHighwayFeature[];
};

type OverpassTransformOptions = {
  groupByRef?: boolean;
  simplifyToleranceDegrees?: number;
};

const nationalHighwayRefPattern = /(^|;|\s)NH\s*-?\s*\d+[A-Z]?/i;
const supportedHighwayClasses = new Set(["motorway", "trunk", "primary", "secondary"]);

export function buildIndiaNationalHighwaysOverpassQuery(): string {
  return `[out:json][timeout:180];
area["ISO3166-1"="IN"][admin_level=2]->.india;
(
  way["highway"]["ref"~"(^|;| )NH[ -]?[0-9]", i](area.india);
);
out geom;`;
}

export function overpassJsonToCachedHighways(body: OverpassJson, options: OverpassTransformOptions = {}): CachedNationalHighwayFeature[] {
  const features = (body.elements ?? [])
    .filter((element) => element.type === "way")
    .filter((element) => Boolean(element.geometry?.length))
    .map((element) => toCachedFeature(element, options))
    .filter((feature): feature is CachedNationalHighwayFeature => Boolean(feature));

  return options.groupByRef ? groupFeaturesByRef(features) : features;
}

export function formatNationalHighwayDatasetModule(input: FormatDatasetInput): string {
  const featureText = JSON.stringify(input.features);

  return `export type CachedHighwayGeometry = {
  type: "LineString" | "MultiLineString";
  coordinates: number[][] | number[][][];
};

export type CachedNationalHighwayFeature = {
  id: string;
  ref: string;
  name?: string;
  highwayClass: "motorway" | "trunk" | "primary" | "secondary";
  source: "openstreetmap";
  isNationalHighway: boolean;
  isExpressway: boolean;
  geometry: CachedHighwayGeometry;
};

export const nationalHighwayDataset = {
  source: "openstreetmap" as const,
  generatedAt: "${input.generatedAt}",
  attribution: "© OpenStreetMap contributors",
  features: ${featureText} satisfies CachedNationalHighwayFeature[],
};
`;
}

function toCachedFeature(element: OverpassElement, options: OverpassTransformOptions): CachedNationalHighwayFeature | null {
  const ref = element.tags?.ref;
  const geometry = element.geometry;

  if (!ref || !nationalHighwayRefPattern.test(ref) || !geometry?.length) {
    return null;
  }

  const highwayClass = normalizeHighwayClass(element.tags?.highway);
  if (!highwayClass) {
    return null;
  }

  const coordinates = geometry.map((point) => [roundCoordinate(point.lon), roundCoordinate(point.lat)]);

  return {
    id: `osm-${element.type}-${element.id}`,
    ref: normalizeHighwayRef(ref.split(";")[0]),
    name: element.tags?.name,
    highwayClass,
    source: "openstreetmap",
    isNationalHighway: true,
    isExpressway: false,
    geometry: {
      type: "LineString",
      coordinates: simplifyLine(coordinates, options.simplifyToleranceDegrees ?? 0),
    },
  };
}

function groupFeaturesByRef(features: CachedNationalHighwayFeature[]): CachedNationalHighwayFeature[] {
  const groups = new Map<string, { ref: string; name?: string; highwayClass: CachedNationalHighwayFeature["highwayClass"]; lines: number[][][] }>();

  for (const feature of features) {
    const ref = normalizeHighwayRef(feature.ref);
    const group = groups.get(ref) ?? { ref, highwayClass: feature.highwayClass, lines: [] };
    group.name = group.name ?? feature.name;
    group.lines.push(...geometryToLines(feature.geometry));
    groups.set(ref, group);
  }

  return [...groups.values()].map((group) => ({
    id: `osm-${slugHighwayRef(group.ref)}`,
    ref: group.ref,
    name: group.name,
    highwayClass: group.highwayClass,
    source: "openstreetmap",
    isNationalHighway: true,
    isExpressway: false,
    geometry: group.lines.length === 1
      ? { type: "LineString", coordinates: group.lines[0] }
      : { type: "MultiLineString", coordinates: group.lines },
  }));
}

function geometryToLines(geometry: CachedNationalHighwayFeature["geometry"]): number[][][] {
  return geometry.type === "LineString" ? [geometry.coordinates as number[][]] : (geometry.coordinates as number[][][]);
}

function simplifyLine(coordinates: number[][], toleranceDegrees: number): number[][] {
  if (toleranceDegrees <= 0 || coordinates.length <= 2) {
    return coordinates;
  }

  const keep = new Array<boolean>(coordinates.length).fill(false);
  keep[0] = true;
  keep[coordinates.length - 1] = true;
  simplifySection(coordinates, 0, coordinates.length - 1, toleranceDegrees, keep);

  return coordinates.filter((_, index) => keep[index]);
}

function simplifySection(coordinates: number[][], startIndex: number, endIndex: number, toleranceDegrees: number, keep: boolean[]) {
  let maxDistance = 0;
  let maxDistanceIndex = startIndex;
  const start = coordinates[startIndex];
  const end = coordinates[endIndex];

  for (let index = startIndex + 1; index < endIndex; index += 1) {
    const distance = perpendicularDistanceDegrees(coordinates[index], start, end);
    if (distance > maxDistance) {
      maxDistance = distance;
      maxDistanceIndex = index;
    }
  }

  if (maxDistance > toleranceDegrees) {
    keep[maxDistanceIndex] = true;
    simplifySection(coordinates, startIndex, maxDistanceIndex, toleranceDegrees, keep);
    simplifySection(coordinates, maxDistanceIndex, endIndex, toleranceDegrees, keep);
  }
}

function perpendicularDistanceDegrees(point: number[], lineStart: number[], lineEnd: number[]): number {
  const deltaLng = lineEnd[0] - lineStart[0];
  const deltaLat = lineEnd[1] - lineStart[1];

  if (deltaLng === 0 && deltaLat === 0) {
    return Math.hypot(point[0] - lineStart[0], point[1] - lineStart[1]);
  }

  const numerator = Math.abs(deltaLat * point[0] - deltaLng * point[1] + lineEnd[0] * lineStart[1] - lineEnd[1] * lineStart[0]);
  return numerator / Math.hypot(deltaLng, deltaLat);
}

function normalizeHighwayRef(value: string): string {
  const trimmed = value.trim().toUpperCase();
  const match = trimmed.match(/^NH\s*-?\s*(\d+[A-Z]?)$/);
  return match ? `NH-${match[1]}` : trimmed.replace(/\s+/g, " ");
}

function normalizeHighwayClass(value: string | undefined): CachedNationalHighwayFeature["highwayClass"] | null {
  if (!value || !supportedHighwayClasses.has(value)) {
    return null;
  }

  return value as CachedNationalHighwayFeature["highwayClass"];
}

function slugHighwayRef(ref: string): string {
  return ref.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function roundCoordinate(value: number): number {
  return Math.round(value * 100_000) / 100_000;
}
