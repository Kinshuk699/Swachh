# Swachh Bold Highway Atlas Design

## Decision

Swachh's first impression should be a **bold national highway atlas**: a dark, branded India map where national highways and expressways are lit as colored corridors and every known restroom stop in the database appears immediately.

This replaces the current default feeling of "a Google Map embedded in a page" with a product-owned highway intelligence surface. Google routing can still power accuracy after a traveler enters a trip, but the visual language should belong to Swachh.

## Product North Star

Swachh helps women and families traveling on Indian highways find sanitary, trustworthy restroom stops before they are forced into a bad choice on the road.

The map should answer three questions fast:

- Where are the trusted highway restroom stops?
- Which highways and corridors have good coverage?
- If I am taking this trip, where should I stop safely?

## Design Skill Synthesis

The design system uses the UI/UX Pro Max guidance as follows:

- **Product pattern:** map-first operational tool, not marketing page.
- **Style blend:** Dark Mode/OLED + Real-Time Monitoring + Heat Map + Accessible & Ethical.
- **Visual goal:** premium highway atlas, high contrast, restrained motion, clear safety signals.
- **Interaction priority:** touch-friendly controls, visible focus states, no hover-only behavior, labels on meaningful controls.
- **Animation rule:** motion must communicate route activity, corridor coverage, or selection state. No decorative animation that distracts from safety decisions.
- **Accessibility rule:** color is never the only meaning. Corridor colors need labels, marker shapes, text badges, and screen-reader summaries.
- **Anti-patterns to avoid:** generic Google default styling, neon chaos, one-note purple/blue gradients, tiny markers, city toilet density, unlabeled icon-only actions, overwhelming filters.

## Primary Experience States

### 1. Atlas Home: No Route Yet

When the app opens and the user has not entered a location, the map should not be empty and should not ask for city context first.

It should show:

- A stylized India highway atlas on a black/charcoal canvas.
- Lit corridors for priority routes such as Mumbai-Pune Expressway, NH48, NH44, NH65, NH19, Delhi-Jaipur, Bengaluru-Chennai, Hyderabad-Vijayawada, and other seeded corridors as data grows.
- Every database restroom stop as a dot or marker.
- Stop markers grouped by category and trust: verified, crowdsourced, toll plaza, food plaza, fuel station, public restroom.
- A small coverage summary: total stops, verified stops, women-friendly stops, corridors covered.
- A focused search module: From, To, optional highway.

This state should feel alive: "Swachh already knows the roads," not "please type before anything exists."

### 2. Route Plan: From And To Entered

After the traveler enters a trip, the atlas should transition from countrywide exploration into the selected corridor.

It should show:

- The computed route as the strongest line.
- Nearby seeded highway stops ranked by relevance, confidence, detour cost, and women-friendly signals.
- Corridor gaps where clean stops are sparse.
- Stop cards synchronized with map markers.
- A clear distinction between verified stops and unverified/crowdsourced stops.

Google Maps/Routes can drive the geometry and travel logic here, but the UI should still use Swachh markers, corridor overlays, and restrained map controls.

### 3. Future On-Road Mode

For a later mobile or PWA slice, the route view can become a cockpit-like mode:

- Next clean stop distance.
- Next verified women-friendly stop.
- Detour estimate.
- Night/lighting/attendant signals.
- Quick report missing stop.

This is not required for the next implementation pass, but the atlas should be designed so this state can grow naturally.

## Map Visual Language

### Canvas

- Background: near-black asphalt/ink surface.
- India shape: subtle charcoal silhouette, not a decorative illustration.
- Highway corridors: colored luminous lines with accessible labels and a legend.
- State/city detail: very muted or absent in the home atlas so highway routes dominate.
- Google basemap: hidden or heavily de-emphasized in the first view.

### Corridor Color System

Use a multi-color system, but keep it disciplined:

- Saffron/amber for primary active or highlighted corridor.
- Teal/cyan for alternate national highway corridors.
- Mint/green for strong restroom coverage.
- Rose/red for sparse or risky restroom gaps.
- Slate/gray for inactive or low-confidence corridors.

Color must always be paired with labels, line weight, marker shape, or text.

### Stop Marker System

Markers should communicate trust and category at a glance:

- Verified women-friendly stop: filled marker with ring and check/heart-safe style icon.
- Toll plaza restroom: compact square or gate-style marker.
- Food plaza: circular marker with food/service icon.
- Fuel station: diamond or pump marker.
- Public restroom: simple restroom marker.
- Unverified/crowdsourced: outlined marker with lower emphasis.

Use Lucide icons where available. Do not use emoji as icons.

## Simplified Trip Input

Replace the current "City start" and "On highway" split with a single planning panel.

Recommended fields:

- **From**: city, landmark, or current area.
- **To**: destination.
- **Highway or corridor**: optional, progressive disclosure or compact chip-style input.
- Primary action: **Find clean stops**.

Secondary quick chips can support common behavior:

- "I know my highway"
- "Show women-friendly only"
- "Show verified only"
- "Open now"

The UI should not make the user decide whether they are in a city or on a highway before they have expressed where they are going.

## Initial Data Behavior

Current route-search behavior returns no stops when trip context is missing. For the atlas design, that should change in the UI/product model.

Expected behavior:

- No route input: show all database highway-relevant stops and all seeded corridors.
- City-only input without destination: still ask where the traveler is heading, but keep the atlas visible behind the prompt.
- From/To input: filter and rank by selected route corridor.
- Highway-only input: focus that corridor and show all associated stops.

This keeps the highway-first rule while honoring the user's request that the app should show existing database places initially.

## Data Model Needs

The next implementation pass likely needs a small local highway corridor layer before any large real dataset is introduced.

Add a seed corridor model with:

- `id`
- `name`
- `shortName`
- `from`
- `to`
- `category`: expressway, national_highway, bypass, service_corridor
- `coverageStatus`: strong, growing, sparse
- `colorToken`
- `path`: simplified latitude/longitude points or SVG normalized points for atlas rendering
- `featuredStopIds`

Existing `sampleHighwayStops` should link to corridors by highway/corridor ID where possible.

## Technical Direction

Recommended implementation approach for the next pass:

1. Build a custom `HighwayAtlasMap` view for the no-route state using SVG or lightweight DOM/SVG layers.
2. Feed it local seeded corridor geometry and `sampleHighwayStops`.
3. Keep Google Routes integration for actual route planning after From/To is submitted.
4. Use Swachh-styled overlays and custom markers so even the route view does not feel like a stock Google map.
5. Keep the fallback useful when Google Maps API keys are missing.

This gives the product a distinctive identity quickly without blocking on full OSM/Mapbox/vector-tile infrastructure.

## Next Implementation Scope

Implement only the next coherent slice:

- Add the atlas home state.
- Show all seeded database stops initially.
- Add seeded highway corridor geometry.
- Simplify trip input into From/To/optional highway.
- Keep submission sheet and admin moderation behavior intact.
- Keep WhatsApp as stubs only.

Do not implement full on-road cockpit mode yet.

## TDD Expectations

Before implementation, use the user's required test rhythm:

- Write a failing test for initial atlas behavior: no route input shows seeded stops/corridors.
- Confirm it fails.
- Implement the minimum code.
- Confirm it passes.
- Repeat for simplified trip inputs and route filtering behavior.

Suggested tests:

- `buildRouteSearchResponse` or equivalent exploration model returns highway stops for atlas/no-route mode.
- Planner renders the simplified From/To form without City start / On highway tabs.
- Atlas map renders seeded corridors and stop buttons/markers.
- Existing report submission flow still posts to `/api/restrooms/submissions`.
- Admin queue remains unaffected.

## Acceptance Criteria

The redesign is successful when:

- The first screen feels like a branded India highway atlas, not a default Google map.
- All seeded highway restroom places are visible before the user enters a route.
- Highways/corridors are visually lit in multiple accessible colors.
- Stop markers clearly communicate category and trust.
- The trip form is simpler than the current city/highway tab split.
- The product remains highway-first and does not become a dense city toilet finder.
- The UI meets UI/UX Pro Max quality checks: 44px touch targets, visible focus, no emoji icons, clear hover/press states, reduced-motion support, responsive layouts at 375/768/1024/1440.

## Open Questions

- Which seed corridors should be included in the first atlas implementation beyond the current sample stops?
- Should the atlas use approximate schematic geometry first, or geographically accurate simplified coordinates from the start?
- What exact marker icon should represent "women-friendly verified" without becoming visually noisy?
