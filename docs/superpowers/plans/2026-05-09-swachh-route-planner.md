# Swachh Route Planner Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first approved Swachh slice: a highway-first route planner backed by curated seed stops and Google `place_id` matching rules.

**Architecture:** Keep the first slice local-data-first with strict Google compliance boundaries. Seed CSV files define trusted proxy brands and curated stop candidates; TypeScript domain modules parse, validate, match, filter, and rank those records; Next.js API/UI layers consume those modules without storing disallowed Google fields.

**Tech Stack:** Next.js App Router, TypeScript, Tailwind CSS, Vitest, Playwright, Google Maps Platform integration stubs, Supabase-ready data model.

---

## Preflight

- [ ] **Step 1: Use an isolated worktree before implementation**

Run the `using-git-worktrees` skill before executing tasks. Use branch name `feature/seeded-route-planner`.

- [ ] **Step 2: Verify the baseline**

Run:

```bash
npm run lint
npm run typecheck
npm run test
npm run build
npm run test:e2e
```

Expected: all commands pass before implementation starts.

---

### Task 1: Seed Catalog Files And Validation

**Files:**
- Create: `data/highway-proxy-brands.csv`
- Create: `data/curated-stop-candidates.csv`
- Create: `src/lib/seeds/seed-records.test.ts`
- Create: `src/lib/seeds/seed-records.ts`

- [ ] **Step 1: Write the failing validation test**

Create `src/lib/seeds/seed-records.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import {
  buildGoogleSearchText,
  parseCuratedStopCsv,
  parseProxyBrandCsv,
} from "./seed-records";

describe("seed records", () => {
  it("parses proxy brand CSV rows into trusted hygiene proxy records", () => {
    const records = parseProxyBrandCsv(`brand_name,region,proxy_type,default_confidence,notes
Cube Stop,Pan-India,wayside_amenity,0.9,Dedicated Wash Stop with staffed restroom operations
Shell Select,Pan-India,fuel_cafe,0.78,Clean fuel station restroom proxy`);

    expect(records).toEqual([
      {
        brandName: "Cube Stop",
        region: "Pan-India",
        proxyType: "wayside_amenity",
        defaultConfidence: 0.9,
        notes: "Dedicated Wash Stop with staffed restroom operations",
      },
      {
        brandName: "Shell Select",
        region: "Pan-India",
        proxyType: "fuel_cafe",
        defaultConfidence: 0.78,
        notes: "Clean fuel station restroom proxy",
      },
    ]);
  });

  it("parses curated stop candidates with route context", () => {
    const records = parseCuratedStopCsv(`name,region,proxy_type,highway_context,route_context,locality_hint,default_confidence,notes
Lavato,South India,premium_lavatory,NH-44,Krishnagiri toll plaza,Krishnagiri,0.95,Premium AC lavatory service near toll plaza`);

    expect(records[0]).toMatchObject({
      name: "Lavato",
      highwayContext: "NH-44",
      routeContext: "Krishnagiri toll plaza",
      localityHint: "Krishnagiri",
      defaultConfidence: 0.95,
    });
  });

  it("builds a Google Places search string from app-owned seed context", () => {
    expect(
      buildGoogleSearchText({
        name: "Lavato",
        highwayContext: "NH-44",
        routeContext: "Krishnagiri toll plaza",
        localityHint: "Krishnagiri",
      }),
    ).toBe("Lavato NH-44 Krishnagiri toll plaza Krishnagiri India");
  });

  it("rejects confidence values outside 0 to 1", () => {
    expect(() =>
      parseProxyBrandCsv(`brand_name,region,proxy_type,default_confidence,notes
Bad Brand,Pan-India,fuel_cafe,3,Invalid confidence`),
    ).toThrow("default_confidence must be between 0 and 1");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
npm run test -- src/lib/seeds/seed-records.test.ts
```

Expected: FAIL because `src/lib/seeds/seed-records.ts` does not exist.

- [ ] **Step 3: Implement minimal seed parsing**

Create `src/lib/seeds/seed-records.ts`:

