# Open-Source Coordinate Resolver Implementation Plan

Date: 2026-05-14

## Implemented Direction

Build the resolver as an open-source-only coordinate pipeline. It must make zero Google Text Search calls and zero Google Place Details calls.

## Completed Tasks

- Add `place_location_resolutions` migration with only open/manual/crowd coordinate fields.
- Add geo distance helpers for OSM/Overture agreement checks.
- Add opening-hours normalization for source-provided hours only.
- Add resolver core that:
  - auto-approves OSM+Overture agreement within 200 meters,
  - keeps single-source OSM or Overture rows for review,
  - keeps OSM/Overture disagreements over 200 meters for review,
  - stores OSM or Overture opening hours only when already present.
- Add compact OSM and Overture JSON loaders.
- Add batch resolver orchestration with `googleDetailsRequests: 0`.
- Add `resolve:place-locations` CLI with `--plan-only`, `--dry-run`, compact source paths, and optional Supabase write.
- Add local map endpoint for `auto_approved` resolved coordinates.
- Add source extraction docs for raw OSM/Overture preprocessing.

## Verification Commands

```bash
npm test -- src/lib/resolver src/lib/supabase/place-location-resolutions-migration.test.ts src/app/api/place-location-resolutions/route.test.ts
npm test -- --testTimeout=10000
npm run typecheck
npm run lint
```

## Policy Checks

The resolver should not include or require:

- `GOOGLE_MAPS_SERVER_API_KEY`
- `--max-google-details-requests`
- `distance_to_google_reference_meters`
- `opening_hours_google_validation_status`
- duplicated `google_place_id` in `place_location_resolutions`

Google identifiers may still exist in the already-existing `google_curated_places` table because that is the source inventory, but the resolver itself must not call Google APIs.
