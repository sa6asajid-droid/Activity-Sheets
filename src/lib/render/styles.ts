/**
 * Print stylesheet shared by the live preview and every export. Keeping one
 * stylesheet and one renderer is what makes the preview and the PDF match.
 */
import type { LayoutSettings } from "../schema/document";
import { contentBoxMm, pageBoxMm } from "../computations";

export const FONT_FILES = [
  { family: "CS Display", weight: 400, style: "normal", file: "fraunces-latin-400-normal.woff2" },
  { family: "CS Display", weight: 400, style: "italic", file: "fraunces-latin-400-italic.woff2" },
  { family: "CS Display", weight: 600, style: "normal", file: "fraunces-latin-600-normal.woff2" },
  { family: "CS Display", weight: 700, style: "normal", file: "fraunces-latin-700-normal.woff2" },
  { family: "CS Body", weight: 400, style: "normal", file: "atkinson-hyperlegible-next-latin-400-normal.woff2" },
  { family: "CS Body", weight: 400, style: "italic", file: "atkinson-hyperlegible-next-latin-400-italic.woff2" },
  { family: "CS Body", weight: 600, style: "normal", file: "atkinson-hyperlegible-next-latin-600-normal.woff2" },
  { family: "CS Body", weight: 700, style: "normal", file: "atkinson-hyperlegible-next-latin-700-normal.woff2" },
] as const;

/** @font-face rules pointing at a URL base (preview) or supplied data URIs (export). */
export function fontFaceCss(src: (file: string) => string): string {
  return FONT_FILES.map(
    (f) =>
      `@font-face{font-family:"${f.family}";font-weight:${f.weight};font-style:${f.style};font-display:block;src:url("${src(f.file)}") format("woff2");}`,
  ).join("\n");
}

export const TYPE_SCALE = {
  standard: { body: 11.5, small: 9.5, h2: 15, title: 26, lineMm: 9 },
  large: { body: 14, small: 11, h2: 17, title: 28, lineMm: 10.5 },
  "extra-large": { body: 16, small: 12, h2: 19, title: 30, lineMm: 12 },
} as const;

/** Configured minimum printed type size (pt). Overflow is never solved by going below it. */
export const MIN_TYPE_PT = 9;

export const WRITING_LINE_MM = { compact: 7, standard: 9, generous: 11 } as const;

export function lineHeightMm(layout: LayoutSettings) {
  // Larger type needs taller writing lines too.
  const base = WRITING_LINE_MM[layout.writingSpace];
  return layout.fontScale === "standard" ? base : layout.fontScale === "large" ? base + 1.5 : base + 3;
}

