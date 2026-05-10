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
);
out geom;
```

The current importer intentionally uses OSM `way` geometry with National Highway refs. Route-relation support should be added with dedicated relation assembly tests before adding relation queries back to the import.

## Refresh Process

1. Run `npm run import:national-highways-osm -- --dry-run` to verify the Node import path and inspect the query without calling Overpass.
2. Run the Overpass import manually from the local script when ready to refresh the cached artifact.
3. Normalize refs such as `NH 44`, `NH-44`, and `nh 44` to `NH-44`.
4. Group imported way segments by normalized NH ref before serving them to the UI.
5. Simplify geometry for web rendering before replacing the cached file when the full import grows large.
6. Write the cached artifact to `src/data/highways/india-national-highways.ts` or a generated GeoJSON file.
7. Run `npm run test -- src/lib/highways/national-highways.test.ts src/app/api/highways/national/route.test.ts`.
8. Run `npm run build` before deploying.

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
- The curated map feed sets an HTTP cache header and keeps a short server-side Place Details cache to reduce repeat fan-out from normal map reloads.
