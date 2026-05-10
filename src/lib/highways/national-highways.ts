import { nationalHighwayDataset, type CachedHighwayGeometry, type CachedNationalHighwayFeature } from "../../data/highways/india-national-highways.ts";

export type HighwayBounds = { north: number; south: number; east: number; west: number };

export type NationalHighwayOverlay = {
  id: string;
  ref: string;
  name?: string;
  color: string;
  bounds: HighwayBounds;
  geometry: CachedHighwayGeometry;
};

const highwayColors = ["#2563eb", "#dc2626", "#16a34a", "#7c3aed", "#0891b2", "#ea580c", "#be123c", "#4f46e5"];

export function getCachedNationalHighwayOverlays(): NationalHighwayOverlay[] {
  return buildNationalHighwayOverlays(nationalHighwayDataset.features);
}

export function getNationalHighwayAttribution(): string {
  return nationalHighwayDataset.attribution;
}

export function getNationalHighwayGeneratedAt(): string {
  return nationalHighwayDataset.generatedAt;
}

export function buildNationalHighwayOverlays(features: CachedNationalHighwayFeature[]): NationalHighwayOverlay[] {
  const groups = new Map<string, { ref: string; name?: string; lines: number[][][] }>();

  for (const feature of features) {
    if (!feature.isNationalHighway) {
      continue;
    }

    const ref = normalizeHighwayRef(feature.ref);
    const group = groups.get(ref) ?? { ref, lines: [] };
    group.name = group.name ?? feature.name;
    group.lines.push(...geometryToLines(feature.geometry));
    groups.set(ref, group);
  }

  return [...groups.values()].map((group, index) => {
    const geometry: CachedHighwayGeometry =
      group.lines.length === 1 ? { type: "LineString", coordinates: group.lines[0] } : { type: "MultiLineString", coordinates: group.lines };

    return {
      id: slugHighwayRef(group.ref),
      ref: group.ref,
      name: group.name,
      color: highwayColors[index % highwayColors.length],
      bounds: calculateGeometryBounds(geometry),
      geometry,
    };
  });
}

export function normalizeHighwayRef(value: string): string {
  const trimmed = value.trim().toUpperCase();
  const match = trimmed.match(/^NH\s*-?\s*(\d+[A-Z]?)$/);
  return match ? `NH-${match[1]}` : trimmed.replace(/\s+/g, " ");
}

export function calculateGeometryBounds(geometry: CachedHighwayGeometry): HighwayBounds {
  const coordinates = flattenCoordinates(geometry);
  const latitudes = coordinates.map((coordinate) => coordinate[1]);
  const longitudes = coordinates.map((coordinate) => coordinate[0]);

  return {
    north: Math.max(...latitudes),
    south: Math.min(...latitudes),
    east: Math.max(...longitudes),
    west: Math.min(...longitudes),
  };
}

export function flattenCoordinates(geometry: CachedHighwayGeometry): number[][] {
  return geometry.type === "LineString" ? (geometry.coordinates as number[][]) : (geometry.coordinates as number[][][]).flat();
}

function geometryToLines(geometry: CachedHighwayGeometry): number[][][] {
  return geometry.type === "LineString" ? [geometry.coordinates as number[][]] : (geometry.coordinates as number[][][]);
}

function slugHighwayRef(ref: string): string {
  return ref.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}