export function worksheetCss(layout: LayoutSettings): string {
  const page = pageBoxMm(layout.pageSize, layout.orientation);
  const content = contentBoxMm(layout.pageSize, layout.orientation, layout.marginsMm, layout.bindingMm);
  const t = TYPE_SCALE[layout.fontScale];
  const accent = layout.colourMode === "accent" || layout.colourMode === "full" ? layout.accentColour : "#111111";
  const tint = layout.colourMode === "bw" ? "#ffffff" : layout.colourMode === "grayscale" ? "#f1f1f1" : "#f2f6f9";
  const m = layout.marginsMm;
  return `
:root{--ink:#111111;--muted:#4a4a4a;--rule:#111111;--accent:${accent};--tint:${tint};--line:${lineHeightMm(layout)}mm;
--font-display:"CS Display",Georgia,"Times New Roman",serif;--font-body:"CS Body",Arial,Helvetica,sans-serif;}
@page{size:${page.w}mm ${page.h}mm;margin:0;}
*{box-sizing:border-box;}
html,body{margin:0;padding:0;background:#e9e7e2;color:var(--ink);}
body{font-family:var(--font-body);font-size:${t.body}pt;line-height:1.42;-webkit-print-color-adjust:exact;print-color-adjust:exact;}
.doc{display:flex;flex-direction:column;align-items:center;gap:10mm;padding:10mm 0;}
@media print{html,body{background:#fff;}.doc{display:block;padding:0;gap:0;}}
.page{position:relative;width:${page.w}mm;height:${page.h}mm;background:#fff;overflow:hidden;page-break-after:always;break-after:page;
  padding:${m.top}mm ${m.outer}mm ${m.bottom}mm ${m.inner + layout.bindingMm}mm;box-shadow:0 1px 3px rgba(0,0,0,.18);}
@media print{.page{box-shadow:none;}}
.page.even{padding-left:${m.outer}mm;padding-right:${m.inner + layout.bindingMm}mm;}
.page:last-child{page-break-after:auto;break-after:auto;}
.page-body{position:relative;width:${content.w}mm;height:${content.h}mm;overflow:hidden;}
.page-head{position:absolute;top:${Math.max(4, m.top - 9)}mm;left:${m.inner + layout.bindingMm}mm;right:${m.outer}mm;display:flex;justify-content:space-between;align-items:flex-end;font-size:${Math.max(MIN_TYPE_PT, t.small)}pt;color:var(--muted);}
.page-foot{position:absolute;bottom:${Math.max(4, m.bottom - 9)}mm;left:${m.inner + layout.bindingMm}mm;right:${m.outer}mm;display:flex;justify-content:space-between;gap:6mm;font-size:${Math.max(MIN_TYPE_PT, t.small - 0.5)}pt;color:var(--muted);border-top:0.3mm solid #bdbdbd;padding-top:1.6mm;}
.namedate{display:flex;gap:6mm;color:var(--ink);}
.namedate span{display:inline-flex;align-items:flex-end;gap:2mm;}
.namedate i{display:inline-block;border-bottom:0.3mm solid var(--ink);width:38mm;height:4mm;}
.namedate i.short{width:22mm;}
.titleblock{margin:0 0 5mm 0;padding-bottom:3.5mm;border-bottom:0.6mm solid var(--rule);}
.eyebrow{font-size:${Math.max(MIN_TYPE_PT, t.small)}pt;letter-spacing:.14em;text-transform:uppercase;color:var(--muted);margin:0 0 1.5mm;font-weight:600;}
h1.question{font-family:var(--font-display);font-weight:600;font-size:${t.title}pt;line-height:1.08;margin:0;letter-spacing:-0.01em;color:var(--ink);}
.subq{margin:2mm 0 0;font-style:italic;color:var(--muted);}
section.blk{margin:0 0 4.2mm 0;break-inside:avoid;}
h2{font-family:var(--font-display);font-size:${t.h2}pt;font-weight:600;line-height:1.15;margin:0 0 1.6mm;}
h2 .num{display:inline-flex;align-items:center;justify-content:center;width:1.55em;height:1.55em;border-radius:50%;border:0.45mm solid var(--ink);font-family:var(--font-body);font-size:.68em;font-weight:700;margin-right:2mm;vertical-align:.12em;}
p{margin:0 0 1.8mm;}
ul,ol{margin:0 0 2mm;padding-left:6mm;}
li{margin:0 0 .8mm;}
.term{font-weight:700;}
.hook p{font-family:var(--font-display);font-style:italic;font-size:1.06em;}
.answerbox{border-left:1.6mm solid var(--accent);padding:2mm 0 2mm 4mm;margin:0 0 3mm;background:var(--tint);}
.answerbox .label{font-size:${Math.max(MIN_TYPE_PT, t.small)}pt;letter-spacing:.12em;text-transform:uppercase;font-weight:700;margin:0 0 1mm;}
.answerbox p{font-size:1.05em;margin:0;}
.box{border:0.4mm solid var(--ink);border-radius:2mm;padding:3mm 4mm;}
.box.dashed{border-style:dashed;}
.recall{border:0.5mm dashed var(--ink);border-radius:2mm;padding:3mm 4mm;}
.cover{font-size:${Math.max(MIN_TYPE_PT, t.small)}pt;font-weight:700;margin:0 0 1.5mm;}
.lines{margin:1mm 0 0;}
.lines .ln{height:var(--line);border-bottom:0.3mm solid #6f6f6f;}
.drawbox{border:0.35mm solid #6f6f6f;border-radius:1.5mm;margin-top:1.5mm;}
.item{margin:0 0 2.2mm;break-inside:avoid;}
.item .prompt{display:flex;gap:2mm;}
.item .prompt b{min-width:5mm;}
.given{font-style:italic;border-bottom:0.3mm solid #6f6f6f;padding:1mm 0 .5mm 2mm;margin-top:.5mm;}
.choices{display:flex;flex-wrap:wrap;gap:1.5mm 6mm;margin:1mm 0 0 7mm;}
.choices span::before{content:"";display:inline-block;width:3.6mm;height:3.6mm;border:0.35mm solid var(--ink);margin-right:1.6mm;vertical-align:-0.6mm;}
.choices.circle span::before{border-radius:50%;}
.match{display:grid;grid-template-columns:1fr 1fr;gap:1.5mm 8mm;}
.match .l{display:flex;gap:2mm;align-items:baseline;}
.match .l i{display:inline-block;width:9mm;border-bottom:0.3mm solid var(--ink);}
.seq .item .prompt::before{content:"";display:inline-block;flex:none;width:7mm;height:7mm;border:0.35mm solid var(--ink);border-radius:1mm;margin-right:1mm;}
.support{font-size:.92em;margin-top:1.5mm;color:var(--ink);}
.support .k{font-weight:700;}
.wordbank{display:flex;flex-wrap:wrap;gap:1.5mm 2.5mm;margin:1mm 0 2mm;}
.wordbank span{border:0.35mm solid var(--ink);border-radius:1.2mm;padding:.4mm 2.2mm;font-size:.95em;}
.oral{font-size:.9em;font-style:italic;color:var(--muted);margin-top:1mm;}
figure{margin:0;}
figure .art{display:block;margin:0 auto;}
figure .art svg{display:block;width:100%;height:auto;}
figcaption{font-size:${Math.max(MIN_TYPE_PT, t.small)}pt;margin-top:1.2mm;color:var(--muted);}
figcaption b{color:var(--ink);}
dl.vocab{display:grid;grid-template-columns:auto 1fr;gap:1mm 4mm;margin:0;}
dl.vocab dt{font-weight:700;}
dl.vocab dd{margin:0;}
.safety{border:0.5mm solid var(--ink);border-radius:2mm;padding:2.5mm 4mm;}
.safety::before{content:"Adult check";display:block;font-weight:700;font-size:${Math.max(MIN_TYPE_PT, t.small)}pt;letter-spacing:.1em;text-transform:uppercase;margin-bottom:1mm;}
.nextq{border-top:0.5mm solid var(--rule);padding-top:2.5mm;}
.nextq .label{font-size:${Math.max(MIN_TYPE_PT, t.small)}pt;letter-spacing:.12em;text-transform:uppercase;font-weight:700;}
.nextq p{font-family:var(--font-display);font-size:1.15em;margin:.8mm 0 0;}
.refs{font-size:${Math.max(MIN_TYPE_PT, t.small - 0.5)}pt;color:var(--muted);margin-top:2mm;}
.refs ol{padding-left:4mm;}
.draftmark{position:absolute;top:2mm;right:4mm;font-size:8pt;letter-spacing:.2em;font-weight:700;color:#8a8a8a;}
/* answer key & teacher notes */
.key h2{font-size:${t.h2 - 1}pt;}
.key .ans{border-left:1mm solid var(--ink);padding-left:3mm;margin:1mm 0 2mm;}
.key table{border-collapse:collapse;width:100%;font-size:.92em;margin:1mm 0 2mm;}
.key th[scope=row]{white-space:nowrap;width:1%;}
.key td,.key th{border:0.3mm solid #8a8a8a;padding:1mm 2mm;vertical-align:top;text-align:left;}
.key .meta{font-size:${Math.max(MIN_TYPE_PT, t.small)}pt;color:var(--muted);}
.status{display:inline-block;border:0.3mm solid var(--ink);border-radius:1mm;padding:0 1.5mm;font-size:${MIN_TYPE_PT}pt;text-transform:uppercase;letter-spacing:.06em;}
/* visual families */
.fam-field-notes h2{border-bottom:0.3mm solid var(--ink);padding-bottom:.6mm;}
.fam-technical-cutaway h1.question,.fam-technical-cutaway h2{font-family:var(--font-body);font-weight:700;letter-spacing:0;}
.fam-technical-cutaway h2{text-transform:uppercase;font-size:${t.h2 - 2}pt;letter-spacing:.06em;}
.fam-archival-notebook .titleblock{border-bottom:double 1.6mm var(--ink);}
.fam-archival-notebook h2{font-style:italic;}
.fam-geometric h1.question,.fam-geometric h2{font-family:var(--font-body);font-weight:700;}
.fam-geometric section.blk.k-activity{border:0.4mm solid var(--ink);padding:2.5mm 3.5mm;border-radius:0;}
.fam-early-years{font-size:${t.body + 1.5}pt;}
.fam-early-years h1.question{font-size:${t.title + 2}pt;}
.fam-early-years .box,.fam-early-years .recall{border-radius:5mm;}
/* editor interaction */
.interactive [data-section]{cursor:pointer;outline-offset:1.2mm;}
.interactive [data-section]:hover{outline:0.4mm dashed #4b7bb0;}
.interactive [data-section].selected{outline:0.6mm solid #1f5f8b;}
.interactive .is-hidden{opacity:.35;}
.interactive .lock{position:absolute;right:0;top:0;font-size:8pt;color:#1f5f8b;}
`;
}
