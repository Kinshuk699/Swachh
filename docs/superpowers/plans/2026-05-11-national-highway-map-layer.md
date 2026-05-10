# National Highway Map Layer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show all non-rejected Tier 1/2/3 Swachh stops on Google Maps with a cached OpenStreetMap-derived National Highway overlay, colored highway controls, and a follow-on path for capped discovery across remaining NH corridors.

**Architecture:** Keep Google Maps as the browser basemap and add Swachh-owned data layers above it. Supabase remains the source for curated stops; a cached OSM/Overpass-derived GeoJSON file becomes the source for National Highway geometry; small TypeScript utility modules normalize highway refs, assign colors, compute bounds, and group stop counts for UI and API tests.

**Tech Stack:** Next.js App Router, TypeScript, Vitest, React Testing Library, Tailwind CSS, `@vis.gl/react-google-maps`, Supabase, Google Places Details, OpenStreetMap/Overpass cached GeoJSON.

---

## Guardrails

- Do not commit during execution unless the user explicitly asks.
- Use TDD for behavior-bearing code: write the failing test, confirm it fails, implement the minimal change, confirm it passes.
- Keep Overpass as an import-time dependency only. Normal users must load cached app data, not call Overpass.
- Keep Google Text Search capped. Any future NH discovery expansion must dry-run counts first and use `--max-text-search-requests`.
- Preserve rejected rows in the existing review ledger workflow; do not render them on the map.

## File Structure

- Modify: `src/app/api/google-curated-places/route.ts` — add explicit `visibility=all_found` support and include `matched` rows for map inspection mode.
- Modify: `src/app/api/google-curated-places/route.test.ts` — cover all-found visibility and rejected-row exclusion via status filtering.
- Create: `src/data/highways/india-national-highways.ts` — cached app-ready National Highway sample/fixture for the first implementation pass, with OSM attribution metadata.
- Create: `src/lib/highways/national-highways.ts` — normalize NH refs, assign stable colors, calculate bounds, and convert cached geometry into API/UI models.
- Create: `src/lib/highways/national-highways.test.ts` — unit tests for normalization, bounds, colors, and feature filtering.
- Create: `src/lib/highways/osm-overpass.ts` — build the Overpass query, transform OSM JSON into cached highway features, and format the generated TypeScript dataset module.
- Create: `src/lib/highways/osm-overpass.test.ts` — test query construction and OSM transformation without hitting the network.
- Create: `scripts/import-national-highways-osm.ts` — manual import script that calls Overpass once and writes the cached dataset file.
- Modify: `package.json` — add `import:national-highways-osm` script.
- Create: `src/app/api/highways/national/route.ts` — serve cached National Highway geometry with color, bounds, and attribution.
- Create: `src/app/api/highways/national/route.test.ts` — test response shape and no runtime Overpass dependency.
- Modify: `src/lib/restrooms/sample-stops.ts` — add optional `cleanlinessTier` and `verificationStatus` fields to `HighwayStop` so UI markers can style tiers without exposing raw internals in labels.
- Modify: `src/app/api/google-curated-places/route.ts` — populate `cleanlinessTier` and `verificationStatus` in stop objects.
- Modify: `src/components/map/MapCanvas.tsx` — fetch all-found stops, fetch highway overlay data, render polylines, add right-side highway panel, click-to-zoom, tier legend, and OSM attribution.
- Modify: `src/components/map/MapCanvas.test.tsx` — cover all-found fetch URL, highway fetch, tier markers, highway controls, and route selection callbacks.
- Create: `docs/data-sourcing/national-highway-osm-import.md` — document the Overpass cache workflow and future full-NH expansion process.

---

### Task 1: Curated Places All-Found Visibility

**Files:**
- Modify: `src/app/api/google-curated-places/route.test.ts`
- Modify: `src/app/api/google-curated-places/route.ts`
- Modify: `src/lib/restrooms/sample-stops.ts`

- [ ] **Step 1: Write the failing all-found visibility test**

Add this test to `src/app/api/google-curated-places/route.test.ts` inside the existing `describe("GET /api/google-curated-places", () => { ... })` block:

