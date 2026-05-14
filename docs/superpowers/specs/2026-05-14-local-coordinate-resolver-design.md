# Open-Source Coordinate Resolver Design

Date: 2026-05-14

## Context

Swachh has a large Google-curated highway stop dataset in Supabase, but the resolver must not call Google APIs or copy Google Place Details content. The local coordinate pipeline should use OpenStreetMap, Overture, manual review, or crowdsourced submissions as the source of permanent map coordinates.

## Goals

- Run resolver batches with zero Google Text Search calls and zero Google Place Details calls.
- Store permanent coordinates from OSM, Overture, OSM+Overture agreement, manual review, or crowdsourced submissions.
- Store opening hours only when an open source, manual, or crowdsourced source already provides them.
- Treat missing opening hours as acceptable; do not fetch Google hours to fill gaps.
- Keep uncertain single-source or disagreeing coordinates in review instead of map-ready public output.
- Keep raw OSM PBF and raw Overture GeoParquet files outside Supabase.

## Non-Goals

- Do not fetch Google coordinates for validation.
- Do not compare OSM hours against Google hours.
- Do not persist Google Place Details fields or derived Google validation fields in `place_location_resolutions`.
- Do not switch the visible map renderer to MapLibre in this resolver slice.

## Resolver Flow

1. Load curated highway stop rows from Supabase or a compact JSON export.
2. Load compact OSM and Overture candidates produced from local source extracts.
3. Match candidates to curated rows by source-preprocessing context and name similarity.
4. If OSM and Overture agree within 200 meters, mark the coordinate `auto_approved`.
5. If only one source exists, store the coordinate as `needs_review`.
6. If OSM and Overture disagree beyond 200 meters, store the better evidence as `needs_review` with a disagreement reason.
7. Store OSM or Overture opening hours as-is when present; otherwise store no hours claim.
8. Serve public map points only from `auto_approved` rows.

## Supabase Data

`place_location_resolutions` stores:

- `google_curated_place_id` as a link to the existing curated row.
- `latitude`, `longitude` from the open/manual/crowd source.
- `coordinate_source`: `osm`, `overture`, `osm_overture`, `manual`, or `crowdsourced`.
- `coordinate_source_id`, `coordinate_source_label`, `coordinate_confidence`.
- `open_source_agreement_meters` when both OSM and Overture exist.
- `resolution_status`, `rejection_reason`, review timestamps.
- `opening_hours`, `opening_hours_source`, and `opening_hours_source_id` when available from open/manual/crowd sources.

The table intentionally does not store `google_place_id`, Google latitude/longitude, Google opening hours, Google reference distance, or Google-hours validation status.

## Cost Model

Resolver batches cost `$0` in Google API usage because they make zero Google API calls. Source acquisition uses OSM/Overture downloads and local preprocessing only.

## Approval State

Approved direction: no Google API use in the coordinate resolver. Use OSM/Overture coordinates and open-source hours if already present. Missing hours are acceptable.