```ts
export type ProxyBrandRecord = {
  brandName: string;
  region: string;
  proxyType: string;
  defaultConfidence: number;
  notes: string;
};

export type CuratedStopRecord = {
  name: string;
  region: string;
  proxyType: string;
  highwayContext: string;
  routeContext: string;
  localityHint: string;
  defaultConfidence: number;
  notes: string;
};

type SearchTextInput = Pick<CuratedStopRecord, "name" | "highwayContext" | "routeContext" | "localityHint">;

export function parseProxyBrandCsv(csv: string): ProxyBrandRecord[] {
  return parseCsvRows(csv).map((row) => {
    const defaultConfidence = parseConfidence(row.default_confidence);
    return {
      brandName: required(row.brand_name, "brand_name"),
      region: required(row.region, "region"),
      proxyType: required(row.proxy_type, "proxy_type"),
      defaultConfidence,
      notes: required(row.notes, "notes"),
    };
  });
}

export function parseCuratedStopCsv(csv: string): CuratedStopRecord[] {
  return parseCsvRows(csv).map((row) => ({
    name: required(row.name, "name"),
    region: required(row.region, "region"),
    proxyType: required(row.proxy_type, "proxy_type"),
    highwayContext: required(row.highway_context, "highway_context"),
    routeContext: required(row.route_context, "route_context"),
    localityHint: required(row.locality_hint, "locality_hint"),
    defaultConfidence: parseConfidence(row.default_confidence),
    notes: required(row.notes, "notes"),
  }));
}

export function buildGoogleSearchText(input: SearchTextInput): string {
  return [input.name, input.highwayContext, input.routeContext, input.localityHint, "India"]
    .map((part) => part.trim())
    .filter(Boolean)
    .join(" ");
}

function parseCsvRows(csv: string): Record<string, string>[] {
  const lines = csv.trim().split(/\r?\n/).filter(Boolean);
  const headers = splitCsvLine(lines[0]);
  return lines.slice(1).map((line) => {
    const cells = splitCsvLine(line);
    return Object.fromEntries(headers.map((header, index) => [header, cells[index] ?? ""]));
  });
}

function splitCsvLine(line: string): string[] {
  const cells: string[] = [];
  let current = "";
  let quoted = false;

  for (const char of line) {
    if (char === '"') {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      cells.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }

  cells.push(current.trim());
  return cells;
}

function parseConfidence(value: string): number {
  const confidence = Number(value);
  if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1) {
    throw new Error("default_confidence must be between 0 and 1");
  }
  return confidence;
}

function required(value: string, field: string): string {
  if (!value.trim()) {
    throw new Error(`${field} is required`);
  }
  return value.trim();
}
```

- [ ] **Step 4: Add seed CSV files**

Create `data/highway-proxy-brands.csv` with these rows:

```csv
brand_name,region,proxy_type,default_confidence,notes
McDonald's,Pan-India,qsr,0.76,International QSR baseline for premium highway food courts and fuel stations
Burger King,Pan-India,qsr,0.74,International QSR baseline for premium highway food courts and fuel stations
KFC,Pan-India,qsr,0.72,International QSR baseline for premium highway food courts and fuel stations
Pizza Hut,Pan-India,qsr,0.7,International QSR baseline for premium highway food courts and fuel stations
Costa Coffee,Pan-India,cafe,0.72,Cafe proxy for premium wayside amenities
Cube Stop,Pan-India,wayside_amenity,0.9,Dedicated Wash Stop with staffed restroom operations
PATH Recharge,Pan-India,wayside_amenity,0.88,Premium wayside amenities on expressway corridors
Village Food Courts,Pan-India,food_plaza,0.86,Large mall-like wayside amenities with premium restrooms
Shell Select,Pan-India,fuel_cafe,0.78,Clean fuel station restroom proxy with snacks and cafe
Shell Cafe,Pan-India,fuel_cafe,0.78,Clean fuel station restroom proxy with snacks and cafe
Jio-bp,Pan-India,fuel_station,0.8,Modern mobility station with regularly sanitized washrooms
Wild Bean Cafe,Pan-India,fuel_cafe,0.78,Cafe attached to Jio-bp style mobility stations
Indian Oil Swagat,Pan-India,fuel_wayside,0.76,Flagship wayside amenity and COCO pump restroom proxy
BPCL Ghar,Pan-India,fuel_wayside,0.76,One Stop Trucker Shop and value-added rest stop proxy
Reliance,Pan-India,fuel_station,0.78,Frequent road-tripper proxy for maintained standalone washrooms
Nayara Energy,Pan-India,fuel_station,0.78,Frequent road-tripper proxy for maintained standalone washrooms
Hotel Highway King,North & West India,restaurant_proxy,0.86,Family highway restaurant with parking and reliable restrooms
Honest Restaurant,North & West India,restaurant_proxy,0.82,Gujarat highway chain with air-conditioned family facilities
Gallops Food Plaza,North & West India,food_plaza,0.86,Large organized Gujarat food plaza with maintained lavatory blocks
SN Highway Food Mall,North & West India,food_plaza,0.84,Organized Gujarat food mall with maintained lavatory blocks
Haldiram's,North & West India,restaurant_proxy,0.78,Organized family restaurant proxy on North Indian highways
Nirula's,North & West India,restaurant_proxy,0.74,Historic organized stop on North Indian routes
Bikanervala,North & West India,restaurant_proxy,0.76,Organized family restaurant proxy on North Indian highways
Cheetal Grand,North & West India,food_plaza,0.88,Known family stop on NH-58 with reliable sanitation
Shree Rathnam,North & West India,restaurant_proxy,0.74,Vegetarian family dining proxy on Delhi/NCR highway routes
Shree Datta Snacks,North & West India,restaurant_proxy,0.82,Premium vegetarian highway stop proxy in Maharashtra corridors
Vithal Kamats,North & West India,restaurant_proxy,0.8,Premium vegetarian highway stop proxy in Maharashtra corridors
PIK N GO,South India,restaurant_proxy,0.82,Sanitized washroom and EV charging proxy on major South India routes
Adyar Ananda Bhavan,South India,restaurant_proxy,0.82,A2B organized highway dining proxy in Tamil Nadu
Kamat Lokaruchi,South India,restaurant_proxy,0.82,Organized stop on Bengaluru-Mysore and Bengaluru-Coorg routes
Azad Hind Dhaba,East & Central India,restaurant_proxy,0.78,Organized family dhaba chain on NH-19 routes
National Highway Dhaba,North-East India,restaurant_proxy,0.82,Trusted organized stop on Guwahati-Shillong route
```

Create `data/curated-stop-candidates.csv` with these rows:

```csv
name,region,proxy_type,highway_context,route_context,locality_hint,default_confidence,notes
Lavato,South India,premium_lavatory,NH-44,Krishnagiri toll plaza,Krishnagiri,0.95,Premium AC lavatory service near toll plaza
7 Midway Plaza,South India,food_plaza,NH-65,Hyderabad-Vijayawada,Suryapet corridor,0.9,Large food court praised for clean toilets
Raju Gari Thota,South India,food_plaza,NH-65,Hyderabad-Vijayawada,Vijayawada corridor,0.86,Highly rated clean stop on Hyderabad-Vijayawada stretch
Big Bay India,South India,food_plaza,NH-44,Bengaluru Airport corridor,Devanahalli,0.86,Large highway food mall with hygienic restroom proxy
Hotel Highway King,North & West India,restaurant_proxy,NH-48,Delhi-Jaipur and Jaipur-Ajmer,Neemrana Bagru Shahpura Kishangarh,0.86,Sprawling family restaurant locations with parking and spotless restrooms
Cheetal Grand,North & West India,food_plaza,NH-58,Delhi-Haridwar,Khatauli,0.88,Known family stop with reliable sanitation
Gallops Food Plaza,North & West India,food_plaza,Gujarat highways,Rajkot-Ahmedabad,Gujarat,0.86,Large organized food plaza with maintained lavatory blocks
SN Highway Food Mall,North & West India,food_plaza,Gujarat highways,Rajkot-Ahmedabad,Gujarat,0.84,Organized highway food mall with maintained lavatory blocks
Shree Datta Snacks,North & West India,restaurant_proxy,Mumbai-Pune Expressway,Mumbai-Pune,Khalapur Lonavala,0.82,Premium vegetarian stop with separate clean washrooms
Vithal Kamats,North & West India,restaurant_proxy,Panvel-Goa highway,Panvel-Goa,Konkan corridor,0.8,Vegetarian highway stop with clean washrooms
Hotel Kamat Lokaruchi,South India,restaurant_proxy,Bengaluru-Mysore route,Bengaluru-Mysore,Ramanagara,0.84,Traditional but organized stop with reliable facilities
National Highway Dhaba,North-East India,restaurant_proxy,Guwahati-Shillong route,Guwahati-Shillong,Nongpoh,0.82,Trusted organized stop for hygienic local food and clean restrooms
Gargi Surya Vihar,East & Central India,restaurant_proxy,NH-19,Aurangabad Bihar,Aurangabad Bihar,0.84,Road-tripper recommended stop specifically for clean restrooms
Azad Hind Dhaba,East & Central India,restaurant_proxy,NH-19,Kolkata outbound routes,West Bengal,0.78,Organized family-friendly dhaba chain
```