```ts
  it("supports all_found visibility for mapped Tier 1, Tier 2, and Tier 3 rows without rejected rows", async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-key";
    process.env.GOOGLE_MAPS_SERVER_API_KEY = "server-key";
    limitSpy.mockResolvedValue({
      data: [
        {
          google_place_id: "tier-three-food-plaza-id",
          seed_name: "Village Food Courts",
          region: "South India",
          proxy_type: "food_plaza",
          cleanliness_tier: "tier_3",
          source_category: "food_plaza",
          source_evidence: "Organized food plaza",
          highway_name: "NH-44",
          route_context: "Bengaluru-Hyderabad",
          restroom_confidence: 0.82,
          distance_from_highway_meters: 180,
          local_notes: "Organized food plaza",
          verification_status: "matched",
        },
      ],
      error: null,
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            id: "tier-three-food-plaza-id",
            displayName: { text: "Village Food Courts" },
            location: { latitude: 13.65, longitude: 77.6 },
            types: ["restaurant", "food"],
            googleMapsUri: "https://maps.google.com/?cid=456",
          }),
          { status: 200 },
        ),
      ),
    );
    const { GET } = await import("./route");

    const response = await GET(new Request("http://localhost/api/google-curated-places?visibility=all_found&limit=1"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.visibility).toBe("all_found");
    expect(body.textSearchRequests).toBe(0);
    expect(body.places).toHaveLength(1);
    expect(body.places[0]).toMatchObject({
      placeId: "tier-three-food-plaza-id",
      highway: "NH-44",
      locality: "Bengaluru-Hyderabad",
      cleanlinessTier: "tier_3",
      verificationStatus: "matched",
    });
    expect(inSpy).toHaveBeenCalledWith("verification_status", ["likely_clean", "matched", "verified_clean", "approved"]);
  });
```

- [ ] **Step 2: Run the focused route test and confirm failure**

Run:

```bash
npm run test -- src/app/api/google-curated-places/route.test.ts
```

Expected: FAIL because the route does not yet parse `visibility=all_found`, does not query `matched`, and does not return `visibility`.

- [ ] **Step 3: Add optional stop metadata fields**

Modify `src/lib/restrooms/sample-stops.ts` so `HighwayStop` includes optional display metadata:

```ts
export type HighwayStop = CandidateStop & {
  lat: number;
  lng: number;
  highway: string;
  locality: string;
  priceLabel: "Free" | "Customer access" | "Paid" | "Unknown";
  facilities: string[];
  placeId?: string;
  googleMapsUri?: string;
  googlePlaceName?: string;
  openingHoursText?: string[];
  isPaidPremium?: boolean;
  cleanlinessLabel?: string;
  sourceLabel?: string;
  cleanlinessTier?: "tier_1" | "tier_2" | "tier_3" | "tier_4";
  verificationStatus?: "likely_clean" | "matched" | "verified_clean" | "approved";
};
```

- [ ] **Step 4: Implement visibility parsing and row status typing**

In `src/app/api/google-curated-places/route.ts`, replace the status constants and status type with:

```ts
const publicMapStatuses = ["likely_clean", "verified_clean", "approved"] as const;
const allFoundMapStatuses = ["likely_clean", "matched", "verified_clean", "approved"] as const;
type CuratedMapVisibility = "public" | "all_found";
type GoogleCuratedPlaceVerificationStatus = (typeof allFoundMapStatuses)[number];
```

Update `GoogleCuratedPlaceRow`:

```ts
type GoogleCuratedPlaceRow = {
  google_place_id: string;
  seed_name: string;
  region: string;
  proxy_type: ProxyType;
  cleanliness_tier: CleanlinessTier;
  source_category: SourceCategory;
  source_evidence: string;
  highway_name: string;
  route_context: string | null;
  restroom_confidence: number;
  distance_from_highway_meters: number;
  local_notes: string | null;
  verification_status: GoogleCuratedPlaceVerificationStatus;
};
```

Add helpers below `getRequestedLimit`:

```ts
function getRequestedVisibility(request: Request): CuratedMapVisibility {
  return new URL(request.url).searchParams.get("visibility") === "all_found" ? "all_found" : "public";
}

function statusesForVisibility(visibility: CuratedMapVisibility): GoogleCuratedPlaceVerificationStatus[] {
  return visibility === "all_found" ? [...allFoundMapStatuses] : [...publicMapStatuses];
}
```

In `GET`, compute visibility before Supabase query:

```ts
  const limit = getRequestedLimit(request);
  const visibility = getRequestedVisibility(request);
  const visibilityStatuses = statusesForVisibility(visibility);
  const storedRowLimit = Math.min(limit * 5, 500);
```

Replace the Supabase status filter with:

```ts
    .in("verification_status", visibilityStatuses)
```

Return `visibility` in all successful JSON responses:

```ts
  return NextResponse.json({
    visibility,
    places,
    storedRowsRead: rows.length,
    placeDetailsRequests,
    textSearchRequests: 0,
    capped: rows.length === storedRowLimit || (places.length < limit && placeDetailsRequests === maxPlaceDetailsRequests),
  });
```

- [ ] **Step 5: Populate tier/status metadata on stop objects**

In `toHighwayStop`, add these properties to the returned object:

```ts
    cleanlinessTier: row.cleanliness_tier,
    verificationStatus: row.verification_status,
```

- [ ] **Step 6: Run the focused route test and confirm pass**

Run:

```bash
npm run test -- src/app/api/google-curated-places/route.test.ts
```

Expected: PASS for all tests in `route.test.ts`.

---

### Task 2: Cached National Highway Data Utilities

