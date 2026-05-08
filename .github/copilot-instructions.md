# Copilot Instructions

- Build this project as a highway-first India road-trip restroom planner, not a generic city toilet finder.
- Prioritize route-aware restroom stops: highway corridors, expressways, toll plazas, service roads, bypasses, fuel stations, food plazas, and verified public restrooms.
- Treat city locations as trip origins, destinations, bypasses, or staging areas. If the user is inside a city, ask where they are heading instead of showing a dense urban toilet map by default.
- Use Next.js App Router, TypeScript, Tailwind CSS, Supabase, Google Maps Platform, and WhatsApp webhook integrations.
- Store local crowdsourced restroom data in Supabase. For Google Places data, store only permitted identifiers such as `place_id` plus app-specific annotations.
- Follow TDD for behavior-bearing code: write a failing test, confirm it fails, implement the minimum code, and confirm it passes.
- Keep the UI map-first and usable. Do not build a marketing landing page as the primary screen.
- Keep implementation focused on the weekend MVP: route search, highway relevance filtering, crowdsourced submissions, admin moderation stubs, and WhatsApp chatbot stubs.
