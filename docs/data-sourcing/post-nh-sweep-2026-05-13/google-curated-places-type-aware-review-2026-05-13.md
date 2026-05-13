# Google Curated Places Type-Aware Review - 2026-05-13

Generated from docs/data-sourcing/post-nh-sweep-2026-05-13/google-curated-places-manual-review-2026-05-13.csv.

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

- total rows reviewed: 1856
- recommended keep_on_map: 623
- recommended keep_candidate_only: 704
- recommended remove: 529

## Counts By Recommended Tier

- tier_4: 1233
- tier_3: 583
- tier_1: 37
- tier_2: 3

## Counts By Recommended Action

- keep_candidate_only: 704
- keep_on_map: 623
- remove: 529

## Counts By Type Signal

- food_stop_type: 737
- fuel_stop_type: 366
- weak_or_other_type: 343
- lodging_type: 200
- road_or_area_type: 180
- dhaba_name: 24
- restroom_type: 6

## Counts By Brand Signal

- generic_or_unclear_brand: 870
- organized_food_brand_match: 583
- generic_fuel_from_premium_seed: 363
- official_wayside_brand_match: 37
- premium_fuel_brand_match: 3

## Keep-On-Map Seeds

- Village Food Courts: 112
- KSTDC Mayura: 96
- Honest Restaurant: 77
- Gallops Food Plaza: 46
- Pizza Hut: 39
- Costa Coffee: 31
- 7 Midway Plaza: 25
- Bikanervala: 23
- Burger King: 22
- SN Highway Food Mall: 21
- Cube Stop: 15
- Hotel Highway King: 15
- Raju Gari Thota: 13
- McDonald's: 11
- A2B: 9
- Highway Nest: 9
- Highway Village: 9
- Adyar Ananda Bhavan: 8
- KFC: 8
- Shree Datta Snacks: 6
- Cheetal Grand: 5
- Expressway rest area: 3
- Hotel Kamat Lokaruchi: 3
- Reliance: 3
- Shell Cafe: 3
- Big Bay India: 2
- Haldiram's: 2
- KTDC: 2
- MP Tourism Highway Treat: 2
- Haryana Tourism Complex: 1
- Highway Nest Mini: 1
- Vithal Kamats: 1

## Candidate-Only Seeds

- HPCL Focus Outlet: 250
- Shell Cafe: 88
- KSTDC Mayura: 61
- BPCL Pure for Sure Platinum: 45
- Club HP: 39
- Hotel Highway King: 30
- Highway Nest: 27
- PIK N GO: 19
- Pure for Sure Platinum: 18
- Wild Bean Cafe: 13
- Highway Village: 10
- MP Tourism Highway Treat: 8
- BPCL Ghar: 7
- Shree Rathnam: 7
- Village Food Courts: 7
- Cheetal Grand: 6
- Honest Restaurant: 6
- Hotel Kamat Lokaruchi: 6
- Raju Gari Thota: 6
- RTDC Midway: 5
- Shell Select: 5
- 7 Midway Plaza: 4
- Savera Group: 4
- SN Highway Food Mall: 4
- Big Bay India: 3
- KTDC: 3
- MTDC: 3
- Reliance: 3
- A2B: 2
- Haldiram's: 2
- Bikanervala: 1
- Costa Coffee: 1
- Gujarat Tourism Toran: 1
- Haryana Tourism Complex: 1
- Highway Nest Mini: 1
- Indian Oil COCO: 1
- Indian Oil Swagat: 1
- Jio-bp: 1
- Nayara Energy: 1
- Official expressway service area: 1

## Review Guidance

- Review keep_on_map rows first because these are proposed rescues into Tier 1/2/3.
- Review keep_candidate_only rows next; these should not appear on the public map until verified.
- Removal rows are mostly road/infrastructure or weak non-traveller matches.