**Files:**
- Create: `src/data/highways/india-national-highways.ts`
- Create: `src/lib/highways/national-highways.test.ts`
- Create: `src/lib/highways/national-highways.ts`

- [ ] **Step 1: Add a small cached NH dataset for the first implementation pass**

Create `src/data/highways/india-national-highways.ts`:

```ts
export type CachedHighwayGeometry = {
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
  generatedAt: "2026-05-11T00:00:00.000Z",
  attribution: "© OpenStreetMap contributors",
  features: [
    {
      id: "nh-44-south-sample",
      ref: "NH 44",
      name: "National Highway 44",
      highwayClass: "trunk",
      source: "openstreetmap",
      isNationalHighway: true,
      isExpressway: false,
      geometry: {
        type: "LineString",
        coordinates: [
          [77.59, 13.05],
          [77.7, 13.2],
          [77.6, 13.65],
          [77.6, 14.68],
          [77.63, 15.83],
        ],
      },
    },
    {
      id: "nh-48-north-west-sample",
      ref: "NH-48",
      name: "National Highway 48",
      highwayClass: "trunk",
      source: "openstreetmap",
      isNationalHighway: true,
      isExpressway: false,
      geometry: {
        type: "LineString",
        coordinates: [
          [76.96, 28.39],
          [76.39, 27.99],
          [76.08, 27.55],
          [75.56, 26.84],
          [75.17, 26.58],
          [74.64, 26.45],
        ],
      },
    },
    {
      id: "nh-19-east-sample",
      ref: "NH 19",
      name: "National Highway 19",
      highwayClass: "trunk",
      source: "openstreetmap",
      isNationalHighway: true,
      isExpressway: false,
      geometry: {
        type: "LineString",
        coordinates: [
          [88.14, 22.75],
          [87.86, 23.23],
          [86.98, 23.68],
          [86.42, 23.77],
          [84.36, 24.76],
        ],
      },
    },
  ] satisfies CachedNationalHighwayFeature[],
};
```

- [ ] **Step 2: Write failing utility tests**

Create `src/lib/highways/national-highways.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { buildNationalHighwayOverlays, calculateGeometryBounds, normalizeHighwayRef } from "./national-highways";

describe("national highway utilities", () => {
  it("normalizes OSM National Highway refs for UI grouping", () => {
    expect(normalizeHighwayRef("NH 44")).toBe("NH-44");
    expect(normalizeHighwayRef("NH-48")).toBe("NH-48");
    expect(normalizeHighwayRef(" nh 19 ")).toBe("NH-19");
  });

  it("calculates bounds from LineString coordinates", () => {
    expect(
      calculateGeometryBounds({
        type: "LineString",
        coordinates: [
          [77.59, 13.05],
          [77.7, 13.2],
          [77.6, 13.65],
        ],
      }),
    ).toEqual({ north: 13.65, south: 13.05, east: 77.7, west: 77.59 });
  });

  it("filters to National Highways and assigns stable colors", () => {
    const overlays = buildNationalHighwayOverlays([
      {
        id: "nh-44",
        ref: "NH 44",
        name: "National Highway 44",
        highwayClass: "trunk",
        source: "openstreetmap",
        isNationalHighway: true,
        isExpressway: false,
        geometry: { type: "LineString", coordinates: [[77.59, 13.05], [77.7, 13.2]] },
      },
      {
        id: "expressway",
        ref: "Yamuna Expressway",
        highwayClass: "motorway",
        source: "openstreetmap",
        isNationalHighway: false,
        isExpressway: true,
        geometry: { type: "LineString", coordinates: [[77.55, 28.56], [77.83, 28.23]] },
      },
    ]);

    expect(overlays).toHaveLength(1);
    expect(overlays[0]).toMatchObject({ id: "nh-44", ref: "NH-44", color: "#2563eb" });
  });
});
```

- [ ] **Step 3: Run utility tests and confirm failure**

Run:

```bash
npm run test -- src/lib/highways/national-highways.test.ts
```

Expected: FAIL because `src/lib/highways/national-highways.ts` does not exist.

- [ ] **Step 4: Implement highway utility module**

Create `src/lib/highways/national-highways.ts`:

```ts
import { nationalHighwayDataset, type CachedHighwayGeometry, type CachedNationalHighwayFeature } from "@/data/highways/india-national-highways";

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
  return features
    .filter((feature) => feature.isNationalHighway)
    .map((feature, index) => ({
      id: feature.id,
      ref: normalizeHighwayRef(feature.ref),
      name: feature.name,
      color: highwayColors[index % highwayColors.length],
      bounds: calculateGeometryBounds(feature.geometry),
      geometry: feature.geometry,
    }));
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
```

- [ ] **Step 5: Run utility tests and confirm pass**

Run:

```bash
npm run test -- src/lib/highways/national-highways.test.ts
```

Expected: PASS.

---

### Task 3: OSM/Overpass Full Import Script

