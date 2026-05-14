import { execFile } from "node:child_process";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);

describe("resolve-place-locations script", () => {
  it("prints a plan-only summary without Google or Supabase env", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "swachh-resolver-"));
    const curatedPath = join(tempDir, "curated.json");
    const osmPath = join(tempDir, "osm.json");
    const overturePath = join(tempDir, "overture.json");

    await writeFile(curatedPath, JSON.stringify([{ id: "curated-1", seed_name: "Lavato Krishnagiri" }]));
    await writeFile(osmPath, JSON.stringify([]));
    await writeFile(overturePath, JSON.stringify([]));

    const { stdout } = await execFileAsync(
      "node",
      [
        "--experimental-transform-types",
        "scripts/resolve-place-locations.ts",
        "--plan-only",
        `--curated=${curatedPath}`,
        `--osm=${osmPath}`,
        `--overture=${overturePath}`,
      ],
      {
        cwd: process.cwd(),
        env: { ...process.env, SUPABASE_SERVICE_ROLE_KEY: "" },
      },
    );

    expect(JSON.parse(stdout)).toMatchObject({
      planOnly: true,
      curatedRows: 1,
      osmCandidates: 0,
      overtureCandidates: 0,
      googleDetailsRequests: 0,
    });
  });
});