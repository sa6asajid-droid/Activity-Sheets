import { expect, test, type Page } from "@playwright/test";
import { SAMPLES } from "../../src/lib/samples";
import { exportHtml } from "../../src/lib/render/browser";
import { autoPaginate, closeBrowser } from "../../src/lib/render/browser";
import type { WorksheetDocument } from "../../src/lib/schema/document";

/**
 * Print-layout tests. Each document is laid out with the same engine the app
 * uses, rendered in Chromium, and measured: no page may overflow (clip) in
 * any configuration, black-and-white output must contain no colour, and two
 * pages are compared against reviewed screenshot baselines.
 */

async function render(page: Page, doc: WorksheetDocument, variant: "student" | "educator" = "educator") {
  await page.setContent(exportHtml(doc, variant), { waitUntil: "load" });
  await page.waitForFunction("window.__csReady === true");
  return (await page.evaluate("window.__csLayout")) as { page: number; kind: string; overflowPx: number }[];
}

test.afterAll(async () => closeBrowser());

for (const s of SAMPLES) {
  for (const pageSize of ["letter", "a4"] as const) {
    for (const fontScale of ["standard", "large"] as const) {
      test(`${s.key} · ${pageSize} · ${fontScale} type: no clipped content`, async ({ page }) => {
        let doc = s.build();
        doc.layout = { ...doc.layout, pageSize, fontScale };
        doc = await autoPaginate(doc);
        const pages = await render(page, doc);
        expect(pages.filter((p) => p.overflowPx > 1)).toEqual([]);
      });
    }
  }
}

test("long title, long vocabulary terms and long answers do not clip", async ({ page }) => {
  let doc = SAMPLES.find((s) => s.key === "shadows")!.build();
  doc.question = "Why do the shadows of trees, buildings, lamp posts and even our own bodies keep changing their length and direction as the day goes by from early morning until late evening?";
  const vocab = doc.sections.find((s) => s.kind === "explanation")!;
  doc.sections.splice(doc.sections.indexOf(vocab) + 1, 0, {
    ...vocab,
    id: "sec-long-vocab",
    kind: "vocabulary",
    heading: "Key words",
    body: "",
    claimIds: [],
    terms: [
      { term: "photosynthetically", definition: "A deliberately long term to test wrapping in the vocabulary grid, with a definition that runs over several lines to make sure the layout keeps it readable." },
      { term: "counterclockwise", definition: "Turning the opposite way to the hands of a clock." },
    ],
  });
  const key = doc.answerKey[0];
  key.answer = Array.from({ length: 12 }, () => "A long sample response that explains the idea carefully in full sentences.").join(" ");
  doc = await autoPaginate(doc);
  const pages = await render(page, doc);
  expect(pages.filter((p) => p.overflowPx > 1)).toEqual([]);
});

test("dense diagrams fit their figures", async ({ page }) => {
  let doc = SAMPLES.find((s) => s.key === "historians")!.build();
  doc.diagrams.push({
    ...doc.diagrams[0],
    id: "fig-dense",
    spec: {
      type: "timeline",
      start: 1850,
      end: 2020,
      unitLabel: "",
      events: [1867, 1885, 1914, 1929, 1939, 1949, 1982, 2005].map((v, i) => ({ value: v, label: `Event number ${i + 1} with a longer label` })),
    },
  });
  doc.sections.push({ ...doc.sections.find((s) => s.kind === "diagram")!, id: "sec-dense", diagramId: "fig-dense", page: 9 });
  doc = await autoPaginate(doc);
  const pages = await render(page, doc, "student");
  expect(pages.filter((p) => p.overflowPx > 1)).toEqual([]);
});

test("black-and-white output contains no colour", async ({ page }) => {
  for (const s of SAMPLES) {
    let doc = s.build();
    doc.layout.colourMode = "bw";
    doc = await autoPaginate(doc);
    await render(page, doc, "student");
    await page.setViewportSize({ width: 900, height: 1200 });
    const png = await page.locator(".page").first().screenshot();
    const coloured = await page.evaluate(async (b64) => {
      const img = new Image();
      img.src = `data:image/png;base64,${b64}`;
      await img.decode();
      const c = document.createElement("canvas");
      c.width = img.width;
      c.height = img.height;
      const ctx = c.getContext("2d")!;
      ctx.drawImage(img, 0, 0);
      const d = ctx.getImageData(0, 0, c.width, c.height).data;
      let n = 0;
      for (let i = 0; i < d.length; i += 4) if (Math.max(d[i], d[i + 1], d[i + 2]) - Math.min(d[i], d[i + 1], d[i + 2]) > 24) n++;
      return n;
    }, png.toString("base64"));
    // Allow a handful of anti-aliasing pixels; real colour would be thousands.
    expect(coloured, s.key).toBeLessThan(50);
  }
});

for (const key of ["shadows", "fractions"]) {
  test(`${key} page 1 matches the reviewed baseline`, async ({ page }) => {
    await page.setViewportSize({ width: 900, height: 1200 });
    const doc = await autoPaginate(SAMPLES.find((s) => s.key === key)!.build());
    await render(page, doc, "student");
    await expect(page.locator(".page").first()).toHaveScreenshot(`${key}-p1.png`);
  });
}
