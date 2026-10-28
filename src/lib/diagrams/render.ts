/**
 * SceneGraph -> SVG string.
 *
 * Only a fixed allowlist of SVG elements is emitted, every attribute value is
 * numeric or chosen from fixed tokens, and every piece of text is escaped.
 * This is why model output can never inject markup or script through a diagram.
 */
import type { Fill, SceneElement, SceneGraph, Stroke } from "../schema/diagram";
import { ICONS } from "./icons";
import { escapeHtml, wrapText } from "../text";

export interface SvgOptions {
  colourMode: "bw" | "grayscale" | "accent" | "full";
  accentColour: string;
  /** Unique prefix so several diagrams on one page do not share marker IDs. */
  idPrefix: string;
  /** Show the text of "blank" labels (answer key) instead of a write-on line. */
  revealBlanks: boolean;
  title?: string;
  description?: string;
  /** Scale fonts inside the diagram (large-print settings). */
  fontScale?: number;
}

const n = (v: number) => (Math.round(v * 100) / 100).toString();

function fillValue(fill: Fill | undefined, o: SvgOptions): string {
  const accent = o.colourMode === "accent" || o.colourMode === "full" ? o.accentColour : "#111111";
  switch (fill ?? "none") {
    case "none":
      return "none";
    case "paper":
      return "#ffffff";
    case "ink":
      return "#111111";
    case "light":
      return o.colourMode === "bw" ? "#ffffff" : o.colourMode === "grayscale" ? "#ececec" : "#eef3f7";
    case "mid":
      return o.colourMode === "bw" ? `url(#${o.idPrefix}-dots)` : "#b9b9b9";
    case "accent":
      return o.colourMode === "bw" ? `url(#${o.idPrefix}-hatch)` : accent;
    case "hatch":
      return `url(#${o.idPrefix}-hatch)`;
    case "dots":
      return `url(#${o.idPrefix}-dots)`;
  }
}

function strokeValue(stroke: Stroke | undefined, o: SvgOptions): string {
  switch (stroke ?? "ink") {
    case "ink":
      return "#111111";
    case "muted":
      return o.colourMode === "bw" ? "#555555" : "#8a8a8a";
    case "accent":
      return o.colourMode === "accent" || o.colourMode === "full" ? o.accentColour : "#111111";
    case "none":
      return "none";
  }
}

function common(el: SceneElement, o: SvgOptions): string {
  const sw = el.strokeWidth ?? 1.5;
  return `stroke="${strokeValue(el.stroke, o)}" stroke-width="${n(sw)}"${el.dashed ? ' stroke-dasharray="5 4"' : ""} data-el="${escapeHtml(el.id)}"`;
}

function renderText(el: Extract<SceneElement, { kind: "text" }>, o: SvgOptions): string {
  const size = el.size * (o.fontScale ?? 1);
  const showBlank = el.blank && !o.revealBlanks;
  const content = showBlank ? "" : el.text;
  const lines = showBlank ? [""] : wrapText(content, el.maxWidth * (o.fontScale ?? 1) > 0 ? el.maxWidth : 0, size);
  const family = el.role === "title" ? "var(--font-display, Georgia, serif)" : "var(--font-body, Arial, sans-serif)";
  const attrs = `x="${n(el.x)}" y="${n(el.y)}" font-size="${n(size)}" text-anchor="${el.anchor}" font-weight="${el.weight === "bold" ? 700 : 400}"${el.italic ? ' font-style="italic"' : ""} fill="#111111" style="font-family:${family}" data-el="${escapeHtml(el.id)}"${el.editable ? ' data-editable="1"' : ""}`;
  if (showBlank) {
    const w = 110;
    const x0 = el.anchor === "middle" ? el.x - w / 2 : el.anchor === "end" ? el.x - w : el.x;
    return `<line x1="${n(x0)}" y1="${n(el.y + 2)}" x2="${n(x0 + w)}" y2="${n(el.y + 2)}" stroke="#111111" stroke-width="1" data-el="${escapeHtml(el.id)}"/>`;
  }
  const tspans = lines
    .map((line, i) => `<tspan x="${n(el.x)}" dy="${i === 0 ? 0 : n(size * 1.25)}">${escapeHtml(line)}</tspan>`)
    .join("");
  return `<text ${attrs}>${tspans}</text>`;
}

