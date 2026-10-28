/** Dev helper: render a sample to PDF + PNG previews. Usage: npx tsx scripts/render-sample.ts <name> <outdir> */
import fs from "node:fs";
import path from "node:path";
import { SAMPLES } from "../src/lib/samples";
import { exportHtml, renderPdf, renderPng, autoPaginate, closeBrowser, measureHtml } from "../src/lib/render/browser";
import { runQualityChecks } from "../src/lib/quality/checks";

const [name, out = "."] = process.argv.slice(2);
const sample = SAMPLES.find((s) => s.key === name) ?? SAMPLES[0];
const doc = await autoPaginate(sample.build());
fs.mkdirSync(out, { recursive: true });
const html = exportHtml(doc, "educator");
const pages = await measureHtml(html);
console.log(JSON.stringify(pages));
const r = runQualityChecks(doc, { measuredPages: pages, studentHtml: exportHtml(doc, "student") });
for (const i of r.issues) console.log(i.severity, i.code, i.message.slice(0, 120));
fs.writeFileSync(path.join(out, `${sample.key}.pdf`), (await renderPdf(html, doc)).pdf);
for (let p = 1; p <= pages.length; p++) fs.writeFileSync(path.join(out, `${sample.key}-p${p}.png`), await renderPng(html, p));
await closeBrowser();
