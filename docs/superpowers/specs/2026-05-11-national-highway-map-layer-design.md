# National Highway Map Layer Design

Date: 2026-05-11

## Context

Swachh should feel like a highway-first India road-trip restroom planner. The user should open the website and immediately see highway coverage, rest-stop coverage, and a way to inspect a specific National Highway corridor.

The current curated Google place data is stored in Supabase. It includes accepted/matched Tier 1, Tier 2, and Tier 3 rows plus rejected rows retained in a manual review ledger. Rejected rows are not map-ready. Accepted and matched rows already include `distance_from_highway_meters`, `highway_name`, `route_context`, `cleanliness_tier`, and source annotations.

The current seeded corridor data is useful for discovery but is not a complete National Highway geometry layer. To draw and color highways ourselves, Swachh should use an OpenStreetMap/Overpass-derived National Highway dataset cached by the app and rendered on top of Google Maps.

## Goals

- Show every non-rejected Swachh stop we have already found: Tier 1, Tier 2, and Tier 3.
- Keep rejected Google matches out of the map and in the review ledger for later manual promotion.
- Add a real National Highway overlay layer from OpenStreetMap/Overpass, rendered on top of Google Maps.
- Prioritize formal National Highways. Expressways can remain supported as a secondary corridor group, but the main map and expansion workflow should be National Highway-first.
- Give each highway or highway group a consistent color.
- Add a right-side highway panel listing highways with mapped stop counts.
- Let the user click a highway in the panel to zoom the map to that highway and emphasize the stops associated with it.
- Keep the first screen map-first, not a marketing or city toilet finder experience.
- Use the imported National Highway layer to identify coverage gaps and run future Tier 1-3 discovery on remaining NH corridors in capped batches.

## Non-Goals

- Do not call Overpass live from each browser session.
- Do not call Overpass repeatedly after a successful import unless we intentionally refresh the cached highway dataset.
- Do not treat rejected rows as visible map stops.
- Do not present Tier 3 as equally verified with Tier 1 and Tier 2.
- Do not claim complete restroom coverage on every National Highway until the imported NH dataset and mapped stop counts make gaps visible.
- Do not run uncapped Google Text Search sweeps across the full NH network.

## User Experience

The home page opens to a Google Map centered on India with a Swachh National Highway overlay. Colored highway lines sit above the Google basemap. Rest-stop markers sit above the highway lines.

The right panel is titled `National Highways`. Expressways, if shown, appear in a secondary group below formal NH rows rather than being mixed into the primary list. Each row shows:

- Highway label, such as `NH-44`, `NH-48`, `NH-19`, or an expressway name.
- A color swatch matching the map line.
- Count of mapped Swachh stops on that highway.
- Optional route/corridor text when available.

Clicking a highway row fits the map bounds to that highway geometry and emphasizes the matching stops. Non-matching stops remain visible but subdued, unless the viewport would become too noisy on mobile.

Markers use distinct visual treatments:

- Tier 1: strongest trusted marker for premium or official wayside restroom sources.
- Tier 2: trusted branded fuel/rest-stop proxy marker.
- Tier 3: candidate food-plaza or organized restaurant marker, visually distinct and labeled as a candidate stop.

The map should include a small legend for tier meanings and highway colors. It should not use visible instructional copy that overwhelms the map.

## Data Design

### Highway Geometry

Add a cached National Highway GeoJSON dataset generated from OpenStreetMap/Overpass data. The app should store a simplified, app-ready file rather than fetch Overpass live in the browser. After this file is generated and committed or deployed, normal users do not hit Overpass. We only call Overpass again when we intentionally refresh the NH dataset.

Suggested generated artifact:

- `src/data/highways/india-national-highways.geojson`

Each feature should include:

- `id`: stable local id.
- `ref`: highway reference, for example `NH 44` or `NH-44` normalized to display as `NH-44`.
- `name`: OSM road name when available.
- `highwayClass`: OSM road class such as motorway, trunk, primary, or secondary.
- `source`: `openstreetmap`.
- `geometry`: LineString or MultiLineString.
- `isNationalHighway`: true for formal National Highways.
- `isExpressway`: true only for expressway features kept as secondary context.

Add OSM attribution wherever this layer is used.

### Discovery Expansion