- [ ] **Step 5: Run tests and commit**

Run:

```bash
npm run test -- src/lib/seeds/seed-records.test.ts
npm run test
```

Expected: both commands pass.

Commit:

```bash
git add data src/lib/seeds
git commit -m "feat: add highway seed catalog"
```

---

### Task 2: Google Place Matching Policy

**Files:**
- Create: `src/lib/google/place-matching.test.ts`
- Create: `src/lib/google/place-matching.ts`
- Modify: `src/lib/google/place-policy.ts`

- [ ] **Step 1: Write the failing policy test**

Create `src/lib/google/place-matching.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import {
  buildTextSearchRequest,
  toStoredPlaceMatch,
  type GooglePlaceTextSearchResult,
} from "./place-matching";

describe("Google place matching", () => {
  it("builds a Places Text Search request from curated app-owned context", () => {
    expect(
      buildTextSearchRequest({
        name: "Lavato",
        highwayContext: "NH-44",
        routeContext: "Krishnagiri toll plaza",
        localityHint: "Krishnagiri",
      }),
    ).toEqual({
      textQuery: "Lavato NH-44 Krishnagiri toll plaza Krishnagiri India",
      regionCode: "IN",
      includedType: "establishment",
    });
  });

  it("stores only place_id plus Swachh-owned annotations", () => {
    const googleResult: GooglePlaceTextSearchResult = {
      id: "ChIJ-example",
      displayName: { text: "Lavato Premium Toilets" },
      formattedAddress: "NH-44, Tamil Nadu",
      rating: 4.6,
    };

    expect(
      toStoredPlaceMatch(googleResult, {
        seedName: "Lavato",
        highwayContext: "NH-44",
        routeContext: "Krishnagiri toll plaza",
        restroomConfidence: 0.95,
      }),
    ).toEqual({
      placeId: "ChIJ-example",
      seedName: "Lavato",
      highwayContext: "NH-44",
      routeContext: "Krishnagiri toll plaza",
      restroomConfidence: 0.95,
    });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
npm run test -- src/lib/google/place-matching.test.ts
```

Expected: FAIL because `place-matching.ts` does not exist.

- [ ] **Step 3: Implement the matching policy module**

Create `src/lib/google/place-matching.ts`:

```ts
import { buildGoogleSearchText } from "@/lib/seeds/seed-records";

export type PlaceSearchSeed = {
  name: string;
  highwayContext: string;
  routeContext: string;
  localityHint: string;
};

export type GooglePlaceTextSearchRequest = {
  textQuery: string;
  regionCode: "IN";
  includedType: "establishment";
};

export type GooglePlaceTextSearchResult = {
  id: string;
  displayName?: { text?: string };
  formattedAddress?: string;
  rating?: number;
};

export type StoredPlaceMatchInput = {
  seedName: string;
  highwayContext: string;
  routeContext: string;
  restroomConfidence: number;
};

export type StoredPlaceMatch = StoredPlaceMatchInput & {
  placeId: string;
};

export function buildTextSearchRequest(seed: PlaceSearchSeed): GooglePlaceTextSearchRequest {
  return {
    textQuery: buildGoogleSearchText(seed),
    regionCode: "IN",
    includedType: "establishment",
  };
}

export function toStoredPlaceMatch(
  result: GooglePlaceTextSearchResult,
  annotations: StoredPlaceMatchInput,
): StoredPlaceMatch {
  if (!result.id.trim()) {
    throw new Error("Google place result is missing id");
  }

  return {
    placeId: result.id,
    seedName: annotations.seedName,
    highwayContext: annotations.highwayContext,
    routeContext: annotations.routeContext,
    restroomConfidence: annotations.restroomConfidence,
  };
}
```

