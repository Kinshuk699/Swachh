import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);

describe("import-google-curated-places script", () => {
  it("prints a plan-only strict-distance import summary without requiring Google or Supabase env", async () => {
    const { stdout } = await execFileAsync(
      "node",
      [
        "--experimental-transform-types",
        "scripts/import-google-curated-places.ts",
        "--plan-only",
        "--tier=tier_1,tier_2,tier_3",
        "--job-offset=5",
        "--max-text-search-requests=10",
        "--max-diversion-meters=750",
      ],
      {
        cwd: process.cwd(),
        env: {
          ...process.env,
          GOOGLE_MAPS_SERVER_API_KEY: "",
          NEXT_PUBLIC_SUPABASE_URL: "",
          SUPABASE_SERVICE_ROLE_KEY: "",
        },
      },
    );

    const summary = JSON.parse(stdout);

    expect(summary).toMatchObject({
      planOnly: true,
      jobOffset: 5,
      maxDiversionMeters: 750,
      maxTextSearchRequests: 10,
      cleanlinessTiers: ["tier_1", "tier_2", "tier_3"],
    });
    expect(summary.plannedTextSearchRequests).toBeGreaterThan(0);
    expect(summary).toHaveProperty("textSearchCapExceeded");
  });
});