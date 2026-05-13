# Google Curated Places Manual Review - 2026-05-13

Generated from hosted Supabase project https://fkqmanrjwpkfjmsbizot.supabase.co for manual review of rejected and user-display-excluded Google place matches.

Google usage for this export: 0 Text Search requests, 2486 Place Details requests, 2 Place Details failures.

## Review Precedence

1. road_object_quarantine - likely remove from user map unless it is actually a named service area/restroom.
2. details_unavailable or missing_location - refresh/check Place ID before deciding.
3. name_type_mismatch - possible rescue candidates if Google name is a real stop despite seed mismatch.
4. already_rejected - lowest-priority rescue list from original Text Search rejection logic.

## Current Counts By Review Bucket

- already_rejected: 1354
- name_type_mismatch: 140
- road_object_quarantine: 70
- details_unavailable: 1

## Current Counts By Display Reason

- already_rejected: 1353
- name_type_mismatch: 140
- road_object_quarantine: 70
- details_unavailable: 2

## Current Counts By Seed

- HPCL Focus Outlet: 250
- KSTDC Mayura: 171
- Village Food Courts: 135
- Reliance: 82
- Highway Village: 68
- Honest Restaurant: 68
- PATH Recharge: 54
- Bikanervala: 47
- BPCL Pure for Sure Platinum: 46
- Shell Cafe: 44
- Gallops Food Plaza: 43
- Raju Gari Thota: 41
- Club HP: 40
- Pizza Hut: 40
- Highway Nest: 35
- 7 Midway Plaza: 32
- Costa Coffee: 26
- Hotel Highway King: 24
- PIK N GO: 23
- Pure for Sure Platinum: 23
- SN Highway Food Mall: 20
- Cube Stop: 18
- Lavato: 17
- McDonald's: 17
- Burger King: 16
- NHAI Wayside Amenities: 15
- A2B: 14
- Big Bay India: 12
- BPCL Ghar: 12
- Savera Group: 12
- Adyar Ananda Bhavan: 11
- MP Tourism Highway Treat: 11
- Telangana Haritha: 9
- KFC: 8
- Shree Rathnam: 8
- Wild Bean Cafe: 7
- Haldiram's: 6
- KTDC: 6
- MTDC: 6
- Jio-bp: 5
- RTDC Midway: 5
- Cheetal Grand: 4
- Expressway rest area: 4
- Greenhouse: 3
- Nayara Energy: 3
- Shell Select: 3
- Shree Datta Snacks: 3
- Vithal Kamats: 3
- Haryana Tourism Complex: 2
- Hotel Kamat Lokaruchi: 2
- Indian Oil COCO: 2
- NHLML Wayside Amenities: 2
- Nirula's: 2
- Official expressway service area: 2
- Gujarat Tourism Toran: 1
- Highway Nest Mini: 1
- Indian Oil Swagat: 1

## Review Guidance

- Fill review_decision with keep_on_map, keep_candidate_only, remove, or needs_more_context.
- Restoring a row should not require new Text Search because the CSV keeps the Google place_id.
