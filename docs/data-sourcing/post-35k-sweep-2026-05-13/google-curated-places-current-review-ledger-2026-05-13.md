# Current Google Curated Places Review Ledger - 2026-05-13

Generated from hosted Supabase project https://fkqmanrjwpkfjmsbizot.supabase.co.

Google usage for this export: 0 Text Search requests, 0 Place Details requests.

## What This Is

This is the current Supabase-only held-back review queue. It includes rejected rows, matched-but-not-public candidates, and legacy Tier 4 accepted rows. Fill the blank review_decision/new status columns as you review rows one by one.

## Review Buckets

- accepted_candidate_not_public: accepted candidate row with verification_status=matched; review to promote to likely_clean, keep candidate-only, or reject.
- rejected_text_search_match: stored rejected false positive; review only if it looks rescuable from the place_id/map link.
- legacy_tier4_candidate: old Tier 4 accepted row; review to promote into Tier 1-3 or remove from current MVP framing.

## Counts

- held-back review rows: 11974

## Counts By Review Bucket

- accepted_candidate_not_public: 6470
- rejected_text_search_match: 5435
- legacy_tier4_candidate: 69

## Counts By Verification Status

- matched: 6539
- rejected: 5435

## Counts By Cleanliness Tier

- tier_3: 7434
- tier_2: 3461
- tier_1: 1010
- tier_4: 69

## Counts By Source Category

- generic_candidate: 6204
- food_plaza: 2884
- organized_restaurant: 1240
- premium_fuel_program: 835
- official_wayside_amenity: 759
- dhaba_candidate: 51
- premium_restroom: 1

## Top Seeds

- Petrol Pump: 6186
- Food Plaza: 2581
- McDonald's: 334
- Cube Stop: 302
- HPCL Focus Outlet: 250
- Highway Nest: 222
- Shell Select: 210
- KSTDC Mayura: 171
- Village Food Courts: 133
- Highway Village: 118
- KFC: 108
- Pizza Hut: 102
- Honest Restaurant: 99
- NHAI Wayside Amenities: 98
- Reliance: 98
- Shell Cafe: 93
- Bikanervala: 62
- Jio-bp: 62
- Burger King: 59
- Hotel Highway King: 54
- Gallops Food Plaza: 51
- Costa Coffee: 49
- BPCL Pure for Sure Platinum: 46
- Raju Gari Thota: 43
- Club HP: 40
- Haldiram's: 34
- 7 Midway Plaza: 33
- SN Highway Food Mall: 31
- PIK N GO: 23
- Pure for Sure Platinum: 23
- Adyar Ananda Bhavan: 18
- A2B: 16
- Nana Hotel: 16
- National Highway Dhaba: 13
- Wild Bean Cafe: 13
- Big Bay India: 12
- BPCL Ghar: 12
- Cheetal Grand: 12
- Savera Group: 12
- MP Tourism Highway Treat: 11

## Top Highways

- NH-16: 130
- Sarkhej-Gandhinagar Highway: 127
- NH-275: 104
- NH-8: 98
- NH-216: 97
- NH-565: 94
- NH-922: 93
- NH-66: 90
- NH-20: 89
- NH-44: 87
- NH-730: 83
- NH-150: 81
- NH-785: 81
- NH-85: 80
- NH-53: 75
- NH-18: 74
- NH-130: 72
- NH-34: 72
- NH-6: 69
- NH-73: 68
- NH-87: 68
- NH-58: 67
- NH-753: 66
- NH-173: 65
- NH-19: 65
- NH-227A: 64
- NH-544H: 64
- NH-716: 64
- NH-381: 61
- NH-55: 61
- NH-148B: 60
- NH-753J: 60
- NH-166: 58
- NH-330: 57
- NH-48: 57
- NH-844: 57
- NH-765D: 56
- NH-52: 55
- NH-966: 55
- NH-334B: 54

## Review Decisions

- `promote_to_likely_clean`: good enough for public map after spot-checking.
- `keep_candidate_only`: useful in all_found/internal mode, not public yet.
- `remove`: confirmed false positive or not useful for highway restroom planning.
- `needs_place_details`: worth spending one targeted Place Details call later.
- `needs_human_google_maps_check`: open the place_id URL manually before deciding.
