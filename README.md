# Swachh

Highway-first restroom planning for India road trips.

The MVP helps travelers find clean, safe, route-aware restroom stops along highways, expressways, bypasses, toll plazas, service roads, fuel stations, food plazas, and verified public facilities. City locations are treated as trip origins, destinations, bypasses, or staging areas rather than generic toilet-search areas.

## Stack

- Next.js App Router
- TypeScript
- Tailwind CSS
- Supabase for auth, database, storage, and moderation
- Google Maps Platform for map, routes, places, and open-now data
- WhatsApp webhook stubs for chatbot workflows

## Local Development

```bash
npm install
npm run dev
```

## First Slice

Swachh starts with a curated route planner. Known highway restroom proxy brands and route-specific stop candidates live in CSV files under `data/`. The app uses those records to show highway-relevant restroom stops for a trip and asks for destination context when a user is inside a city.

Google-derived place data must be handled carefully. Store only Google `place_id` plus Swachh-owned annotations such as route context, category, restroom confidence, and notes. Fetch live Google details only when needed.

## Verification

```bash
npm run lint
npm run typecheck
npm run test
npm run build
npm run test:e2e
```

## Environment

Copy `.env.example` to `.env.local` and fill in real keys before enabling live integrations.
