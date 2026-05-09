# Swachh Bold Highway Atlas Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use test-driven-development for every behavior-bearing change. This plan is executed inline in the current session because the user explicitly requested no subagents. Do not commit; the user commits manually.

**Goal:** Replace the stock-map first impression with a branded highway-atlas home state that shows seeded corridors and restroom stops before route input.

**Architecture:** Keep route/search logic in `src/lib/routes`, local seed data in `src/lib/highways` and `src/lib/restrooms`, and rendering in focused map/planner components. Use a custom SVG atlas for the no-route/default surface while preserving existing Google route API behavior after search.

**Tech Stack:** Next.js App Router, TypeScript, React, Tailwind CSS, shadcn/ui, Vitest, Testing Library, Lucide icons.

**Hard Constraints:** No commits. No subagents. No production code before a failing test. Avoid AI-template aesthetics: no marketing hero, no generic gradient section, no giant vague headline, no decorative card maze, no fake polish that hides utility.

---

## File Map

- Modify: `src/lib/routes/route-search.test.ts` — update atlas/no-route expectations.
- Modify: `src/lib/routes/route-search.ts` — return ranked highway stops even when asking city users for trip context.
- Create: `src/lib/highways/sample-corridors.ts` — seed highway corridor metadata and SVG atlas paths.
- Create: `src/components/map/MapCanvas.test.tsx` — assert the branded atlas renders corridors and stop markers.
- Modify: `src/components/map/MapCanvas.tsx` — render the bold highway atlas with seeded corridors and custom stop markers.
- Modify: `src/components/map/HighwayPlanner.test.tsx` — assert simplified From/To/optional highway form and retained submission behavior.
- Modify: `src/components/map/HighwayPlanner.tsx` — remove City start/On highway tabs and expose atlas stops while still asking for destination context.

---

### Task 1: Atlas Data Behavior

**Files:**
- Modify: `src/lib/routes/route-search.test.ts`
- Modify: `src/lib/routes/route-search.ts`

- [ ] **Step 1: Write the failing test**

Change the first route-search test to:

```ts
it("returns atlas stops while still asking dense-city users for trip context", () => {
  const response = buildRouteSearchResponse({
    origin: "Bandra West, Mumbai",
    destination: "",
    highwayName: "",
    isInsideCity: true,
    distanceToHighwayMeters: 9_000,
  });

  expect(response.intent.mode).toBe("ask-for-trip");
  expect(response.intent.requiresTripContext).toBe(true);
  expect(response.stops.map((stop) => stop.id)).toEqual([
    "mumbai-pune-food-plaza",
    "nh48-toll-plaza",
    "city-edge-fuel-station",
  ]);
  expect(response.stops).not.toContainEqual(expect.objectContaining({ id: "dense-city-mall" }));
});
```

- [ ] **Step 2: Verify red**

Run:

```bash
npm run test -- src/lib/routes/route-search.test.ts
```

Expected: FAIL because the current implementation returns `stops: []` for `requiresTripContext`.

- [ ] **Step 3: Write minimal implementation**

In `src/lib/routes/route-search.ts`, compute `relevantStops` and `rankedStops` before the trip-context branch, then return ranked stops in all modes:

```ts
const relevantStops = filterHighwayRelevantStops(sampleHighwayStops) as HighwayStop[];
const rankedStops = rankHighwayStops(relevantStops) as HighwayStop[];

if (intent.requiresTripContext) {
  return { intent, route: null, stops: rankedStops };
}

return { intent, route: null, stops: rankedStops };
```

Then simplify the duplicated branch if desired, preserving behavior.

- [ ] **Step 4: Verify green**

Run:

```bash
npm run test -- src/lib/routes/route-search.test.ts
```

Expected: PASS.

---

### Task 2: Bold Highway Atlas Map

**Files:**
- Create: `src/lib/highways/sample-corridors.ts`
- Create: `src/components/map/MapCanvas.test.tsx`
- Modify: `src/components/map/MapCanvas.tsx`

- [ ] **Step 1: Write the failing test**

Create `src/components/map/MapCanvas.test.tsx` with a test that renders `MapCanvas` without a Google key and expects:

```ts
expect(screen.getByRole("img", { name: /swachh national highway atlas/i })).toBeTruthy();
expect(screen.getByText("Mumbai-Pune Expressway")).toBeTruthy();
expect(screen.getByText("NH48")).toBeTruthy();
expect(screen.getAllByRole("button").map((button) => button.getAttribute("aria-label"))).toContain("Expressway Food Plaza");
```