Update `src/lib/google/place-policy.ts` so its stored reference type matches this policy:

```ts
export const permittedStoredGooglePlaceFields = ["place_id"] as const;

export type StoredGooglePlaceReference = {
  placeId: string;
  seedName?: string;
  highwayContext?: string;
  routeContext?: string;
  restroomConfidence?: number;
};

export function toStoredGooglePlaceReference(input: StoredGooglePlaceReference): StoredGooglePlaceReference {
  return {
    placeId: input.placeId,
    seedName: input.seedName,
    highwayContext: input.highwayContext,
    routeContext: input.routeContext,
    restroomConfidence: input.restroomConfidence,
  };
}
```

- [ ] **Step 4: Run tests and commit**

Run:

```bash
npm run test -- src/lib/google/place-matching.test.ts
npm run test
```

Expected: both commands pass.

Commit:

```bash
git add src/lib/google src/lib/seeds
git commit -m "feat: add Google place matching policy"
```

---

### Task 3: Route Search Uses Seed Stops

**Files:**
- Modify: `src/lib/restrooms/sample-stops.ts`
- Modify: `src/lib/routes/route-search.test.ts`
- Modify: `src/lib/routes/route-search.ts`

- [ ] **Step 1: Write the failing route-search seed behavior test**

Replace `src/lib/routes/route-search.test.ts` with:

```ts
import { describe, expect, it } from "vitest";

import { buildRouteSearchResponse } from "./route-search";

describe("buildRouteSearchResponse", () => {
  it("withholds stop results for a dense city query without trip context", () => {
    const response = buildRouteSearchResponse({
      origin: "Bandra West, Mumbai",
      destination: "",
      highwayName: "",
      isInsideCity: true,
      distanceToHighwayMeters: 9_000,
    });

    expect(response.intent.mode).toBe("ask-for-trip");
    expect(response.stops).toEqual([]);
  });

  it("returns curated Mumbai-Pune highway stops when the traveler supplies a destination", () => {
    const response = buildRouteSearchResponse({
      origin: "Mumbai",
      destination: "Pune",
      highwayName: "Mumbai-Pune Expressway",
      isInsideCity: true,
      distanceToHighwayMeters: 9_000,
    });

    expect(response.intent.mode).toBe("plan-route");
    expect(response.stops.map((stop) => stop.name)).toContain("Shree Datta Snacks");
    expect(response.stops.every((stop) => stop.highway !== "None")).toBe(true);
  });

  it("returns NH-65 stops for Hyderabad to Vijayawada route context", () => {
    const response = buildRouteSearchResponse({
      origin: "Hyderabad",
      destination: "Vijayawada",
      highwayName: "NH-65",
      isInsideCity: true,
      distanceToHighwayMeters: 8_000,
    });

    expect(response.stops.map((stop) => stop.name)).toEqual(expect.arrayContaining(["7 Midway Plaza", "Raju Gari Thota"]));
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
npm run test -- src/lib/routes/route-search.test.ts
```

Expected: FAIL because current sample data does not include the curated seed stop names.

- [ ] **Step 3: Replace sample stops with curated stop-derived records**

Update `src/lib/restrooms/sample-stops.ts` so it exports highway stops named `Shree Datta Snacks`, `7 Midway Plaza`, `Raju Gari Thota`, `Lavato`, and `Hotel Highway King`. Each record must include real app-owned fields already used by `HighwayPlanner`: `id`, `name`, `category`, `distanceFromRouteMeters`, `distanceFromHighwayMeters`, `detourMinutes`, `isEndpointStagingArea`, `isInsideDenseCity`, `source`, `confidence`, `openNow`, `verified`, `lat`, `lng`, `highway`, `locality`, `priceLabel`, and `facilities`.

