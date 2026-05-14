# Local Coordinate Resolver Design

Date: 2026-05-14

## Context

Swachh has a large Google-curated highway stop dataset in Supabase, but those rows intentionally store only permitted Google identifiers and app-owned annotations. They do not store Google latitude, longitude, or opening hours. The current map safety direction is to avoid runtime Google Place Details fan-out and move toward local, open-source, map-ready place data.

The next step is a resolver pipeline that converts existing Google-curated Tier 1, Tier 2, and Tier 3 rows into locally stored map coordinates using open sources. Google coordinates may be used only as a temporary admin/import validation reference. The permanent map pin must come from OpenStreetMap, Overture, manual verification, or crowdsourced submissions.

The user approved a practical tolerance model: matches within 150-200 meters are acceptable for highway facilities, 200-300 meters is weak, and anything beyond 300 meters should be kept for review rather than auto-approved. Rows beyond 300 meters are not map-ready, but they remain visible in a resolver review ledger so they can be inspected later.

## Goals

- Resolve latitude and longitude for accepted Tier 1, Tier 2, and Tier 3 highway stop candidates without permanently storing Google-derived coordinates.
- Use Google Place Details coordinates only as a temporary, capped, admin-side validation reference when explicitly approved for a resolver batch.
- Prefer permanent coordinates from OSM and Overture when their candidate point aligns with the temporary Google reference and the highway context.
- Store opening and closing hours from OSM or other open/manual/crowdsourced sources when available.
- In Google-assisted validation mode, optionally compare OSM opening hours against Google hours as a temporary validation signal without permanently storing copied Google hours.
- Keep the Supabase footprint comfortably below the free 1 GB limit by storing only compact resolved rows, not raw OSM or Overture extracts.
- Make the resolver review burden manageable by keeping weak and poor coordinate matches out of the map-ready dataset while preserving them in a resolver review ledger.
- Preserve review ledgers for final Tier 1, Tier 2, and Tier 3 cleanup, while keeping this resolver focused on coordinates and open-source hours.

## Non-Goals

- Do not permanently store Google latitude, longitude, opening hours, ratings, formatted addresses, phone numbers, or other copied Place Details content.
- Do not use Google coordinates as the final displayed source on a non-Google map.
- Do not store the full India OSM extract, full Overture dataset, or large source blobs in Supabase.
- Do not show uncertain resolver candidates on the public map. Matches beyond 300 meters should be retained for review, not displayed as map-ready.
- Do not treat Overture as an opening-hours source unless a future Overture schema release exposes suitable hours data. Current Overture Places is primarily useful for point geometry, names, categories, confidence, operating status, websites, phones, brands, and addresses.
- Do not run uncapped Google validation batches.

## Source Roles

### Google Place Details

Google Place Details is an optional temporary validation input. For a selected batch of existing rows, the resolver can fetch the Google coordinate for the stored `google_place_id`, compare it to OSM and Overture candidates, and then discard the Google coordinate after the batch completes. In the same capped validation flow, the resolver can compare OSM `opening_hours` against Google opening-hours fields to flag likely agreement or disagreement, then discard the Google hours.

The resolver must not persist the raw Google coordinate or raw Google hours. Batch logs may keep aggregate counts and non-Google-content status summaries, such as `validated`, `distance_over_300m_review`, `google_hours_agreed_with_osm`, `google_hours_disagreed_with_osm`, or `no_open_source_match`.

Because Google Maps Platform terms restrict caching and use of Google Maps Content, the Google-assisted validation mode should stay admin-only, explicit, capped, and easy to disable. If legal review later rejects this use, the resolver can still run in open-source-only mode using OSM and Overture agreement plus highway proximity.

### OpenStreetMap

OSM is the primary open source for highway POIs and opening hours. The resolver reads a local India `.osm.pbf` extract, filters relevant POI tags, and extracts compact candidate rows.

Useful OSM data includes:

- Point or area centroid coordinates.
- OSM id and element type.
- `name`, `brand`, `operator`.
- `amenity`, `shop`, `tourism`, `highway`, and related tags.
- `opening_hours` and related fields such as `check_date:opening_hours`, `opening_hours:url`, and `source:opening_hours`.
- Fuel station, restaurant, cafe, food court, toilet, rest area, service area, and parking/service-road context.

The raw India extract is a temporary processing input. It can be downloaded, processed, and deleted after the compact resolver output has been produced.

### Overture Places

Overture is the primary broad POI coordinate and category cross-check source. The resolver reads only the India area and only relevant categories where possible. It uses point geometry, names, categories, confidence, operating status, sources, brand fields, address hints, websites, and phones to compare against the Google-curated row and OSM candidates.

Overture is not currently treated as the source of regular opening/closing hours.

### Manual And Crowdsourced Data

Manual admin review and crowdsourced submissions can provide coordinates and hours when OSM and Overture do not resolve a row confidently. These records are app-owned or user-provided data and may become permanent after moderation.

