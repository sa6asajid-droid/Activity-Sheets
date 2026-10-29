/**
 * Headless-browser layout and PDF engine (Playwright/Chromium).
 *
 * One shared browser is launched lazily and closed after a short idle period.
 * Each render gets its own context, closed in `finally`, so exports are
 * isolated from each other. Pages run with JavaScript only for our own
 * paginator script and with all network requests blocked: fonts are inlined.
 */
import fs from "node:fs";
import path from "node:path";
import type { Browser, Page } from "playwright";
import type { WorksheetDocument } from "../schema/document";
import { renderWorksheetHtml, type Variant } from "./worksheet";
import { FONT_FILES } from "./styles";
import { contentBoxMm } from "../computations";
import { packPages } from "../pipeline/assemble";
import type { LayoutEngine } from "../pipeline/pipeline";

let browserPromise: Promise<Browser> | null = null;
let idleTimer: NodeJS.Timeout | null = null;
let active = 0;

async function getBrowser(): Promise<Browser> {
  if (idleTimer) {
    clearTimeout(idleTimer);
    idleTimer = null;
  }
  if (!browserPromise) {
    browserPromise = (async () => {
      const { chromium } = await import("playwright");
      const exe = process.env.CS_CHROMIUM_PATH;
      return chromium.launch(exe ? { executablePath: exe, args: ["--no-sandbox"] } : {});
    })();
    browserPromise.catch(() => {
      browserPromise = null;
    });
  }
  return browserPromise;
}

function scheduleClose() {
  if (active > 0) return;
  idleTimer = setTimeout(async () => {
    const b = browserPromise;
    browserPromise = null;
    if (b) (await b.catch(() => null))?.close().catch(() => undefined);
  }, 30000);
  idleTimer.unref?.();
}

export async function closeBrowser() {
  const b = browserPromise;
  browserPromise = null;
  if (b) await (await b.catch(() => null))?.close().catch(() => undefined);
}

let fontCache: Record<string, string> | null = null;
export function inlineFontSrc(): (file: string) => string {
  if (!fontCache) {
    fontCache = {};
    const dir = path.join(/* turbopackIgnore: true */ process.cwd(), "public", "fonts");
    for (const f of FONT_FILES) {
      try {
        fontCache[f.file] = `data:font/woff2;base64,${fs.readFileSync(path.join(dir, f.file)).toString("base64")}`;
      } catch {
        fontCache[f.file] = "";
      }
    }
  }
  const cache = fontCache;
  return (file) => cache[file] ?? "";
}

async function withPage<T>(html: string, fn: (page: Page) => Promise<T>): Promise<T> {
  active++;
  const browser = await getBrowser();
  const context = await browser.newContext({ javaScriptEnabled: true, offline: true });
  try {
    const page = await context.newPage();
    // Belt and braces: block every network request; content is self-contained.
    await page.route("**/*", (route) => (route.request().url().startsWith("data:") ? route.continue() : route.abort()));
    await page.setContent(html, { waitUntil: "load", timeout: 30000 });
    await page.waitForFunction("window.__csReady === true", null, { timeout: 30000 });
    return await fn(page);
  } finally {
    await context.close().catch(() => undefined);
    active--;
    scheduleClose();
  }
}

export interface MeasuredPage {
  page: number;
  kind: string;
  overflowPx: number;
  clippedSections: string[];
}

export function exportHtml(doc: WorksheetDocument, variant: Variant, opts: { draftLabel?: string; revisionLabel?: string } = {}) {
  return renderWorksheetHtml(doc, { variant, fontSrc: inlineFontSrc(), draftLabel: opts.draftLabel, revisionLabel: opts.revisionLabel });
}

export async function measureHtml(html: string): Promise<MeasuredPage[]> {
  return withPage(html, async (page) => (page.evaluate("window.__csLayout") as Promise<MeasuredPage[]>));
}

