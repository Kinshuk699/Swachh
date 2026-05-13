# Google Curated Places Type-Aware Review - 2026-05-13

Generated from docs/data-sourcing/google-curated-places-manual-review-2026-05-13.csv.

Google usage for this export: 0 Text Search requests, 0 Place Details requests.

## What This Ledger Is

This ledger applies the new type-aware tier rubric to the existing manual review CSV. It does not mutate Supabase or the source CSV.

## Rubric Summary

- Dhaba in the resolved Google name always stays Tier 4/candidate-only.
- Road, bridge, route, toll, and area objects are recommended for removal.
- Fuel rows become Tier 2 only when Google types identify a fuel stop and the resolved Google name shows a premium/highway format, such as Jio-bp, Swagat, COCO, Shell, Club HP, or Pure for Sure/Platinum.
- Generic fuel stations stay Tier 4/candidate-only even when a premium seed found them.
- Known organized restaurant, cafe, food-plaza, and tourism stops become Tier 3 when they are not dhabas.
- Lodging/resort rows stay Tier 4/candidate-only unless separately verified.

## Counts

- total rows reviewed: 1565
- recommended keep_on_map: 521
- recommended keep_candidate_only: 607
- recommended remove: 437

## Counts By Recommended Tier

- tier_4: 1044
- tier_3: 503
- tier_1: 15
- tier_2: 3

## Counts By Recommended Action

- keep_candidate_only: 607
- keep_on_map: 521
- remove: 437

## Counts By Type Signal

- food_stop_type: 586
- fuel_stop_type: 360
- weak_or_other_type: 269
- road_or_area_type: 165
- lodging_type: 162
- dhaba_name: 20
- restroom_type: 3

## Counts By Brand Signal

- generic_or_unclear_brand: 687
- organized_food_brand_match: 503
- generic_fuel_from_premium_seed: 357
- official_wayside_brand_match: 15
- premium_fuel_brand_match: 3

## Keep-On-Map Seeds

- Village Food Courts: 113
- KSTDC Mayura: 96
- Honest Restaurant: 57
- Gallops Food Plaza: 38
- Pizza Hut: 38
- 7 Midway Plaza: 25
- Costa Coffee: 22
- Bikanervala: 20
- Burger King: 16
- SN Highway Food Mall: 14
- Raju Gari Thota: 13
- A2B: 9
- Adyar Ananda Bhavan: 7
- KFC: 7
- McDonald's: 7
- Cube Stop: 6
- Highway Nest: 6
- Hotel Highway King: 5
- Highway Village: 3
- Reliance: 3
- Big Bay India: 2
- Cheetal Grand: 2
- Haldiram's: 2
- Hotel Kamat Lokaruchi: 2
- KTDC: 2
- MP Tourism Highway Treat: 2
- Haryana Tourism Complex: 1
- Shell Cafe: 1
- Shree Datta Snacks: 1
- Vithal Kamats: 1

## Candidate-Only Seeds

- HPCL Focus Outlet: 250
- KSTDC Mayura: 61
- BPCL Pure for Sure Platinum: 45
- Shell Cafe: 42
- Club HP: 39
- PIK N GO: 19
- Highway Nest: 18
- Hotel Highway King: 18
- Pure for Sure Platinum: 18
- MP Tourism Highway Treat: 8
- BPCL Ghar: 7
- Shree Rathnam: 7
- Village Food Courts: 7
- Wild Bean Cafe: 7
- Honest Restaurant: 6
- Raju Gari Thota: 6
- Highway Village: 5
- RTDC Midway: 5
- 7 Midway Plaza: 4
- Savera Group: 4
- Big Bay India: 3
- KTDC: 3
- MTDC: 3
- Reliance: 3
- SN Highway Food Mall: 3
- A2B: 2
- Haldiram's: 2
- Bikanervala: 1
- Cheetal Grand: 1
- Costa Coffee: 1
- Gujarat Tourism Toran: 1
- Haryana Tourism Complex: 1
- Indian Oil COCO: 1
- Indian Oil Swagat: 1
- Nayara Energy: 1
- Pizza Hut: 1
- Shell Select: 1
- Shree Datta Snacks: 1
- Vithal Kamats: 1

## Review Guidance

- Review keep_on_map rows first because these are proposed rescues into Tier 1/2/3.
- Review keep_candidate_only rows next; these should not appear on the public map until verified.
- Removal rows are mostly road/infrastructure or weak non-traveller matches.
