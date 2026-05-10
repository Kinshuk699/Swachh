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

export function overpassJsonToCachedHighways(body: OverpassJson): CachedNationalHighwayFeature[] {
  return (body.elements ?? [])
    .filter((element) => element.type === "way")
    .filter((element) => Boolean(element.geometry?.length))
    .map(toCachedFeature)
    .filter((feature): feature is CachedNationalHighwayFeature => Boolean(feature));
}

export function formatNationalHighwayDatasetModule(input: FormatDatasetInput): string {
  const featureText = JSON.stringify(input.features, null, 2).replace(/"([^"\\]+)":/g, "$1:");

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

function toCachedFeature(element: OverpassElement): CachedNationalHighwayFeature | null {
  const ref = element.tags?.ref;
  const geometry = element.geometry;

  if (!ref || !nationalHighwayRefPattern.test(ref) || !geometry?.length) {
    return null;
  }

  const highwayClass = normalizeHighwayClass(element.tags?.highway);
  if (!highwayClass) {
    return null;
  }

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
      coordinates: geometry.map((point) => [point.lon, point.lat]),
    },
  };
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