export async function renderPdf(html: string, doc: WorksheetDocument): Promise<{ pdf: Buffer; pages: MeasuredPage[] }> {
  return withPage(html, async (page) => {
    const pages = await (page.evaluate("window.__csLayout") as Promise<MeasuredPage[]>);
    const landscape = doc.layout.orientation === "landscape";
    const pdf = await page.pdf({
      format: doc.layout.pageSize === "a4" ? "A4" : "Letter",
      landscape,
      printBackground: true,
      preferCSSPageSize: true,
      margin: { top: "0", right: "0", bottom: "0", left: "0" },
      tagged: true,
      outline: false,
    });
    return { pdf: Buffer.from(pdf), pages };
  });
}

export async function renderPng(html: string, pageNumber: number): Promise<Buffer> {
  return withPage(html, async (page) => {
    await page.emulateMedia({ media: "print" });
    const el = page.locator(`.page[data-page="${pageNumber}"]`);
    return Buffer.from(await el.screenshot({ type: "png", scale: "device" }));
  });
}

const MEASURE_SECTIONS_JS = `(function(){
  var body = document.querySelector(".page-body");
  var secs = Array.prototype.slice.call(body.querySelectorAll(":scope > section[data-section]"));
  function outer(el){ var r = el.getBoundingClientRect(); var cs = getComputedStyle(el); return r.height + parseFloat(cs.marginTop) + parseFloat(cs.marginBottom); }
  var t = body.querySelector(".titleblock");
  return { heights: secs.map(function(s){ return { id: s.getAttribute("data-section"), h: outer(s) }; }), title: t ? outer(t) : 0, refs: 0 };
})()`;

/** Measure each student section at its natural height, then pack pages. */
export async function autoPaginate(doc: WorksheetDocument): Promise<WorksheetDocument> {
  const probe: WorksheetDocument = { ...doc, layout: { ...doc.layout, studentReferences: "none" }, sections: doc.sections.map((s) => ({ ...s, page: 1 })) };
  const html = renderWorksheetHtml(probe, { variant: "student", fontSrc: inlineFontSrc() }).replace("</style>", ".page,.page-body{height:auto !important;overflow:visible !important;}</style>");
  const { heights, title, refs } = await withPage(html, async (page) =>
    // A string expression avoids bundler-injected helpers (e.g. __name) inside the page.
    page.evaluate(MEASURE_SECTIONS_JS) as Promise<{ heights: { id: string; h: number }[]; title: number; refs: number }>,
  );
  const content = contentBoxMm(doc.layout.pageSize, doc.layout.orientation, doc.layout.marginsMm, doc.layout.bindingMm);
  const pagePx = (content.h * 96) / 25.4 - 2;
  const out: WorksheetDocument = { ...doc, sections: doc.sections.map((s) => ({ ...s })) };
  const map = new Map(heights.map((h) => [h.id, h.h]));
  // Reserve room on the last page for the short reference line.
  const refReserve = doc.layout.studentReferences === "none" || !doc.sources.length ? 0 : 40;
  void refs;
  packPages(out, out.sections.map((s) => (s.hidden ? 0 : (map.get(s.id) ?? 0))), pagePx, title);
  // If the reference line would not fit on the last page, give it room.
  const last = Math.max(...out.sections.map((s) => s.page));
  const lastHeight = out.sections.filter((s) => s.page === last && !s.hidden).reduce((n, s) => n + (map.get(s.id) ?? 0), last === 1 ? title : 0);
  if (refReserve && lastHeight + refReserve > pagePx) {
    const lastVisible = [...out.sections].reverse().find((s) => !s.hidden && s.page === last);
    if (lastVisible && out.sections.filter((s) => s.page === last && !s.hidden).length > 1) lastVisible.page = last + 1;
  }
  return out;
}

export const browserLayoutEngine: LayoutEngine = {
  autoPaginate,
  async measure(doc) {
    const studentHtml = exportHtml(doc, "student");
    const educator = exportHtml(doc, "educator");
    const pages = await measureHtml(educator);
    return { pages, studentHtml };
  },
};
