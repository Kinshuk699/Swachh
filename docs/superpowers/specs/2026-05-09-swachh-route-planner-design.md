# Swachh Route Planner Design

## Purpose

Swachh is a highway-first restroom planning website for India road trips. The first product slice helps travelers enter an origin and destination, view highway-relevant restroom stops on Google Maps, and avoid generic city toilet search results.

The product promise is not "find any toilet near me." It is "find trustworthy restroom stops for this highway trip."

## First Slice

The first approved slice is **Route Planner With Curated Google-Mapped Highway Stops**.

It includes:

- A map-first route planner for origin and destination search.
- A curated seed catalog of highway hygiene proxy brands and route-specific stop candidates.
- Google Maps rendering for route and stop display.
- Google Places matching for known restaurants, food plazas, fuel stations, and premium lavatories.
- Highway relevance filtering so dense city outlets are hidden unless they serve route entry, route exit, bypass, toll, service-road, or endpoint staging behavior.

It excludes for this slice:

- Crowdsourced public submissions.
- WhatsApp production chatbot integration.
- Full admin moderation workflow.
- Scraping NHAI, government, or third-party map portals.
- Generic city restroom discovery.

## Seed Data Model

The seed data has two layers.

### Proxy Brand Catalog

The proxy brand catalog stores trusted operators whose highway outlets are likely to have usable restrooms.

Examples:

- International QSRs: McDonald's, Burger King, KFC, Pizza Hut, Costa Coffee.
- Premium wayside operators: Cube Stop, PATH Recharge, Village Food Courts, Lavato.
- Fuel and mobility operators: Shell Select, Shell Cafe, Jio-bp, Wild Bean Cafe, Indian Oil Swagat, BPCL Ghar, Reliance, Nayara.
- Regional food plaza and restaurant leaders: Hotel Highway King, Honest Restaurant, Gallops Food Plaza, SN Highway Food Mall, Haldiram's, Nirula's, Bikanervala, Cheetal Grand, Shree Rathnam, Shree Datta Snacks, Vithal Kamats, PIK N GO, A2B, Kamat Lokaruchi, Big Bay India, Azad Hind Dhaba, National Highway Dhaba.

These brands are not automatically shown everywhere. City outlets are hidden by default unless they are route-relevant.

### Curated Stop Candidates

The curated stop candidates store known highway or route hints from the user's research list.

Examples:

- Lavato near Krishnagiri toll plaza on NH-44.
- Hotel Highway King on Delhi-Jaipur and Jaipur-Ajmer corridors.
- Gallops Food Plaza and SN Highway Food Mall on Gujarat highway corridors.
- Shree Datta Snacks and Vithal Kamats on Mumbai-Pune Expressway and Panvel-Goa routes.
- 7 Midway Plaza and Raju Gari Thota on Hyderabad-Vijayawada NH-65.
- Big Bay India near Bengaluru Airport on NH-44.
- National Highway Dhaba at Nongpoh on Guwahati-Shillong.
- Gargi Surya Vihar on NH-19 near Aurangabad, Bihar.

Each candidate should store our own route context, confidence, category, notes, and restroom proxy reason.

## Google Matching Flow

For each curated stop candidate, the system builds a Google Places search query using the local seed context:

```text
{name} {highway_context} {route_context} India
```

The matching workflow:

1. Query Google Places Text Search for the candidate.
2. Show the best matches for review.
3. Store the selected Google `place_id`.
4. Store only app-owned annotations permanently: region, highway context, route context, category, confidence, restroom notes, and verification state.
5. Fetch live Google details such as current name, open status, coordinates, and map links at display time where permitted.

## Route Search Behavior

When a user enters a trip, the app should:

1. Compute the route with Google Routes API.
2. Match curated stops and trusted proxy brands against the route corridor.
3. Suppress dense city results unless they are near route entry, route exit, a bypass, a toll plaza, a service road, or a route endpoint staging area.
4. Rank stops by highway relevance, detour time, verified status, restroom confidence, open status, and family/women-friendly signals.
5. Show the result list and pins on a Google Map.

If the user opens the app inside a city without a destination or highway name, the app asks where they are heading instead of showing a dense map of urban restrooms.

## Google API Requirements

The first slice requires a Google Cloud project with billing enabled and these APIs:

- Maps JavaScript API for map rendering.
- Places API New for matching seed stops and refreshing place details.
- Routes API for origin-to-destination route computation.
- Geocoding API only if a seed row has an address or landmark that cannot be matched reliably by Places search.

The implementation should use restricted API keys:

- Browser key restricted to the website domain for Maps JavaScript.
- Server key restricted to backend usage for Places, Routes, and optional Geocoding.

Google usage is not assumed to be unlimited free. The design minimizes repeated calls by matching curated stops once, storing `place_id`, and refreshing details only when needed.

## Initial CSV Format

The first version stores seed data in repo CSV files before moving it to Supabase.

`data/highway-proxy-brands.csv`:

```csv
brand_name,region,proxy_type,default_confidence,notes
Cube Stop,Pan-India,wayside_amenity,0.9,Dedicated Wash Stop with staffed restroom operations
Shell Select,Pan-India,fuel_cafe,0.78,Clean fuel station restroom proxy with snacks and cafe
```

`data/curated-stop-candidates.csv`:

```csv
name,region,proxy_type,highway_context,route_context,locality_hint,default_confidence,notes
Lavato,South India,premium_lavatory,NH-44,Krishnagiri toll plaza,Krishnagiri,0.95,Premium AC lavatory service near toll plaza
7 Midway Plaza,South India,food_plaza,NH-65,Hyderabad-Vijayawada,Suryapet corridor,0.9,Large food court praised for clean toilets
```

## Success Criteria

The first slice is successful when:

- A traveler can enter an origin and destination.
- The app displays curated highway-relevant restroom proxy stops on a map and list.
- City-only usage asks for trip context.
- Seed stops can be matched to Google `place_id` without storing disallowed Google fields.
- The system has tests for highway relevance filtering, route intent behavior, and seed record validation.
- The project has a clear path to later Supabase import, crowdsourcing, moderation, and WhatsApp chatbot integration.

## Open Follow-Ups

- Confirm the first production name and visual identity beyond the repository name `Swachh`.
- Decide whether Google matching review is a command-line import, an admin page, or both.
- Collect exact outlet names and locality hints for the first 50 curated stops.