import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("initial Supabase migration", () => {
  const migrationSql = readFileSync(
    join(process.cwd(), "supabase/migrations/202605090001_initial_schema.sql"),
    "utf8",
  );

  it("checks admin status through a security definer helper", () => {
    expect(migrationSql).toContain("function public.is_admin()");
    expect(migrationSql).toContain("security definer");
  });

  it("does not query admin_users directly from policy bodies", () => {
    const policyStatements = migrationSql.match(/create policy[\s\S]*?;/gi) ?? [];
    const recursivePolicies = policyStatements.filter((statement) =>
      statement.toLowerCase().includes("from public.admin_users"),
    );

    expect(recursivePolicies).toEqual([]);
  });
});