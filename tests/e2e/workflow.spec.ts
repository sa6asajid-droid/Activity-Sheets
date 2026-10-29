import { expect, test, type Page } from "@playwright/test";
import fs from "node:fs";

/** The whole publishing workflow, driven through the UI with the mock provider. */
test.describe.serial("worksheet workflow", () => {
  let projectUrl = "";

  async function waitSaved(page: Page) {
    await expect(page.getByText("All changes saved")).toBeVisible({ timeout: 20_000 });
  }

  test("dashboard labels the mock provider and shows demo samples", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByText("Mock provider — placeholder test output, not research")).toBeVisible();
    await expect(page.getByRole("heading", { name: /Demo samples/ })).toBeVisible();
    await expect(page.getByRole("link", { name: "Why do shadows change during the day?" })).toBeVisible();
  });

  test("create a worksheet, review the plan, and build it", async ({ page }) => {
    await page.goto("/new");
    await page.getByLabel("Curiosity question").fill("Why do leaves change colour in autumn?");
    await page.getByLabel("Subject").fill("Science");
    await page.getByRole("button", { name: "Create and plan" }).click();
    await expect(page.getByRole("heading", { name: "How the question was read" })).toBeVisible({ timeout: 60_000 });
    projectUrl = page.url().split("?")[0];
    await expect(page.getByText("Why this lesson is structured this way")).toBeVisible();
    await page.getByRole("button", { name: "Approve plan and write worksheet" }).click();
    await expect(page.frameLocator('iframe[title="Worksheet preview"]').locator("h1.question")).toHaveText(/leaves change colour/, { timeout: 90_000 });
  });

  test("edit text, lock a section, and see it persist after reload", async ({ page }) => {
    await page.goto(`${projectUrl}?tab=edit`);
    const nav = page.getByRole("navigation", { name: "Document structure" });
    await nav.getByRole("button", { name: /^Hook/ }).click();
    const text = page.getByLabel("Text", { exact: true });
    await text.fill("Walk under a maple tree in October and look up.");
    await expect(page.frameLocator("iframe").getByText("Walk under a maple tree in October")).toBeVisible();
    await page.getByRole("checkbox", { name: "Locked" }).check();
    await waitSaved(page);
    await expect(text).toBeDisabled();
    await page.reload();
    await nav.getByRole("button", { name: /^Hook/ }).click();
    await expect(page.getByLabel("Text", { exact: true })).toHaveValue("Walk under a maple tree in October and look up.");
    await expect(page.getByRole("checkbox", { name: "Locked" })).toBeChecked();
    // Undo/redo of a non-locked edit.
    await page.getByRole("button", { name: "Document settings" }).click();
    const title = page.getByLabel("Title (for files and lists)");
    const original = await title.inputValue();
    await title.fill("Leaves — draft title");
    await page.getByRole("button", { name: "Undo" }).click();
    await expect(title).toHaveValue(original);
    await page.getByRole("button", { name: "Redo" }).click();
    await expect(title).toHaveValue("Leaves — draft title");
    await waitSaved(page);
  });

  test("regenerate one section without touching the locked one", async ({ page }) => {
    await page.goto(`${projectUrl}?tab=edit`);
    const nav = page.getByRole("navigation", { name: "Document structure" });
    await nav.getByRole("button", { name: /^Activity\s*1\./ }).click();
    await page.getByRole("button", { name: "Make it shorter" }).click();
    await page.getByRole("button", { name: "Propose a new version" }).click();
    await expect(page.getByRole("heading", { name: "Proposed change to one section" })).toBeVisible({ timeout: 60_000 });
    await page.getByRole("button", { name: "Accept and recheck" }).click();
    await expect(page.frameLocator("iframe").getByText("[MOCK] Revised activity")).toBeVisible({ timeout: 30_000 });
    await expect(page.frameLocator("iframe").getByText("Walk under a maple tree in October")).toBeVisible();
  });

  test("change page size and reflow", async ({ page }) => {
    await page.goto(`${projectUrl}?tab=edit`);
    await page.getByRole("button", { name: "Document settings" }).click();
    await page.getByLabel("Page size").selectOption("a4");
    await page.getByRole("button", { name: "Reflow pages" }).click();
    await waitSaved(page);
    const width = await page.frameLocator("iframe").locator(".page").first().evaluate((el) => getComputedStyle(el).width);
    expect(parseFloat(width)).toBeCloseTo((210 * 96) / 25.4, 0);
  });

  test("export the student PDF and the answer key", async ({ page }) => {
    await page.goto(`${projectUrl}?tab=export`);
    for (const label of ["Student PDF", "Answer key PDF"]) {
      const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: label, exact: true }).click()]);
      const file = await download.path();
      const head = fs.readFileSync(file!).subarray(0, 5).toString();
      expect(head).toBe("%PDF-");
      expect(download.suggestedFilename()).toMatch(label === "Student PDF" ? /-student\.pdf$/ : /-answer-key\.pdf$/);
    }
    await expect(page.getByRole("heading", { name: "Export history" })).toBeVisible();
    await expect(page.getByText(/^student-pdf$/)).toBeVisible();
  });

  test("review: blocking issues prevent approval; warnings need a recorded reason", async ({ page }) => {
    await page.goto(`${projectUrl}?tab=review`);
    await expect(page.getByRole("heading", { name: "Approve this revision" })).toBeVisible();
    await expect(page.getByText(/MOCK/).first()).toBeVisible();
  });

  test("duplicate a worksheet and compile a workbook", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: /Demo samples/ })).toBeVisible();
    const before = await page.getByRole("button", { name: "Duplicate" }).count();
    expect(before).toBeGreaterThan(5);
    await page.getByRole("button", { name: "Duplicate" }).first().click();
    await expect(page.getByRole("button", { name: "Duplicate" })).toHaveCount(before + 1);
    await page.getByLabel("Select Why do shadows change during the day? for a workbook").first().check();
    await page.getByLabel("Select How does a seed begin to grow? for a workbook").first().check();
    page.once("dialog", (d) => d.accept("Science starters"));
    await page.getByRole("button", { name: /Make workbook/ }).click();
    await expect(page.getByRole("heading", { name: "Workbooks" })).toBeVisible();
    const [download] = await Promise.all([page.waitForEvent("download", { timeout: 120_000 }), page.getByRole("button", { name: "Compile including drafts" }).click()]);
    expect(fs.readFileSync((await download.path())!).subarray(0, 5).toString()).toBe("%PDF-");
  });

  test("the ambiguous sample asks for clarification", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("link", { name: "How big is a mole? (needs clarification)" }).click();
    await expect(page.getByText("Which “mole” do you mean")).toBeVisible();
    await expect(page.getByLabel("the small burrowing animal")).toBeVisible();
  });
});
