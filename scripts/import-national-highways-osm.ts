import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import { buildIndiaNationalHighwaysOverpassQuery, formatNationalHighwayDatasetModule, overpassJsonToCachedHighways } from "../src/lib/highways/osm-overpass.ts";

const overpassEndpoint = "https://overpass-api.de/api/interpreter";
const outputPath = join(process.cwd(), "src/data/highways/india-national-highways.ts");
const browserCacheSimplifyToleranceDegrees = 0.005;

async function main() {
  const query = buildIndiaNationalHighwaysOverpassQuery();

  if (process.argv.includes("--dry-run")) {
    console.log(JSON.stringify({ ok: true, dryRun: true, outputPath, query }, null, 2));
    return;
  }

  const response = await fetch(overpassEndpoint, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": "Swachh-NationalWeekender/0.1 OSM import (local manual cache refresh)",
    },
    body: `data=${encodeURIComponent(query)}`,
  });

  if (!response.ok) {
    throw new Error(`Overpass request failed with status ${response.status}: ${(await response.text()).slice(0, 500)}`);
  }

  const body = await response.json();
  const features = overpassJsonToCachedHighways(body, {
    groupByRef: true,
    simplifyToleranceDegrees: browserCacheSimplifyToleranceDegrees,
  });
  if (features.length === 0) {
    throw new Error("Overpass import returned zero National Highway features");
  }

  const moduleText = formatNationalHighwayDatasetModule({ generatedAt: new Date().toISOString(), features });
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, moduleText);

  console.log(JSON.stringify({ ok: true, outputPath, features: features.length, simplifyToleranceDegrees: browserCacheSimplifyToleranceDegrees }, null, 2));
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