Use this exact first record for Mumbai-Pune:

```ts
{
  id: "shree-datta-snacks-mumbai-pune",
  name: "Shree Datta Snacks",
  category: "restaurant_proxy",
  distanceFromRouteMeters: 240,
  distanceFromHighwayMeters: 120,
  detourMinutes: 4,
  isEndpointStagingArea: false,
  isInsideDenseCity: false,
  source: "crowdsourced",
  confidence: 0.82,
  openNow: true,
  verified: true,
  lat: 18.764,
  lng: 73.376,
  highway: "Mumbai-Pune Expressway",
  locality: "Khalapur-Lonavala service corridor",
  priceLabel: "Customer access",
  facilities: ["Vegetarian", "Parking", "Separate washrooms"],
}
```

- [ ] **Step 4: Filter stops by route text**

Update `src/lib/routes/route-search.ts` so `buildRouteSearchResponse` ranks only stops whose `highway`, `locality`, `origin`, `destination`, or `highwayName` text overlaps. Preserve the current city-only `ask-for-trip` behavior.

Add helper logic:

```ts
function routeMatchesStop(input: RouteSearchInput, stop: HighwayStop): boolean {
  const routeText = normalize([input.origin, input.destination, input.highwayName].join(" "));
  const stopText = normalize([stop.highway, stop.locality, stop.name].join(" "));
  const routeTokens = routeText.split(" ").filter((token) => token.length >= 3);
  return routeTokens.some((token) => stopText.includes(token));
}

function normalize(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}
```

- [ ] **Step 5: Run tests and commit**

Run:

```bash
npm run test -- src/lib/routes/route-search.test.ts
npm run test
```

Expected: both commands pass.

Commit:

```bash
git add src/lib/restrooms src/lib/routes
git commit -m "feat: rank curated highway stops by route"
```

---

### Task 4: Place Matching API Stub

**Files:**
- Create: `src/app/api/google/place-match/route.test.ts`
- Create: `src/app/api/google/place-match/route.ts`
- Modify: `vitest.config.ts` if needed for route handler tests.

- [ ] **Step 1: Write the failing API route test**

Create `src/app/api/google/place-match/route.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { POST } from "./route";

describe("POST /api/google/place-match", () => {
  it("returns a compliant text search request without calling Google", async () => {
    const response = await POST(
      new Request("http://localhost/api/google/place-match", {
        method: "POST",
        body: JSON.stringify({
          name: "Lavato",
          highwayContext: "NH-44",
          routeContext: "Krishnagiri toll plaza",
          localityHint: "Krishnagiri",
        }),
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      request: {
        textQuery: "Lavato NH-44 Krishnagiri toll plaza Krishnagiri India",
        regionCode: "IN",
        includedType: "establishment",
      },
    });
  });

  it("rejects incomplete seed records", async () => {
    const response = await POST(
      new Request("http://localhost/api/google/place-match", {
        method: "POST",
        body: JSON.stringify({ name: "Lavato" }),
      }),
    );

    expect(response.status).toBe(400);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
npm run test -- src/app/api/google/place-match/route.test.ts
```

Expected: FAIL because the route does not exist.

- [ ] **Step 3: Implement the API stub**

Create `src/app/api/google/place-match/route.ts`:

```ts
import { NextResponse } from "next/server";
import { z } from "zod";

import { buildTextSearchRequest } from "@/lib/google/place-matching";

const placeMatchSchema = z.object({
  name: z.string().min(1),
  highwayContext: z.string().min(1),
  routeContext: z.string().min(1),
  localityHint: z.string().min(1),
});

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const parsed = placeMatchSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid place match seed" }, { status: 400 });
  }

  return NextResponse.json({ request: buildTextSearchRequest(parsed.data) });
}
```

- [ ] **Step 4: Run tests and commit**

Run:

```bash
npm run test -- src/app/api/google/place-match/route.test.ts
npm run test
```

Expected: both commands pass.

Commit:

```bash
git add src/app/api/google src/lib/google
git commit -m "feat: add place matching API stub"
```

---

### Task 5: Map-First UI Uses Curated Stops