function renderCallout(el: Extract<SceneElement, { kind: "callout" }>, o: SvgOptions): string {
  const size = el.size * (o.fontScale ?? 1);
  const anchorSide = el.at.x >= el.anchor.x ? "start" : "end";
  const pad = anchorSide === "start" ? 4 : -4;
  const showBlank = el.blank && !o.revealBlanks;
  const parts = [
    `<line x1="${n(el.anchor.x)}" y1="${n(el.anchor.y)}" x2="${n(el.at.x)}" y2="${n(el.at.y)}" stroke="#111111" stroke-width="1" data-el="${escapeHtml(el.id)}-leader"/>`,
    `<circle cx="${n(el.anchor.x)}" cy="${n(el.anchor.y)}" r="2.6" fill="#111111"/>`,
  ];
  if (showBlank) {
    // A write-in box at the end of the leader line.
    const w = 120;
    const h = size * 1.9;
    const x0 = anchorSide === "start" ? el.at.x : el.at.x - w;
    parts.push(`<rect x="${n(x0)}" y="${n(el.at.y - h / 2)}" width="${w}" height="${n(h)}" rx="4" fill="#ffffff" stroke="#111111" stroke-width="1.2" data-el="${escapeHtml(el.id)}"/>`);
  } else {
    parts.push(
      `<text x="${n(el.at.x + pad)}" y="${n(el.at.y + size * 0.35)}" font-size="${n(size)}" text-anchor="${anchorSide}" font-weight="700" fill="#111111" style="font-family:var(--font-body, Arial, sans-serif)" data-el="${escapeHtml(el.id)}"${el.editable ? ' data-editable="1"' : ""}>${escapeHtml(el.text)}</text>`,
    );
  }
  return parts.join("");
}

function renderIcon(el: Extract<SceneElement, { kind: "icon" }>): string {
  const def = ICONS[el.name];
  const s = el.size / 48;
  // Keep the on-page stroke weight constant (~1.8 units) whatever the icon size.
  const sw = 1.8 / s;
  const inner = [
    ...def.paths.map((d) => `<path d="${d}"/>`),
    ...(def.circles ?? []).map(([cx, cy, r]) => `<circle cx="${cx}" cy="${cy}" r="${r}"${r < 2.5 ? ' fill="#111111"' : ""}/>`),
  ].join("");
  return `<g transform="translate(${n(el.x)} ${n(el.y)}) scale(${n(s)})" fill="none" stroke="#111111" stroke-width="${n(sw)}" stroke-linecap="round" stroke-linejoin="round" data-el="${escapeHtml(el.id)}" aria-hidden="true"><rect x="0" y="0" width="48" height="48" fill="#ffffff" stroke="none" opacity="0"/>${inner}</g>`;
}

function renderArrow(el: Extract<SceneElement, { kind: "arrow" }>, o: SvgOptions): string {
  const marker = `marker-end="url(#${o.idPrefix}-arrow)"${el.both ? ` marker-start="url(#${o.idPrefix}-arrow-start)"` : ""}`;
  if (el.curve) {
    return `<path d="M${n(el.x1)} ${n(el.y1)} A${n(el.curve)} ${n(el.curve)} 0 0 1 ${n(el.x2)} ${n(el.y2)}" fill="none" ${common(el, o)} ${marker}/>`;
  }
  return `<line x1="${n(el.x1)}" y1="${n(el.y1)}" x2="${n(el.x2)}" y2="${n(el.y2)}" ${common(el, o)} ${marker}/>`;
}

/** Catmull–Rom spline through the points, as cubic Béziers (numbers only). */
export function smoothPath(pts: [number, number][], closed: boolean): string {
  const P = closed ? [pts[pts.length - 1], ...pts, pts[0], pts[1]] : [pts[0], ...pts, pts[pts.length - 1]];
  let d = `M${n(P[1][0])} ${n(P[1][1])}`;
  const segs = closed ? pts.length : pts.length - 1;
  for (let i = 1; i <= segs; i++) {
    const [p0, p1, p2, p3] = [P[i - 1], P[i], P[i + 1], P[i + 2]];
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += ` C${n(c1[0])} ${n(c1[1])} ${n(c2[0])} ${n(c2[1])} ${n(p2[0])} ${n(p2[1])}`;
  }
  return closed ? d + " Z" : d;
}