- [ ] **Step 2: Verify red**

Run:

```bash
npm run test -- src/components/map/MapCanvas.test.tsx
```

Expected: FAIL because there is no atlas role/name or corridor label layer yet.

- [ ] **Step 3: Add corridor seed data**

Create `src/lib/highways/sample-corridors.ts` exporting:

```ts
export type HighwayCorridor = {
  id: string;
  name: string;
  shortName: string;
  from: string;
  to: string;
  category: "expressway" | "national_highway" | "service_corridor";
  coverageStatus: "strong" | "growing" | "sparse";
  color: string;
  path: string;
  featuredStopIds: string[];
};
```

Include at least Mumbai-Pune Expressway, NH48, NH44, NH65, NH19 with schematic SVG paths.

- [ ] **Step 4: Render atlas map**

Update `MapCanvas.tsx` so the no-key/default surface is a dark Swachh atlas:

- `role="img" aria-label="Swachh national highway atlas"` on the SVG/map region.
- India silhouette.
- Corridor paths from `sampleHighwayCorridors`.
- Text labels for corridor names.
- Custom stop buttons sized at least `h-11 w-11`.
- Legend text for verified, women-friendly, toll/food/fuel/public categories.
- Reduced-motion-safe animation classes only where meaningful.

- [ ] **Step 5: Verify green**

Run:

```bash
npm run test -- src/components/map/MapCanvas.test.tsx
```

Expected: PASS.

---

### Task 3: Simplified Planner Form

**Files:**
- Modify: `src/components/map/HighwayPlanner.test.tsx`
- Modify: `src/components/map/HighwayPlanner.tsx`

- [ ] **Step 1: Write the failing test**

Add a planner test that expects:

```ts
render(<HighwayPlanner />);
expect(screen.getByLabelText("From")).toBeTruthy();
expect(screen.getByLabelText("To")).toBeTruthy();
expect(screen.getByLabelText("Highway or corridor")).toBeTruthy();
expect(screen.getByRole("button", { name: "Find clean stops" })).toBeTruthy();
expect(screen.queryByRole("tab", { name: /city start/i })).toBeNull();
expect(screen.queryByRole("tab", { name: /on highway/i })).toBeNull();
expect(screen.getByText("Expressway Food Plaza")).toBeTruthy();
```

- [ ] **Step 2: Verify red**

Run:

```bash
npm run test -- src/components/map/HighwayPlanner.test.tsx
```

Expected: FAIL because current labels/buttons/tabs are still the old planner UI.

- [ ] **Step 3: Implement the simplified form**

Update `HighwayPlanner.tsx`:

- Remove `Tabs`, `TabsList`, `TabsTrigger`, `LocateFixed`, and old route-mode handlers.
- Rename labels to `From`, `To`, and `Highway or corridor`.
- Change submit copy to `Find clean stops`.
- Initialize `searched` so atlas stops are visible by default.
- Render the trip-context alert as guidance, not as a replacement for the stop list.
- Keep submission form behavior unchanged.

- [ ] **Step 4: Verify green**

Run:

```bash
npm run test -- src/components/map/HighwayPlanner.test.tsx
```

Expected: PASS.

---

### Task 4: Full Verification

**Files:**
- No planned code edits unless verification reveals a regression.

- [ ] **Step 1: Run focused tests**

```bash
npm run test -- src/lib/routes/route-search.test.ts src/components/map/MapCanvas.test.tsx src/components/map/HighwayPlanner.test.tsx
```

Expected: all focused tests pass.

- [ ] **Step 2: Run suite checks**

```bash
npm run lint
npm run typecheck
npm run test
npm run build
```

Expected: all commands exit 0.

- [ ] **Step 3: Browser smoke**

Open `http://localhost:3000/` and confirm:

- First screen is a dark Swachh highway atlas, not a stock Google-looking map.
- Seeded stops are visible before changing route inputs.
- City/Highway tabs are gone.
- Form reads From / To / Highway or corridor.
- Submission sheet still opens.

---

## Self-Review

- Spec coverage: atlas home, all seeded stops, lit corridors, simplified input, no WhatsApp production work, and no on-road cockpit are all represented.
- Placeholder scan: no TBD/TODO/fill-later instructions.
- Type consistency: corridor model and names are defined before usage.
- User constraints: no subagents and no commits are explicit. TDD red-green is required for every behavior-bearing task.