**Files:**
- Create: `src/lib/highways/osm-overpass.test.ts`
- Create: `src/lib/highways/osm-overpass.ts`
- Create: `scripts/import-national-highways-osm.ts`
- Modify: `package.json`

- [ ] **Step 1: Write failing Overpass utility tests**

Create `src/lib/highways/osm-overpass.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { buildIndiaNationalHighwaysOverpassQuery, formatNationalHighwayDatasetModule, overpassJsonToCachedHighways } from "./osm-overpass";

describe("OSM Overpass National Highway import helpers", () => {
  it("builds an India-scoped National Highway Overpass query", () => {
    const query = buildIndiaNationalHighwaysOverpassQuery();

    expect(query).toContain('["ISO3166-1"="IN"]');
    expect(query).toContain('["ref"~"(^|;| )NH[ -]?[0-9]", i]');
    expect(query).toContain("out geom");
  });

  it("converts OSM way geometry into cached National Highway features", () => {
    const features = overpassJsonToCachedHighways({
      elements: [
        {
          type: "way",
          id: 1001,
          tags: { ref: "NH 44", name: "National Highway 44", highway: "trunk" },
          geometry: [
            { lat: 13.05, lon: 77.59 },
            { lat: 13.2, lon: 77.7 },
          ],
        },
        {
          type: "way",
          id: 2001,
          tags: { ref: "SH 12", highway: "primary" },
          geometry: [
            { lat: 11.1, lon: 76.1 },
            { lat: 11.2, lon: 76.2 },
          ],
        },
      ],
    });

    expect(features).toHaveLength(1);
    expect(features[0]).toMatchObject({
      id: "osm-way-1001",
      ref: "NH-44",
      name: "National Highway 44",
      highwayClass: "trunk",
      source: "openstreetmap",
      isNationalHighway: true,
      isExpressway: false,
      geometry: { type: "LineString", coordinates: [[77.59, 13.05], [77.7, 13.2]] },
    });
  });

  it("formats generated cached data as a TypeScript module", () => {
    const moduleText = formatNationalHighwayDatasetModule({
      generatedAt: "2026-05-11T00:00:00.000Z",
      features: [
        {
          id: "osm-way-1001",
          ref: "NH-44",
          name: "National Highway 44",
          highwayClass: "trunk",
          source: "openstreetmap",
          isNationalHighway: true,
          isExpressway: false,
          geometry: { type: "LineString", coordinates: [[77.59, 13.05], [77.7, 13.2]] },
        },
      ],
    });

    expect(moduleText).toContain("export const nationalHighwayDataset");
    expect(moduleText).toContain("© OpenStreetMap contributors");
    expect(moduleText).toContain('ref: "NH-44"');
  });
});
```

- [ ] **Step 2: Run Overpass utility tests and confirm failure**

Run:

```bash
npm run test -- src/lib/highways/osm-overpass.test.ts
```

Expected: FAIL because `src/lib/highways/osm-overpass.ts` does not exist.

- [ ] **Step 3: Implement Overpass utility module**

Create `src/lib/highways/osm-overpass.ts`:

```ts
import type { CachedNationalHighwayFeature } from "@/data/highways/india-national-highways";
import { normalizeHighwayRef } from "./national-highways";

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
  relation["type"="route"]["route"="road"]["ref"~"(^|;| )NH[ -]?[0-9]", i](area.india);
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
  const featureText = JSON.stringify(input.features, null, 2)
    .replace(/"([^"\\]+)":/g, "$1:")
    .replace(/"openstreetmap"/g, '"openstreetmap"')
    .replace(/"LineString"/g, '"LineString"')
    .replace(/"MultiLineString"/g, '"MultiLineString"');

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

function normalizeHighwayClass(value: string | undefined): CachedNationalHighwayFeature["highwayClass"] | null {
  if (!value || !supportedHighwayClasses.has(value)) {
    return null;
  }

  return value as CachedNationalHighwayFeature["highwayClass"];
}
```

- [ ] **Step 4: Run Overpass utility tests and confirm pass**

Run:

```bash
npm run test -- src/lib/highways/osm-overpass.test.ts
```

Expected: PASS.

- [ ] **Step 5: Add import script**

Create `scripts/import-national-highways-osm.ts`:

```ts
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import { buildIndiaNationalHighwaysOverpassQuery, formatNationalHighwayDatasetModule, overpassJsonToCachedHighways } from "../src/lib/highways/osm-overpass.ts";

const overpassEndpoint = "https://overpass-api.de/api/interpreter";
const outputPath = join(process.cwd(), "src/data/highways/india-national-highways.ts");

async function main() {
  const query = buildIndiaNationalHighwaysOverpassQuery();
  const response = await fetch(overpassEndpoint, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" },
    body: new URLSearchParams({ data: query }),
  });

  if (!response.ok) {
    throw new Error(`Overpass request failed with status ${response.status}`);
  }

  const body = await response.json();
  const features = overpassJsonToCachedHighways(body);
  if (features.length === 0) {
    throw new Error("Overpass import returned zero National Highway features");
  }

  const moduleText = formatNationalHighwayDatasetModule({ generatedAt: new Date().toISOString(), features });
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, moduleText);

  console.log(JSON.stringify({ ok: true, outputPath, features: features.length }, null, 2));
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
```