Once the National Highway GeoJSON is imported, use it as the source of truth for future discovery coverage. The expansion workflow should:

- Compare imported NH refs and geometries against existing Supabase rows grouped by `highway_name` and `route_context`.
- Identify NH corridors with no Tier 1-3 mapped stops or thin coverage.
- Generate bounded Google Text Search jobs from NH geometry anchors, not from arbitrary cities.
- Run Tier 1, Tier 2, and Tier 3 seeds against the remaining National Highway corridors in staged batches.
- Persist accepted/matched rows to Supabase and persist rejected rows to the review ledger.
- Use explicit `--max-text-search-requests` caps for every batch so Google spend stays controlled.

This makes the current mapped data the first layer, not the final coverage claim.

### Stop Visibility

The curated places endpoint should support a map mode that returns all non-rejected found rows:

- Include: `likely_clean`, `matched`, `verified_clean`, `approved`.
- Exclude: `rejected`.

This mode is separate from any stricter public-only mode. The UI should make Tier 3 visually clear as candidate data.

### Highway-To-Stop Association

Use stored row metadata first:

- `highway_name` maps directly to an NH or expressway display group when possible.
- `route_context` provides secondary grouping and panel detail.
- `distance_from_highway_meters` supports future proximity filters.

When an OSM highway geometry exists for the normalized highway label, the right panel count groups stops under that highway. If a stop's `highway_name` is not present in the OSM dataset yet, show it under `Other covered corridors` rather than dropping it.

## API Design

Add a highway overlay API route:

- `GET /api/highways/national`

Response shape:

```ts
type NationalHighwaysResponse = {
  source: "openstreetmap";
  attribution: string;
  generatedAt: string;
  highways: Array<{
    id: string;
    ref: string;
    name?: string;
    color: string;
    bounds: { north: number; south: number; east: number; west: number };
    geometry: GeoJSON.LineString | GeoJSON.MultiLineString;
  }>;
};
```

Update the curated places API with an explicit visibility parameter:

- `GET /api/google-curated-places?visibility=all_found&limit=...`

The existing stricter behavior remains available for public-only map modes.

## Implementation Plan Shape

1. Add tests for `visibility=all_found` so Tier 1, Tier 2, and Tier 3 matched rows are returned while rejected rows are excluded.
2. Add a cached highway GeoJSON fixture or generated artifact for the first implementation pass.
3. Add `GET /api/highways/national` and tests for response shape, color assignment, bounds, and attribution.
4. Update `MapCanvas` to fetch all found curated stops and the NH overlay.
5. Render National Highway polylines above Google Maps.
6. Add a right-side highway panel with color swatches and stop counts.
7. Add click-to-zoom behavior for a selected highway.
8. Update marker styling and legends for Tier 1, Tier 2, and Tier 3.
9. Add or document the follow-on NH coverage expansion workflow that uses the imported NH layer to stage capped Tier 1-3 imports for remaining National Highways.
10. Verify with tests, lint, typecheck, build, and a Playwright/browser check of the map UI.

## Risks And Mitigations

- OSM/Overpass data may be large. Mitigate by caching a simplified GeoJSON file and keeping the first import scoped to National Highways and expressways.
- Overpass is free to query but shared and rate-limited. Mitigate by using it as an import-time data source only, caching results, and avoiding browser/runtime Overpass calls.
- Google Text Search costs can grow quickly when expanding across the full NH network. Mitigate with staged batches, dry runs, per-batch request caps, and summary logs before each import.
- OSM highway refs can be inconsistent. Mitigate with normalization for `NH 44`, `NH-44`, and related forms.
- Tier 3 can reduce trust if it appears verified. Mitigate through distinct marker styling and candidate labels.
- Google Maps and OSM geometries may not align perfectly. Mitigate by using the overlay for visual corridor context, not turn-by-turn routing precision.
- OSM attribution is required. Mitigate by including attribution in the API response and map UI.

## Approval State

Approved direction: use Google Maps as the basemap, draw cached OpenStreetMap/Overpass-derived National Highways on top, show all non-rejected Tier 1/2/3 Swachh stops, keep rejected rows in the ledger, and let users click highways in the right panel to zoom and inspect stop coverage. After the NH layer exists, use it to run future capped Tier 1-3 discovery across remaining National Highways, with rejected results continuing into the review ledger.