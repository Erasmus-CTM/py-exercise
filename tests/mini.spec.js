// tests/example.spec.js

import { test, expect } from "@playwright/test";

const TESTPAGE = "/example-mini.html";
const SLEEP_MS = 1500;
/**
 * Useful when watching in headed mode
 */
function sleep() {
  if (!SLEEP_MS) {
    return;
  }
  console.log(`sleeping ${SLEEP_MS} ms...`);

  return new Promise((resolve) => setTimeout(resolve, SLEEP_MS));
}

test("See basic text content immediately", async ({ page }) => {
  await page.goto(TESTPAGE);
  // h1 contains Title
  await expect(page.locator("h1")).toHaveText("py-exercise – Mini example");
  await expect(page.locator("#qpyodide-status-message-text")).toHaveText(
    "🟡 Loading...",
  );
});

test("Exercise UI ready after pyodide loads.", async ({ page }) => {
  // for portable testing....
  const modifierKey = process.platform === "darwin" ? "Meta" : "Control";

  await page.goto(TESTPAGE);

  // --- Watch the pyodide indicator while it loads ...
  console.log("Waiting for loading...");
  await expect(page.getByText("🟡 Loading...")).toBeVisible();

  console.log("Waiting for ready...");
  await expect(page.getByText("🟢 Ready!")).toBeVisible();

  console.log("Clicking check button...");
  await page.getByText("Check").click();
  await expect(page.getByText("❌ 0 of 3 tests passed")).toBeVisible();
  // await sleep();

  // reset should remove feedback
  console.log("Clicking reset button...");
  await page.getByText("Reset").click();
  await expect(page.getByText("❌ 0 of 3 tests passed")).not.toBeVisible();
  // await sleep();

  // --- Use code editor ---
  // -> attempt 1
  await page.getByText("def add(a, b):").click();
  // clear the text
  await page.keyboard.press(`${modifierKey}+A`);
  await page.keyboard.press("Delete");

  // some valid python (NOTE: code editor puts tab by default!)
  // this code should solve one test case only
  await page.keyboard.type("def add(a, b):\nreturn 3", {
    delay: 20,
  });

  await page.getByText("Check").click();
  await expect(page.getByText("❌ 1 of 3 tests passed")).toBeVisible();
  await sleep();

  // back to editor
  await page.getByText("def add(a, b):").click();
  // -> attempt 2
  await page.keyboard.press(`${modifierKey}+A`);
  await page.keyboard.press("Delete");

  // this code should solve all test cases
  await page.keyboard.type("def add(a, b):\nreturn a+b", {
    delay: 5,
  });

  await page.getByText("Check").click();
  await expect(page.getByText("✅ All 3 tests passed!")).toBeVisible();

  await sleep();

  // --- Download results ---
  // Start waiting for download before clicking.
  const downloadPromise = page.waitForEvent("download");
  await page.getByText("Download").click();
  // Wait for the download process to complete and save the downloaded file somewhere.
  const dl = await downloadPromise;
  await dl.saveAs("/tmp/py-exercise/" + dl.suggestedFilename());
  dl.path().then(console.log);
});