- [ ] **Step 6: Add package script**

In `package.json`, add this script next to the existing import scripts:

```json
"import:national-highways-osm": "node --experimental-transform-types scripts/import-national-highways-osm.ts"
```

- [ ] **Step 7: Run import script only when ready for network access**

Run:

```bash
npm run import:national-highways-osm
```

Expected when Overpass is healthy: the script prints JSON with `ok: true` and rewrites `src/data/highways/india-national-highways.ts` with the full cached NH feature set. If Overpass rate-limits or times out, keep the script and fixture in place, then retry later without changing browser runtime behavior.

---

### Task 4: National Highway Overlay API

**Files:**
- Create: `src/app/api/highways/national/route.test.ts`
- Create: `src/app/api/highways/national/route.ts`

- [ ] **Step 1: Write failing API route test**

Create `src/app/api/highways/national/route.test.ts`:

```ts
import { describe, expect, it } from "vitest";

describe("GET /api/highways/national", () => {
  it("serves cached National Highway overlays with attribution and no external fetch", async () => {
    const { GET } = await import("./route");

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.source).toBe("openstreetmap");
    expect(body.attribution).toContain("OpenStreetMap");
    expect(body.highways.length).toBeGreaterThanOrEqual(3);
    expect(body.highways[0]).toMatchObject({
      ref: expect.stringMatching(/^NH-/),
      color: expect.stringMatching(/^#/),
      bounds: expect.objectContaining({ north: expect.any(Number), south: expect.any(Number), east: expect.any(Number), west: expect.any(Number) }),
      geometry: expect.objectContaining({ type: expect.any(String), coordinates: expect.any(Array) }),
    });
  });
});
```

- [ ] **Step 2: Run API test and confirm failure**

Run:

```bash
npm run test -- src/app/api/highways/national/route.test.ts
```

Expected: FAIL because the API route does not exist.

- [ ] **Step 3: Implement cached API route**

Create `src/app/api/highways/national/route.ts`:

```ts
import { NextResponse } from "next/server";

import { getCachedNationalHighwayOverlays, getNationalHighwayAttribution, getNationalHighwayGeneratedAt } from "@/lib/highways/national-highways";

export function GET() {
  return NextResponse.json({
    source: "openstreetmap",
    attribution: getNationalHighwayAttribution(),
    generatedAt: getNationalHighwayGeneratedAt(),
    highways: getCachedNationalHighwayOverlays(),
  });
}
```

- [ ] **Step 4: Run API test and confirm pass**

Run:

```bash
npm run test -- src/app/api/highways/national/route.test.ts
```

Expected: PASS.

---

### Task 5: Map Fetches All Found Stops And Highway Overlays

**Files:**
- Modify: `src/components/map/MapCanvas.test.tsx`
- Modify: `src/components/map/MapCanvas.tsx`

- [ ] **Step 1: Update the Google Maps mock for map hooks and polylines**

In `src/components/map/MapCanvas.test.tsx`, replace the `vi.mock("@vis.gl/react-google-maps", ...)` block with:

```ts
vi.mock("@vis.gl/react-google-maps", () => ({
  APIProvider: ({ children }: { children: ReactNode }) => <div data-testid="api-provider">{children}</div>,
  Map: ({ children, styles }: { children: ReactNode; styles?: unknown }) => (
    <div data-has-styles={Array.isArray(styles) ? "true" : "false"} data-testid="google-map">
      {children}
    </div>
  ),
  Marker: ({ icon, onClick, title }: { icon?: string; onClick?: () => void; title?: string }) => (
    <button data-icon={icon} data-testid="map-marker" onClick={onClick} type="button">
      {title}
    </button>
  ),
  InfoWindow: ({ children }: { children: ReactNode }) => <div data-testid="info-window">{children}</div>,
  useMap: () => ({
    fitBounds: vi.fn(),
  }),
}));
```

- [ ] **Step 2: Write failing map fetch/render test**

Add this test to `src/components/map/MapCanvas.test.tsx`:

```ts
  it("loads all found stops and cached National Highways for the map atlas", async () => {
    process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY = "browser-key";
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request) => {
        const url = String(input);
        if (url.includes("/api/highways/national")) {
          return new Response(
            JSON.stringify({
              source: "openstreetmap",
              attribution: "© OpenStreetMap contributors",
              generatedAt: "2026-05-11T00:00:00.000Z",
              highways: [
                {
                  id: "nh-44-south-sample",
                  ref: "NH-44",
                  name: "National Highway 44",
                  color: "#2563eb",
                  bounds: { north: 15.83, south: 13.05, east: 77.7, west: 77.59 },
                  geometry: { type: "LineString", coordinates: [[77.59, 13.05], [77.7, 13.2], [77.6, 13.65]] },
                },
              ],
            }),
            { status: 200 },
          );
        }

        return new Response(
          JSON.stringify({
            visibility: "all_found",
            places: [
              {
                id: "google-tier-three",
                name: "Village Food Courts",
                category: "food_plaza",
                distanceFromRouteMeters: 180,
                distanceFromHighwayMeters: 180,
                detourMinutes: 1,
                isEndpointStagingArea: false,
                isInsideDenseCity: false,
                source: "google_place",
                confidence: 0.82,
                openNow: false,
                verified: false,
                lat: 13.65,
                lng: 77.6,
                highway: "NH-44",
                locality: "Bengaluru-Hyderabad",
                priceLabel: "Customer access",
                facilities: ["Food plaza"],
                placeId: "tier-three-food-plaza-id",
                cleanlinessLabel: "Food plaza candidate",
                sourceLabel: "Food plaza candidate",
                cleanlinessTier: "tier_3",
                verificationStatus: "matched",
              },
            ],
            storedRowsRead: 1,
            placeDetailsRequests: 1,
            textSearchRequests: 0,
            capped: false,
          }),
          { status: 200 },
        );
      }),
    );

    render(<MapCanvas stops={[]} selectedStopId="" onSelectStop={() => {}} />);

    await waitFor(() => expect(fetch).toHaveBeenCalledWith("/api/google-curated-places?visibility=all_found&limit=500"));
    expect(fetch).toHaveBeenCalledWith("/api/highways/national");
    expect(await screen.findByText("NH-44")).toBeTruthy();
    expect(screen.getByText("© OpenStreetMap contributors")).toBeTruthy();
    expect(screen.getByText(/Tier 3/i)).toBeTruthy();
    expect(screen.getByText("Village Food Courts")).toBeTruthy();
  });
```

- [ ] **Step 3: Run MapCanvas test and confirm failure**

Run:

```bash
npm run test -- src/components/map/MapCanvas.test.tsx
```

Expected: FAIL because `MapCanvas` still requests `limit=24`, does not call `/api/highways/national`, and does not render highway controls.

- [ ] **Step 4: Add highway response types and fetch state**

In `src/components/map/MapCanvas.tsx`, update imports:

```ts
import { APIProvider, InfoWindow, Map, Marker, useMap } from "@vis.gl/react-google-maps";
import { AlertTriangle, ExternalLink, Loader2, MapPinned, Route, ShieldCheck } from "lucide-react";
```

Add types after `CuratedPlacesResponse`:

```ts
type HighwayGeometry = {
  type: "LineString" | "MultiLineString";
  coordinates: number[][] | number[][][];
};

type NationalHighwayOverlay = {
  id: string;
  ref: string;
  name?: string;
  color: string;
  bounds: { north: number; south: number; east: number; west: number };
  geometry: HighwayGeometry;
};

type NationalHighwaysResponse = {
  source?: "openstreetmap";
  attribution?: string;
  generatedAt?: string;
  highways?: NationalHighwayOverlay[];
};
```

Update the limit constant:

```ts
const storedCuratedMapLimit = 500;
```

Add state inside `MapCanvas`:

```ts
  const [nationalHighways, setNationalHighways] = useState<NationalHighwayOverlay[]>([]);
  const [highwayAttribution, setHighwayAttribution] = useState("");
  const [selectedHighwayId, setSelectedHighwayId] = useState<string | null>(null);
```

- [ ] **Step 5: Fetch all-found stops and highway overlay**

Update the curated stops fetch URL:

```ts
    fetch(`/api/google-curated-places?visibility=all_found&limit=${storedCuratedMapLimit}`)
```

Add a second effect after the curated stops effect:

```ts
  useEffect(() => {
    if (!apiKey) {
      return;
    }

    let cancelled = false;

    fetch("/api/highways/national")
      .then((response) => (response.ok ? response.json() : null))
      .then((body: NationalHighwaysResponse | null) => {
        if (cancelled || !body) {
          return;
        }

        setNationalHighways(body.highways ?? []);
        setHighwayAttribution(body.attribution ?? "");
      })
      .catch(() => {
        if (!cancelled) {
          setNationalHighways([]);
          setHighwayAttribution("");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [apiKey]);
```

- [ ] **Step 6: Add stop counting helpers**

Add helpers near the bottom of `MapCanvas.tsx`:

