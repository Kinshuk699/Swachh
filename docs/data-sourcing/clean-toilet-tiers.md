# Clean Toilet Candidate Tiers

Swachh is a highway-first restroom planner. The data model should prioritize stops where a road-trip traveller can reasonably expect a usable, maintained restroom, not every toilet-like result near a city.

Every public stop shown in the app should resolve to a Google Maps `place_id`. Other sources can help discover candidates, but Google Maps matching is the publication gate.

## Classification Timing

Assign a tier as soon as a candidate is created from a seed source. Keep that tier through Google matching and import. After user/admin verification, update the verification status separately.

Recommended fields:

- `cleanliness_tier`: `tier_1`, `tier_2`, `tier_3`, or `tier_4`
- `source_category`: the reason the candidate entered the system
- `verification_status`: `matched`, `likely_clean`, `verified_clean`, `reported_unclean`, `rejected`
- `source_evidence`: short app-owned note such as `Official WSA`, `HPCL Focus Outlet`, `QSR proxy`, or `User submitted`
- `last_verified_at`: timestamp for human or trusted refresh verification

This keeps provenance separate from truth. A Tier 1 source can still be reported unclean later, and a Tier 4 local stop can become verified clean after enough trustworthy reports.

## Tier 1: Very High Confidence

Stops directly designed as highway traveller amenities or paid/restroom-first services.

- Lavato
- NHAI / NHLML Wayside Amenities
- Cube Stop
- PATH Recharge
- Official expressway service areas
- Premium paid restroom operators
- Purpose-built WSA sites on national highways and expressways

Default label: `Premium restroom` or `Official wayside amenity`.

Default verification status after Google match: `likely_clean`.

## Tier 2: High Confidence

Fuel or mobility operators with quality programs, highway outlet formats, or explicit restroom/traveller amenities.

- HPCL Focus Outlets
- Club HP highway outlets
- BPCL Pure for Sure Platinum
- BPCL Ghar / one-stop trucker facilities
- IOCL Swagat
- Indian Oil COCO
- Jio-bp mobility stations
- Shell Select
- Shell Cafe
- Wild Bean Cafe
- Large expressway fuel + food plazas
- Modern EV charging plazas with food/restroom amenities

Default label: `Likely clean fuel stop`.

Default verification status after Google match: `likely_clean` only when the source name or evidence indicates the premium/highway format. Generic fuel stations should stay Tier 4.

## Tier 3: Good Proxy

Organized restaurant, cafe, or food-plaza brands that are likely to maintain customer restrooms on highway corridors.

- McDonald's
- Burger King
- KFC
- Pizza Hut
- Costa Coffee
- Haldiram's
- Bikanervala
- A2B / Adyar Ananda Bhavan
- Highway King
- Cheetal Grand
- Vithal Kamats
- Shree Datta Snacks
- Honest Restaurant
- Gallops Food Plaza
- SN Highway Food Mall
- 7 Midway Plaza
- Raju Gari Thota
- Big Bay India
- Hotel Kamat Lokaruchi
- State tourism highway restaurants and midways, such as MP Tourism Highway Treat, Haryana Tourism complexes, RTDC midways, KSTDC Mayura, Telangana Haritha, TTDC, KTDC, MTDC, and similar government-backed stops

Default label: `Likely clean restaurant stop`.

Default verification status after Google match: `matched` or `likely_clean`, depending on brand strength and highway context. Upgrade to `verified_clean` only after human or strong crowdsourced confirmation.

## Tier 4: Candidate Only

Useful leads that need verification before being described as clean.

- Local dhabas
- Truck stops
- Generic public toilets
- Generic fuel stations
- Generic Google Maps restroom results
- User-submitted places without verification
- Toll-plaza nearby restroom candidates
- Unclear food courts or plazas without known operator quality

Default label: `Needs verification`.

Default verification status after Google match: `matched`.

## Sources To Avoid For MVP

- Broad city toilet maps by default
- MoHUA / SBM city public toilet mapping as the main highway source
- OpenStreetMap / Overpass as a primary source

These sources may be useful later for origins, destinations, bypass towns, or admin research, but they do not fit the highway-first clean-restroom promise for the MVP.

## Matching Rule

A candidate should become a visible app stop only after all of these are true:

1. It has a Google Maps `place_id`.
2. It has coordinates.
3. It passes the route/highway corridor filter.
4. It has a tier and source category.
5. It is not rejected or reported unclean without later re-verification.

## Display Rule

Use tier and verification together:

- `verified_clean`: strongest app claim; use only after human/admin/crowd verification.
- `likely_clean`: source-backed confidence, not a guarantee.
- `matched`: candidate matched to Google Maps and highway filter but not cleanliness-verified.
- `reported_unclean`: de-prioritize or hide unless no alternatives exist.

The app should be honest: Google Maps proves the place exists; Swachh's tier explains why it is a clean-restroom candidate.