function renderElement(el: SceneElement, o: SvgOptions): string {
  switch (el.kind) {
    case "rect":
      return `<rect x="${n(el.x)}" y="${n(el.y)}" width="${n(el.w)}" height="${n(el.h)}"${el.rx ? ` rx="${n(el.rx)}"` : ""} fill="${fillValue(el.fill, o)}" ${common(el, o)}/>`;
    case "circle":
      return `<circle cx="${n(el.cx)}" cy="${n(el.cy)}" r="${n(el.r)}" fill="${fillValue(el.fill, o)}" ${common(el, o)}/>`;
    case "ellipse":
      return `<ellipse cx="${n(el.cx)}" cy="${n(el.cy)}" rx="${n(el.rx)}" ry="${n(el.ry)}" fill="${fillValue(el.fill, o)}" ${common(el, o)}/>`;
    case "line":
      return `<line x1="${n(el.x1)}" y1="${n(el.y1)}" x2="${n(el.x2)}" y2="${n(el.y2)}" ${common(el, o)} stroke-linecap="round"/>`;
    case "polyline":
      if (el.smooth && el.points.length > 2) return `<path d="${smoothPath(el.points, false)}" fill="none" ${common(el, o)} stroke-linecap="round"/>`;
      return `<polyline points="${el.points.map(([x, y]) => `${n(x)},${n(y)}`).join(" ")}" fill="none" ${common(el, o)} stroke-linejoin="round"/>`;
    case "polygon":
      if (el.smooth && el.points.length > 2) return `<path d="${smoothPath(el.points, true)}" fill="${fillValue(el.fill, o)}" ${common(el, o)}/>`;
      return `<polygon points="${el.points.map(([x, y]) => `${n(x)},${n(y)}`).join(" ")}" fill="${fillValue(el.fill, o)}" ${common(el, o)} stroke-linejoin="round"/>`;
    case "path":
      // Paths are only produced by deterministic compilers; still restrict the alphabet.
      if (!/^[MLHVCSQTAZmlhvcsqtaz0-9.,\s-]+$/.test(el.d)) return "";
      return `<path d="${el.d}" fill="${fillValue(el.fill, o)}" ${common(el, o)}/>`;
    case "arrow":
      return renderArrow(el, o);
    case "icon":
      return renderIcon(el);
    case "text":
      return renderText(el, o);
    case "callout":
      return renderCallout(el, o);
  }
}

export function renderSvg(graph: SceneGraph, o: SvgOptions): string {
  const p = o.idPrefix;
  const legendH = graph.legend.length ? 30 : 0;
  const height = graph.height + legendH;
  const defs = `<defs>
<marker id="${p}-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 Z" fill="#111111"/></marker>
<marker id="${p}-arrow-start" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 Z" fill="#111111"/></marker>
<pattern id="${p}-hatch" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="7" height="7" fill="#ffffff"/><line x1="0" y1="0" x2="0" y2="7" stroke="${o.colourMode === "accent" || o.colourMode === "full" ? o.accentColour : "#111111"}" stroke-width="2"/></pattern>
<pattern id="${p}-dots" width="6" height="6" patternUnits="userSpaceOnUse"><rect width="6" height="6" fill="#ffffff"/><circle cx="3" cy="3" r="1.1" fill="#111111"/></pattern>
</defs>`;
  const body = graph.elements.map((el) => renderElement(el, o)).join("\n");
  let legend = "";
  if (graph.legend.length) {
    let x = 4;
    legend = graph.legend
      .map((item, i) => {
        const sw = `<rect x="${n(x)}" y="${n(graph.height + 8)}" width="22" height="16" fill="${fillValue(item.fill, o)}" stroke="#111111" stroke-width="1.2"/>`;
        const t = `<text x="${n(x + 28)}" y="${n(graph.height + 21)}" font-size="13" fill="#111111" style="font-family:var(--font-body, Arial, sans-serif)" data-el="legend-${i}">${escapeHtml(item.text)}</text>`;
        x += 40 + item.text.length * 7.5;
        return sw + t;
      })
      .join("");
  }
  const titleId = `${p}-title`;
  const descId = `${p}-desc`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${n(graph.width)} ${n(height)}" role="img" aria-labelledby="${titleId} ${descId}" class="diagram-svg" preserveAspectRatio="xMidYMid meet">
<title id="${titleId}">${escapeHtml(o.title ?? "Diagram")}</title>
<desc id="${descId}">${escapeHtml(o.description ?? "")}</desc>
${defs}
<rect x="0" y="0" width="${n(graph.width)}" height="${n(height)}" fill="#ffffff"/>
${body}
${legend}
</svg>`;
}
