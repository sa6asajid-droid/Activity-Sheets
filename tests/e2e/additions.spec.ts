import { expect, test } from "@playwright/test";
import fs from "node:fs";
import { makePng } from "../helpers/png";

async function openSample(page: import("@playwright/test").Page, title: string, tab: string) {
  await page.goto("/");
  await page.getByRole("link", { name: title }).first().click();
  await page.getByRole("button", { name: tab, exact: true }).click();
}

test("curriculum: verbatim expectations verify, paraphrases do not", async ({ page }) => {
  await openSample(page, "Why do shadows change during the day?", "Curriculum");
  await page.getByLabel("Title").fill("Science excerpt (test)");
  await page.getByLabel("Paste the relevant text").fill("Earth and Space Systems\nB2.1 describe how the position of the Sun in the sky changes over the course of a day\nB2.2 investigate how shadows change");
  await page.getByRole("button", { name: "Add document" }).click();
  await expect(page.getByText("Science excerpt (test)")).toBeVisible();
  await page.getByRole("button", { name: "Add expectation" }).click();
  await page.getByLabel("Expectation (copy the exact wording)").fill("describe how the position of the Sun in the sky changes over the course of a day");
  await page.getByLabel("Code (only if printed in the document)").fill("B2.1");
  await page.getByRole("button", { name: "Check against document" }).click();
  await expect(page.getByText("found in document")).toBeVisible();
  await expect(page.getByText(/found word for word in the curriculum document/)).toBeVisible();
  await page.getByLabel("Expectation (copy the exact wording)").fill("explain why the Sun moves across the sky");
  await page.getByRole("button", { name: "Check against document" }).click();
  await expect(page.getByText("This wording was not found in the curriculum document. Copy it exactly.")).toBeVisible();
  await expect(page.getByText("Suggested topic alignment—not verified curriculum alignment.")).toBeVisible();
});

test("a figure can use an uploaded reviewed image", async ({ page }) => {
  await openSample(page, "How does a lever change a task?", "Edit");
  await page.getByRole("navigation", { name: "Document structure" }).getByRole("button", { name: /^Figure/ }).click();
  await page.getByLabel("Rights").selectOption("owned");
  await page.getByLabel("Upload image").setInputFiles({ name: "lever.png", mimeType: "image/png", buffer: makePng(600, 300) });
  await expect(page.getByText(/Using an uploaded PNG \(600×300 px\)/)).toBeVisible();
  await expect(page.frameLocator('iframe[title="Worksheet preview"]').locator('figure img[src*="/api/assets/"]')).toBeVisible();
  await expect(page.getByText("All changes saved")).toBeVisible({ timeout: 20_000 });
  await page.getByLabel("Replace image").setInputFiles({ name: "evil.svg", mimeType: "image/svg+xml", buffer: Buffer.from("<svg xmlns='http://www.w3.org/2000/svg'><script>alert(1)</script></svg>") });
  await expect(page.getByText("Only PNG and JPEG images can be uploaded.")).toBeVisible();
});

test("review cards can be exported", async ({ page }) => {
  await openSample(page, "What makes a fraction equivalent?", "Export");
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Review cards PDF", exact: true }).click()]);
  expect(download.suggestedFilename()).toMatch(/review-cards\.pdf$/);
  expect(fs.readFileSync((await download.path())!).subarray(0, 5).toString()).toBe("%PDF-");
});
