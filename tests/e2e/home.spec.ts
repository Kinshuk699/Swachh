import { expect, test } from "@playwright/test";

test("shows the highway-first planner", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "Highway restroom stops" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Plan stops" })).toBeVisible();
  await expect(
    page.getByRole("region", { name: "Restroom stops" }).getByRole("button", { name: /Expressway Food Plaza/ }),
  ).toBeVisible();
});

test("city-only mode asks for a destination", async ({ page }) => {
  await page.goto("/");

  await page.getByRole("button", { name: "City start" }).click();
  await page.getByLabel("Destination").fill("");
  await page.getByLabel("Highway").fill("");
  await page.getByRole("button", { name: "Plan stops" }).click();

  await expect(page.getByRole("heading", { name: "Where are you heading?" })).toBeVisible();
});