```ts
function normalizeHighwayLabel(value: string): string {
  const trimmed = value.trim().toUpperCase();
  const match = trimmed.match(/^NH\s*-?\s*(\d+[A-Z]?)$/);
  return match ? `NH-${match[1]}` : trimmed.replace(/\s+/g, " ");
}

function countStopsForHighway(stops: HighwayStop[], highwayRef: string): number {
  const normalizedRef = normalizeHighwayLabel(highwayRef);
  return stops.filter((stop) => normalizeHighwayLabel(stop.highway) === normalizedRef).length;
}

function tierLabel(stop: HighwayStop): string {
  if (stop.cleanlinessTier === "tier_1") {
    return "Tier 1";
  }

  if (stop.cleanlinessTier === "tier_2") {
    return "Tier 2";
  }

  if (stop.cleanlinessTier === "tier_3") {
    return "Tier 3";
  }

  return "Stop";
}

function markerIconForStop(stop: HighwayStop): string {
  if (stop.cleanlinessTier === "tier_1" || isPremiumPaidStop(stop)) {
    return premiumMarkerIconUrl;
  }

  if (stop.cleanlinessTier === "tier_3") {
    return "https://maps.google.com/mapfiles/ms/icons/orange-dot.png";
  }

  return standardMarkerIconUrl;
}
```

- [ ] **Step 7: Render highway panel, attribution, and use tier marker icons**

In marker rendering, replace the icon expression with:

```tsx
              icon={markerIconForStop(stop)}
```

Inside `<Map>`, before markers, render the overlay component:

```tsx
          <NationalHighwayPolylines highways={nationalHighways} selectedHighwayId={selectedHighwayId} />
```

After the top-left overlay div, add the right panel:

```tsx
      {nationalHighways.length ? (
        <div className="absolute right-4 top-4 max-h-[min(32rem,calc(100%-2rem))] w-[min(21rem,calc(100%-2rem))] overflow-y-auto rounded-lg border bg-white/94 p-3 text-stone-950 shadow-sm backdrop-blur">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <Route className="size-4 text-emerald-700" aria-hidden="true" />
            National Highways
          </div>
          <div className="mt-3 space-y-2">
            {nationalHighways.slice(0, 12).map((highway) => {
              const stopCount = countStopsForHighway(mapStops, highway.ref);
              return (
                <button
                  key={highway.id}
                  className={`grid w-full grid-cols-[1rem_1fr_auto] items-center gap-2 rounded-md border px-2 py-2 text-left text-xs transition ${selectedHighwayId === highway.id ? "border-emerald-500 bg-emerald-50" : "border-stone-200 bg-white hover:border-emerald-300"}`}
                  onClick={() => setSelectedHighwayId(highway.id)}
                  type="button"
                >
                  <span className="h-1.5 rounded-full" style={{ backgroundColor: highway.color }} />
                  <span>
                    <span className="block font-semibold">{highway.ref}</span>
                    <span className="block text-stone-500">{highway.name ?? "National Highway"}</span>
                  </span>
                  <span className="rounded-full bg-emerald-100 px-2 py-1 font-semibold text-emerald-800">{stopCount}</span>
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
```

Update the legend chips:

```tsx
          <span className="rounded-full bg-yellow-100 px-2 py-1 text-yellow-900">Tier 1</span>
          <span className="rounded-full bg-emerald-100 px-2 py-1 text-emerald-800">Tier 2</span>
          <span className="rounded-full bg-orange-100 px-2 py-1 text-orange-800">Tier 3</span>
```

Render attribution near the bottom overlay:

```tsx
        {highwayAttribution ? <p className="mt-1 text-[11px] text-stone-500">{highwayAttribution}</p> : null}
```

- [ ] **Step 8: Add polyline overlay component**

Add this component above `PlaceInfoWindow`:

```tsx
function NationalHighwayPolylines({ highways, selectedHighwayId }: { highways: NationalHighwayOverlay[]; selectedHighwayId: string | null }) {
  const map = useMap();

  useEffect(() => {
    if (!map || !globalThis.google?.maps) {
      return;
    }

    const polylines = highways.map((highway) => {
      const polyline = new google.maps.Polyline({
        clickable: false,
        geodesic: true,
        map,
        path: toGooglePath(highway.geometry),
        strokeColor: highway.color,
        strokeOpacity: selectedHighwayId && selectedHighwayId !== highway.id ? 0.28 : 0.86,
        strokeWeight: selectedHighwayId === highway.id ? 6 : 4,
      });

      return polyline;
    });

    const selectedHighway = highways.find((highway) => highway.id === selectedHighwayId);
    if (selectedHighway) {
      map.fitBounds(selectedHighway.bounds);
    }

    return () => {
      polylines.forEach((polyline) => polyline.setMap(null));
    };
  }, [highways, map, selectedHighwayId]);

  return null;
}

function toGooglePath(geometry: HighwayGeometry): google.maps.LatLngLiteral[] {
  const coordinates = geometry.type === "LineString" ? (geometry.coordinates as number[][]) : (geometry.coordinates as number[][][]).flat();
  return coordinates.map(([lng, lat]) => ({ lat, lng }));
}
```

- [ ] **Step 9: Run MapCanvas test and confirm pass**

Run:

```bash
npm run test -- src/components/map/MapCanvas.test.tsx
```

