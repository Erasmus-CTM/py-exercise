// tests/example.spec.js

import { test, expect } from "@playwright/test";

const TESTPAGE = "/example-mini.html";
test("See basic text content immediately", async ({ page }) => {
  await page.goto(TESTPAGE);
  // h1 contains Title
  await expect(page.locator("h1")).toHaveText("py-exercise – Mini example");
  await expect(page.locator("#qpyodide-status-message-text")).toHaveText(
    "🟡 Loading...",
  );
});

test("Exercise UI ready after pyodide loads.", async ({ page }) => {
  await page.goto(TESTPAGE);

  console.log("Waiting for loading...");
  await expect(page.getByText("🟡 Loading...")).toBeVisible();

  console.log("Waiting for ready...");
  await expect(page.getByText("🟢 Ready!")).toBeVisible();

  console.log("Clicking check button...");
  await page.getByText("Check").click();

  console.log("Clicking reset button...");
  await page.getByText("Reset").click();
  await expect(page.getByText("❌ 0 of 3 tests passed")).not.toBeVisible();
});
