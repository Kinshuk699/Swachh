# Google Curated Places Map Ledger - 2026-05-13

Generated from hosted Supabase project https://fkqmanrjwpkfjmsbizot.supabase.co for places currently eligible to appear on the map.

Google usage for this export: 0 Text Search requests, 1132 Place Details requests, 1 Place Details failures.

## What This Ledger Is

This is the map inventory: rows that passed the same all_found Tier 1-3, highway-distance, Google Place Details, and display-filter checks used by the map, plus the local sample stops bundled into the app.

## Counts

- stored rows scanned before display filtering: 1201
- accepted all_found Tier 1-3 rows: 1132
- Google curated rows shown on map: 921
- local/sample rows shown on map: 5
- total ledger rows: 926
- accepted rows excluded from map after display filtering or Details failure: 211

## Counts By Map Source

- google_curated_hydrated: 921
- local_sample_stop: 5

## Counts By Cleanliness Tier

- tier_2: 623
- tier_3: 201
- tier_1: 97

## Counts By Source Category

- premium_fuel_program: 623
- organized_restaurant: 195
- official_wayside_amenity: 54
- premium_restroom: 43
- food_plaza: 6

## Top Seeds On Map

- Indian Oil Swagat: 245
- BPCL Ghar: 179
- Jio-bp: 75
- Indian Oil COCO: 74
- KFC: 59
- PATH Recharge: 49
- Lavato: 43
- Nayara Energy: 31
- McDonald's: 29
- Pizza Hut: 29
- Burger King: 17
- Haldiram's: 17
- Shell Select: 14
- Honest Restaurant: 10
- Bikanervala: 6
- Adyar Ananda Bhavan: 5
- Hotel Highway King: 5
- MTDC: 5
- Costa Coffee: 4
- Wild Bean Cafe: 4
- Highway Nest: 3
- Nirula's: 3
- Raju Gari Thota: 2
- Shree Datta Snacks: 2
- SN Highway Food Mall: 2
- 7 Midway Plaza: 1
- A2B: 1
- Cube Stop Morena: 1
- Gallops Food Plaza: 1
- Highway Nest Mini: 1

## Exclusions After Display Filtering

- name_type_mismatch: 140
- road_object_quarantine: 70
- details_unavailable_404_stale_place_id: 1

## Review Guidance

- Use this ledger to understand why something is currently on the map.
- Use the manual review ledger to decide what excluded/rejected rows should be removed, kept as candidates, or rescued onto the map.
- The resolved_google_name column is the Google Maps display name returned by Place Details for the stored google_place_id.
