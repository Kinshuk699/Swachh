# Local Coordinate Resolver Source Extracts

Date: 2026-05-14

The resolver does not store raw OSM or Overture files in Supabase. Raw source files are temporary local inputs used to produce compact JSON candidates.

## OSM India Extract

1. Download the India `.osm.pbf` extract from Geofabrik to local scratch storage.
2. Filter only highway-relevant POIs such as toilets, fuel stations, restaurants, cafes, food courts, rest areas, service areas, parking, and service-road amenities.
3. Export compact rows shaped like:

```json
[
  {
    "id": "node/123",
    "name": "Example Food Plaza",
    "lat": 12.34,
    "lon": 78.9,
    "tags": { "amenity": "restaurant", "opening_hours": "Mo-Su 08:00-22:00" }
  }
]
```

4. Run `npm run resolve:place-locations -- --plan-only ...` first.
5. Run dry-run resolver batches before writing to Supabase. These batches make zero Google API calls.
6. Delete the raw `.osm.pbf` after compact candidates and resolver ledgers are produced.

## Overture Places

Download only India or highway-relevant bounding boxes when possible. Export compact rows shaped like:

```json
[
  {
    "id": "overture-id",
    "names": { "primary": "Example Food Plaza" },
    "geometry": { "type": "Point", "coordinates": [78.9, 12.34] },
    "categories": { "primary": "restaurant" },
    "confidence": 0.91,
    "operating_status": "open"
  }
]
```

## Storage Rule

Supabase stores only `place_location_resolutions` rows. It never stores raw OSM extracts, raw Overture GeoParquet rows, Google coordinates, or Google opening-hour text.