Expected: PASS.

---

### Task 6: OSM/Overpass Cache Documentation And Expansion Workflow

**Files:**
- Create: `docs/data-sourcing/national-highway-osm-import.md`

- [ ] **Step 1: Create the data sourcing document**

Create `docs/data-sourcing/national-highway-osm-import.md`:

```md
# National Highway OSM Import

Swachh renders National Highways as a cached app-owned overlay on top of Google Maps. The browser does not call Overpass.

## Runtime Rule

- Google Maps is the basemap.
- Swachh loads `/api/highways/national` for cached highway geometry.
- Normal users do not call Overpass.
- OSM attribution must remain visible anywhere the highway layer appears.

## Import Source

Use OpenStreetMap/Overpass as an import-time source for Indian National Highway geometry. Overpass is free but shared and rate-limited, so import jobs must be manual, cached, and infrequent.

Candidate Overpass query shape:

```overpass
[out:json][timeout:180];
area["ISO3166-1"="IN"][admin_level=2]->.india;
(
  way["highway"]["ref"~"(^|;| )NH[ -]?[0-9]", i](area.india);
  relation["type"="route"]["route"="road"]["ref"~"(^|;| )NH[ -]?[0-9]", i](area.india);
);
out geom;
```

## Refresh Process

1. Run the Overpass import manually from a local script or notebook.
2. Normalize refs such as `NH 44`, `NH-44`, and `nh 44` to `NH-44`.
3. Simplify geometry for web rendering.
4. Write the cached artifact to `src/data/highways/india-national-highways.ts` or a generated GeoJSON file.
5. Run `npm run test -- src/lib/highways/national-highways.test.ts src/app/api/highways/national/route.test.ts`.
6. Run `npm run build` before deploying.

## Discovery Expansion

After the cached NH layer exists, use it to expand Tier 1-3 discovery across remaining National Highways:

1. Group existing Supabase rows by normalized `highway_name` and `route_context`.
2. Compare those groups to the imported NH refs/geometries.
3. Generate bounded search anchors from uncovered NH geometry.
4. Dry-run job counts before any Google Text Search batch.
5. Run imports with explicit caps, for example `npm run import:google-curated-places -- --tier=tier_1 --max-text-search-requests=250`.
6. Persist accepted/matched rows to Supabase.
7. Persist rejected rows to the review ledger.
8. Regenerate `docs/data-sourcing/rejected-google-curated-places-review-2026-05-11.csv` after each expansion batch.

## Cost Rules

- Public map: `0` Google Text Search requests.
- Review export: `0` Google Text Search requests.
- Discovery imports: capped Google Text Search only.
- Place Details calls are expected for rendering stored Google place IDs and review exports.
```

- [ ] **Step 2: Scan the document for incomplete markers**

Run:

```bash
rg 'TB''D|TO''DO|\?\?' docs/data-sourcing/national-highway-osm-import.md
```

Expected: no matches.

---

### Task 7: Verification

**Files:**
- No new files.

- [ ] **Step 1: Run focused tests**

Run:

```bash
npm run test -- src/app/api/google-curated-places/route.test.ts src/lib/highways/national-highways.test.ts src/app/api/highways/national/route.test.ts src/components/map/MapCanvas.test.tsx
```

Expected: PASS.

- [ ] **Step 2: Run full automated verification**

Run:

```bash
npm run test
npm run lint
npm run typecheck
npm run build
```

Expected: all pass.

- [ ] **Step 3: Start the app for browser verification**

Run:

```bash
npm run dev -- --port 3000
```

Expected: Next.js starts at `http://localhost:3000`.

- [ ] **Step 4: Verify the map visually**

Open `http://localhost:3000` and confirm:

- The map loads with Google Maps configured.
- Tier 1, Tier 2, and Tier 3 non-rejected stops render.
- The `National Highways` panel appears on the right on desktop.
- NH rows show color swatches and stop counts.
- Clicking a highway row highlights that highway and calls `fitBounds` in browser behavior.
- OSM attribution is visible.
- Rejected rows do not appear as map markers.

- [ ] **Step 5: Stop the dev server**

Stop the terminal process after browser verification.

Expected: no long-running dev server remains unless the user asks to keep it running.

## Post-Review Adjustments

- `visibility=all_found` uses a separate higher map cap and explicitly excludes Tier 4 rows from the map feed.
- The map requests `limit=1000` for all-found rows so the current found Tier 1/2/3 inventory is not constrained by the public map limit.
- National Highway overlay utilities group multiple OSM way segments by normalized NH ref before serving the panel/API.
- MultiLineString geometries render as separate Google Maps polylines so disconnected highway segments are not joined by artificial connector lines.
- The current Overpass importer supports way geometry only; route-relation queries are deferred until relation assembly has tests.
- `npm run import:national-highways-osm -- --dry-run` verifies the plain Node import path without calling Overpass.