**Files:**
- Modify: `src/components/map/HighwayPlanner.tsx`
- Modify: `tests/e2e/home.spec.ts`

- [ ] **Step 1: Write the failing Playwright expectation**

Update `tests/e2e/home.spec.ts` so the first test expects `Shree Datta Snacks` instead of the old placeholder stop:

```ts
await expect(
  page.getByRole("region", { name: "Restroom stops" }).getByRole("button", { name: /Shree Datta Snacks/ }),
).toBeVisible();
```

Add a second route query assertion:

```ts
await page.getByLabel("Start").fill("Hyderabad");
await page.getByLabel("Destination").fill("Vijayawada");
await page.getByLabel("Highway").fill("NH-65");
await page.getByRole("button", { name: "Plan stops" }).click();
await expect(page.getByRole("region", { name: "Restroom stops" }).getByText("7 Midway Plaza")).toBeVisible();
```

- [ ] **Step 2: Run Playwright to verify it fails**

Run:

```bash
npm run test:e2e
```

Expected: FAIL until the UI default selected stop and seeded route search expose the curated names.

- [ ] **Step 3: Update UI defaults and selected stop handling**

In `src/components/map/HighwayPlanner.tsx`:

- Set the default `selectedStopId` to `shree-datta-snacks-mumbai-pune`.
- Remove any old placeholder assumptions tied to `mumbai-pune-food-plaza`.
- Keep the city-only prompt behavior unchanged.

Use this default state line:

```ts
const [selectedStopId, setSelectedStopId] = useState("shree-datta-snacks-mumbai-pune");
```

Use this highway mode fallback:

```ts
setSelectedStopId(response.stops[0]?.id ?? "shree-datta-snacks-mumbai-pune");
```

- [ ] **Step 4: Run e2e and commit**

Run:

```bash
npm run test:e2e
```

Expected: 2 Playwright tests pass.

Commit:

```bash
git add src/components/map tests/e2e
git commit -m "feat: show curated highway stops in planner"
```

---

### Task 6: Documentation And Final Verification

**Files:**
- Modify: `README.md`
- Modify: `.env.example`
- Modify: `docs/superpowers/specs/2026-05-09-swachh-route-planner-design.md` only if implementation clarified wording.

- [ ] **Step 1: Update README with the first-slice workflow**

Add this section to `README.md`:

```md
## First Slice

Swachh starts with a curated route planner. Known highway restroom proxy brands and route-specific stop candidates live in CSV files under `data/`. The app uses those records to show highway-relevant restroom stops for a trip and asks for destination context when a user is inside a city.

Google-derived place data must be handled carefully. Store only Google `place_id` plus Swachh-owned annotations such as route context, category, restroom confidence, and notes. Fetch live Google details only when needed.
```

- [ ] **Step 2: Update `.env.example` with Google API notes**

Ensure `.env.example` contains:

```text
NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=
GOOGLE_MAPS_SERVER_API_KEY=
```

- [ ] **Step 3: Run full verification**

Run:

```bash
npm run lint
npm run typecheck
npm run test
npm run build
npm run test:e2e
```

Expected:

- ESLint exits 0.
- TypeScript exits 0.
- Vitest reports all tests passing.
- Next build compiles `/`, `/admin`, `/api/routes/search`, `/api/whatsapp/webhook`, and `/api/google/place-match`.
- Playwright reports all e2e tests passing.

- [ ] **Step 4: Commit docs and run final review**

Commit:

```bash
git add README.md .env.example docs/superpowers/specs
git commit -m "docs: document curated route planner workflow"
```

Then use `requesting-code-review` for the completed feature branch before merging or opening a PR.

---

## Plan Self-Review

- Spec coverage: tasks cover seed records, Google matching policy, route filtering, UI route planner behavior, compliance docs, and verification.
- Scope: this plan intentionally excludes crowdsourcing, production WhatsApp, and Supabase import, matching the approved first slice.
- TDD: each behavior-bearing task begins with a failing test and requires confirming it fails before implementation.
- Type consistency: seed records use `defaultConfidence`; app stops use existing `confidence`; Google storage uses `placeId` and app-owned annotations only.