## Resolver Flow

The first implementation should resolve already accepted or candidate Tier 1, Tier 2, and Tier 3 Google-curated rows. It should not start with rejected rows.

1. Load a bounded batch of Supabase rows with `google_place_id`, `seed_name`, `source_category`, `cleanliness_tier`, `highway_name`, `route_context`, and locality hints.
2. In Google-assisted mode, fetch Google Place Details coordinates for those rows with a strict maximum request cap.
3. Query local OSM candidates around the Google reference point and the expected highway corridor.
4. Query local Overture candidates around the Google reference point and the expected highway corridor.
5. Score each OSM and Overture candidate by distance to the temporary Google reference, name similarity, category compatibility, highway context, operating status, and source confidence.
6. Pick the best permanent coordinate source:
   - Prefer an OSM and Overture agreement when both point to the same real-world place.
   - Prefer OSM when it has `opening_hours` and category/name/context are strong.
   - Prefer Overture when OSM is missing but Overture strongly matches the Google-curated row and the highway context.
7. Store only the permanent open/manual/crowd coordinate and provenance fields.
8. Store OSM/open/manual/crowd hours only when the source is allowed and explicit.
9. In Google-assisted mode, compare OSM hours with temporary Google hours and store only source-safe validation status, not the copied Google hours.
10. Write rejected, unresolved, and over-300-meter outcomes to a compact resolver ledger for review and audit.
11. Delete raw downloaded OSM/Overture working files after the extraction run if they are no longer needed.

## Match Thresholds

Highway stops often have multiple plausible points: entry driveway, forecourt, food court, restroom block, fuel pump, or toll/service plaza centroid. The distance rules should allow realistic facility size without allowing unrelated places.

Distance from temporary Google reference to OSM/Overture candidate:

- `0-75m`: excellent. Eligible for auto-approval when name/category/context also match.
- `75-150m`: strong. Eligible for auto-approval when name/category/context are strong.
- `150-200m`: acceptable. Eligible for auto-approval only if the highway context is strong or OSM and Overture agree with each other.
- `200-300m`: weak. Do not auto-approve. Keep in the resolver review ledger with evidence fields.
- `>300m`: not map-ready. Keep in the resolver review ledger with a `distance_over_300m` reason so it can be inspected later.

If OSM and Overture both exist, add an agreement check:

- `0-100m` between OSM and Overture: strong open-source agreement.
- `100-200m`: acceptable agreement for large highway campuses when both are near the Google reference.
- `>200m`: require the better single source to win by name/category/context, otherwise reject.

## Scoring Inputs

The resolver should score candidates with transparent components rather than a black-box model.

Suggested score inputs:

- Distance to temporary Google reference.
- Distance between OSM and Overture candidates when both exist.
- Name similarity against `seed_name` and any known display name.
- Brand/operator similarity.
- Category compatibility with Tier 1, Tier 2, or Tier 3 source category.
- Proximity to the expected National Highway or expressway corridor.
- Locality or route-context match.
- OSM `opening_hours` presence and validity.
- Overture confidence and `operating_status`.

The resolver output should include component scores so bad matches are easy to diagnose.

## Supabase Data Design

Add a compact local coordinate table instead of expanding `google_curated_places` with copied Google details.

Suggested table: `place_location_resolutions`

Fields:

- `id`
- `google_curated_place_id`
- `google_place_id`
- `latitude`
- `longitude`
- `coordinate_source`: `osm`, `overture`, `osm_overture`, `manual`, or `crowdsourced`
- `coordinate_source_id`: OSM id, Overture id, or local submission id
- `coordinate_source_label`
- `coordinate_confidence`: numeric score
- `distance_to_google_reference_meters`: numeric, nullable, used only as validation metadata
- `open_source_agreement_meters`: numeric, nullable
- `resolution_status`: `auto_approved`, `needs_review`, `rejected`, or `superseded`
- `rejection_reason`
- `opening_hours`
- `opening_hours_source`: `osm`, `manual`, `crowdsourced`, or `official_open_source`
- `opening_hours_source_id`
- `opening_hours_checked_at`
- `opening_hours_google_validation_status`: nullable status such as `not_checked`, `agrees`, `differs`, `google_missing`, `osm_missing`, or `inconclusive`
- `resolved_at`
- `reviewed_at`
- `created_at`
- `updated_at`

The field `distance_to_google_reference_meters` stores only the distance measurement, not the Google coordinate. The field `opening_hours_google_validation_status` stores only a comparison outcome, not Google's hours. If legal review says even derived validation metadata should be avoided, these fields can be omitted or kept only in local non-production batch reports.

## Storage Budget

The raw OSM India extract is expected to be around gigabyte scale and should stay outside Supabase. It is a temporary local or worker-side file.

