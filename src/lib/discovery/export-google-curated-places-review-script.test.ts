import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);

describe("export-google-curated-places-review script", () => {
  it("prints help without requiring Google or Supabase env", async () => {
    const { stdout } = await execFileAsync(
      "node",
      ["--experimental-transform-types", "scripts/export-google-curated-places-review.ts", "--help"],
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

    expect(stdout).toContain("export-google-curated-places-review");
    expect(stdout).toContain("--date=YYYY-MM-DD");
    expect(stdout).toContain("0 Text Search");
  });
});