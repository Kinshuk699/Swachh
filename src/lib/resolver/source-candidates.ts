import type { OsmCandidate, OvertureCandidate } from "./place-location-resolution.ts";

type CompactOsmRow = {
  id: string;
  name?: string;
  lat: number;
  lon: number;
  tags?: Record<string, string>;
};

type CompactOvertureRow = {
  id: string;
  names?: { primary?: string; common?: string };
  geometry?: { type: "Point"; coordinates: [number, number] };
  categories?: { primary?: string; alternate?: string[] };
  confidence?: number;
  operating_status?: string;
  opening_hours?: string | null;
};

export function loadOsmCandidatesFromJson(json: string): OsmCandidate[] {
  const rows = JSON.parse(json) as CompactOsmRow[];

  return rows.map((row) => ({
    source: "osm",
    sourceId: row.id,
    name: row.name ?? row.tags?.name ?? row.id,
    latitude: row.lat,
    longitude: row.lon,
    categories: osmCategories(row.tags ?? {}),
    openingHours: row.tags?.opening_hours ?? null,
  }));
}

export function loadOvertureCandidatesFromJson(json: string): OvertureCandidate[] {
  const rows = JSON.parse(json) as CompactOvertureRow[];

  return rows.flatMap((row) => {
    if (row.geometry?.type !== "Point") {
      return [];
    }

    const [longitude, latitude] = row.geometry.coordinates;
    const primaryCategory = row.categories?.primary;

    return [
      {
        source: "overture" as const,
        sourceId: row.id,
        name: row.names?.primary ?? row.names?.common ?? row.id,
        latitude,
        longitude,
        categories: [primaryCategory, ...(row.categories?.alternate ?? [])].filter(
          (category): category is string => Boolean(category),
        ),
        confidence: row.confidence,
        operatingStatus: row.operating_status,
        openingHours: row.opening_hours ?? null,
      },
    ];
  });
}

function osmCategories(tags: Record<string, string>): string[] {
  return [tags.amenity, tags.shop, tags.tourism, tags.highway, tags.brand, tags.operator].filter(
    (value): value is string => Boolean(value),
  );
}