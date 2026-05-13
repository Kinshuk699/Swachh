# Google Curated Places Manual Review - 2026-05-13

Generated from hosted Supabase project https://fkqmanrjwpkfjmsbizot.supabase.co for manual review of rejected and user-display-excluded Google place matches.

Google usage for this export: 0 Text Search requests, 2997 Place Details requests, 3 Place Details failures.

## Review Precedence

1. road_object_quarantine - likely remove from user map unless it is actually a named service area/restroom.
2. details_unavailable or missing_location - refresh/check Place ID before deciding.
3. name_type_mismatch - possible rescue candidates if Google name is a real stop despite seed mismatch.
4. already_rejected - lowest-priority rescue list from original Text Search rejection logic.

## Current Counts By Review Bucket

- already_rejected: 1647
- name_type_mismatch: 138
- road_object_quarantine: 69
- details_unavailable: 2

## Current Counts By Display Reason

- already_rejected: 1646
- name_type_mismatch: 138
- road_object_quarantine: 69
- details_unavailable: 3

## Current Counts By Seed

- HPCL Focus Outlet: 250
- KSTDC Mayura: 171
- Village Food Courts: 134
- Highway Village: 118
- Shell Cafe: 94
- Honest Restaurant: 88
- Reliance: 82
- Highway Nest: 62
- PATH Recharge: 54
- Gallops Food Plaza: 52
- Bikanervala: 51
- BPCL Pure for Sure Platinum: 46
- Hotel Highway King: 46
- Pizza Hut: 41
- Raju Gari Thota: 41
- Club HP: 40
- Cube Stop: 40
- Costa Coffee: 38
- 7 Midway Plaza: 32
- SN Highway Food Mall: 29
- PIK N GO: 23
- Pure for Sure Platinum: 23
- Burger King: 22
- McDonald's: 21
- NHAI Wayside Amenities: 18
- Lavato: 17
- A2B: 14
- Wild Bean Cafe: 13
- Adyar Ananda Bhavan: 12
- Big Bay India: 12
- BPCL Ghar: 12
- Cheetal Grand: 12
- Savera Group: 12
- Shell Select: 12
- MP Tourism Highway Treat: 11
- Jio-bp: 10
- Hotel Kamat Lokaruchi: 9
- KFC: 9
- Telangana Haritha: 9
- Shree Datta Snacks: 8
- Shree Rathnam: 8
- Expressway rest area: 7
- Haldiram's: 7
- KTDC: 6
- MTDC: 6
- RTDC Midway: 5
- Highway Nest Mini: 4
- NHLML Wayside Amenities: 4
- Greenhouse: 3
- Nayara Energy: 3
- Official expressway service area: 3
- Vithal Kamats: 3
- Haryana Tourism Complex: 2
- Indian Oil COCO: 2
- Nirula's: 2
- Agra Lucknow Expressway amenities: 1
- Gujarat Tourism Toran: 1
- Indian Oil Swagat: 1

## Review Guidance

- Fill review_decision with keep_on_map, keep_candidate_only, remove, or needs_more_context.
- Restoring a row should not require new Text Search because the CSV keeps the Google place_id.