Supabase stores only compact rows. Even 100,000 resolved places with lean fields should be far below 1 GB if large JSON payloads are avoided. Raw source files, full OSM tags, and full Overture records should not be inserted into Supabase.

Working file lifecycle:

1. Download OSM/Overture source inputs to local disk or worker scratch storage.
2. Extract only relevant candidates near highway corridors and known Google-curated references.
3. Produce compact CSV/JSON resolver outputs and Supabase inserts.
4. Keep only final ledgers and compact extracts needed for audit.
5. Delete the raw `.osm.pbf`, raw GeoParquet, and temporary indexes after the run.

## Review And Rejection Policy

The resolver should reduce review load, not create another huge queue.

- Auto-approve strong matches under the threshold.
- Keep weak `200-300m` matches for review with evidence fields.
- Keep `>300m` matches for review with a clear `distance_over_300m` reason, but do not display them on the public map.
- Keep rejected resolver rows in a compact ledger with reason codes.
- Continue handling existing rejected Google-curated rows in the separate review ledger process.

The final Tier 1, Tier 2, and Tier 3 cleanup still needs a dedicated review pass. That pass should happen after the local resolver can show which accepted/candidate rows have trustworthy map coordinates and which rows remain unresolved.

## Review Ledger Milestone

The existing Google-curated review ledger should not block the first resolver pass. The recommended order is:

1. Resolve coordinates and open-source hours for already accepted/candidate Tier 1, Tier 2, and Tier 3 rows.
2. Produce a resolver summary showing map-ready rows, unresolved rows, over-300-meter review rows, and hard rejects for non-distance reasons.
3. Use that summary to decide which existing review-ledger rows are worth promoting, because promoted rows will need the same local coordinate resolver before they become map-ready.
4. Run a separate ledger cleanup pass for rejected or ambiguous Google-curated rows after the map-ready core is stable.

This avoids mixing two different review problems: coordinate confidence for already useful rows, and content-quality cleanup for previously rejected rows.

## API And Map Display

The public map should read from local resolved coordinates, not live Google Place Details.

Suggested behavior:

- `GET /api/google-curated-places?details=stored` continues to avoid Google fan-out.
- Add or extend a local endpoint that returns resolved map points from `place_location_resolutions`.
- MapLibre should render only rows with `resolution_status = auto_approved` or manually approved review status.
- Rows without local resolved coordinates can remain in lists or ledgers but should not display exact pins.

Opening hours display should show source-aware text:

- OSM hours: display with OSM attribution and checked date if present.
- Manual/crowd hours: display as community/admin verified.
- Unknown hours: show no hours claim.

Google hours validation should be used only as admin-side confidence metadata. The public map should never display stored Google hours unless the app intentionally fetches and displays live Google content under the applicable Google attribution and usage rules.

## Testing Strategy

- Unit-test distance thresholds, including 150m, 200m, 300m, and above-300m behavior.
- Unit-test scoring with OSM-only, OSM-plus-Overture, Overture-only, no-match, and mismatch cases.
- Unit-test that Google reference latitude and longitude are never persisted in Supabase migrations or resolver outputs.
- Unit-test OSM `opening_hours` extraction and validation for common values such as `24/7` and `Mo-Su 08:00-22:00`.
- Unit-test Google-hours comparison as a mocked, non-persistent validation status, ensuring raw Google hours are not written to outputs.
- Integration-test a dry-run resolver batch against fixture data without Google network calls.
- Add a capped Google-assisted dry-run test mode that mocks Place Details responses.
- Verify storage output is compact and does not include raw OSM or Overture payloads.

## Risks And Mitigations

- Google-assisted validation may be legally sensitive if used to create or validate content displayed on a non-Google map. Mitigate by keeping it optional, admin-only, temporary, capped, non-persistent, and subject to legal review. Keep open-source-only matching as a fallback.
- Google validation can cost money. Mitigate with explicit batch caps, dry-run summaries, request ledgers, and no automatic retries after rate limits.
- OSM and Overture can disagree. Mitigate with distance bands, name/category scoring, highway proximity, and review status above 300 meters.
- OSM opening hours can be syntactically complex. Mitigate with an opening-hours parser/validator and source-aware display.
- Highway campus points can be spread out. Mitigate by allowing 150-200 meters for strong matches while keeping above-300-meter rows out of the public map and in review.
- Supabase free storage is limited. Mitigate by storing only compact resolved rows and deleting raw source files after extraction.

## Approval State

Approved direction: build a local coordinate resolver that uses OSM and Overture as permanent coordinate sources, stores OSM/open/manual/crowd opening hours when available, optionally uses Google Place Details coordinates and Google hours as temporary validation references in capped admin/import batches, accepts strong matches up to roughly 150-200 meters, keeps matches beyond 300 meters for review rather than map display, and keeps raw OSM/Overture files out of Supabase so the final storage footprint remains small.