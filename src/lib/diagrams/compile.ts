/**
 * Deterministic compilers: DiagramSpec -> SceneGraph.
 *
 * All geometry is computed here from the validated spec, so the picture is a
 * faithful function of the data (shadow lengths from sun elevation, bar
 * heights from values, fraction shading from numerator/denominator, event
 * positions from dates). Nothing in this file is model-generated.
 */
import type { DiagramSpec, SceneElement, SceneGraph } from "../schema/diagram";
import { estimateTextWidth, wrapText } from "../text";

const W = 600;
const LABEL = 15;
const DETAIL = 12.5;
const TITLE = 16;

function textEl(
  id: string,
  x: number,
  y: number,
  text: string,
  opts: Partial<Extract<SceneElement, { kind: "text" }>> = {},
): SceneElement {
  return {
    kind: "text",
    id,
    x,
    y,
    text,
    size: opts.size ?? LABEL,
    anchor: opts.anchor ?? "middle",
    weight: opts.weight ?? "normal",
    italic: opts.italic,
    maxWidth: opts.maxWidth ?? 0,
    role: opts.role ?? "label",
    editable: opts.editable ?? true,
    blank: opts.blank,
  };
}

/** Height a wrapped text element occupies (line-height 1.25). */
function textHeight(text: string, maxWidth: number, size: number) {
  return wrapText(text, maxWidth, size).length * size * 1.25;
}

export function compileDiagram(spec: DiagramSpec, overrides: Record<string, string> = {}): SceneGraph {
  const graph = compileRaw(spec);
  for (const el of graph.elements) {
    if ((el.kind === "text" || el.kind === "callout") && el.editable && overrides[el.id] !== undefined) {
      el.text = overrides[el.id];
    }
  }
  return graph;
}

function compileRaw(spec: DiagramSpec): SceneGraph {
  switch (spec.type) {
    case "sequence":
      return spec.cyclic && spec.steps.length >= 3 ? compileCycle(spec) : compileSequence(spec);
    case "comparison":
      return compileComparison(spec);
    case "timeline":
      return compileTimeline(spec);
    case "light-shadow":
      return compileLightShadow(spec);
    case "fraction-bars":
      return compileFractionBars(spec);
    case "number-line":
      return compileNumberLine(spec);
    case "lever":
      return compileLever(spec);
    case "bar-chart":
      return compileBarChart(spec);
    case "concept-map":
      return compileConceptMap(spec);
    case "labelled-scene":
      return compileLabelledScene(spec);
  }
}

// ---------------------------------------------------------------- sequence

function compileSequence(spec: Extract<DiagramSpec, { type: "sequence" }>): SceneGraph {
  const n = spec.steps.length;
  const els: SceneElement[] = [];
  if (n <= 4) {
    const cell = W / n;
    const hasIcons = spec.steps.some((s) => s.icon);
    const iconSize = 64;
    const top = 10;
    const labelY = top + (hasIcons ? iconSize + 34 : 30);
    let maxBottom = 0;
    spec.steps.forEach((step, i) => {
      const cx = cell * i + cell / 2;
      // step number in a circle
      els.push({ kind: "circle", id: `num-bg-${i}`, cx: cx - (hasIcons ? iconSize / 2 + 8 : 0), cy: top + 12, r: 11, fill: "paper", stroke: "ink", strokeWidth: 1.5 });
      els.push(textEl(`num-${i}`, cx - (hasIcons ? iconSize / 2 + 8 : 0), top + 17, String(i + 1), { size: 13, weight: "bold", editable: false, role: "tick" }));
      if (step.icon) {
        els.push({ kind: "icon", id: `icon-${i}`, name: step.icon, x: cx - iconSize / 2, y: top + 4, size: iconSize });
      }
      const maxW = cell - 22;
      els.push(textEl(`step-${i}`, cx, labelY, step.label, { weight: "bold", maxWidth: maxW }));
      const lh = textHeight(step.label, maxW, LABEL);
      let bottom = labelY + lh;
      if (step.detail) {
        els.push(textEl(`detail-${i}`, cx, labelY + lh + 4, step.detail, { size: DETAIL, maxWidth: maxW, role: "detail" }));
        bottom += 4 + textHeight(step.detail, maxW, DETAIL);
      }
      maxBottom = Math.max(maxBottom, bottom);
      if (i < n - 1) {
        const ay = hasIcons ? top + 4 + iconSize / 2 : labelY - 5;
        const x1 = hasIcons ? cx + iconSize / 2 + 6 : cx + Math.min(estimateTextWidth(step.label, LABEL), maxW) / 2 + 6;
        const x2 = cell * (i + 1) + cell / 2 - (hasIcons ? iconSize / 2 + 22 : Math.min(estimateTextWidth(spec.steps[i + 1].label, LABEL), maxW) / 2 + 8);
        if (x2 - x1 > 14) els.push({ kind: "arrow", id: `arrow-${i}`, x1, y1: ay, x2, y2: ay, stroke: "ink", strokeWidth: 1.6 });
      }
    });
    return { width: W, height: Math.ceil(maxBottom + 8), elements: els, legend: [] };
  }
  // vertical list for 5–6 steps
  let y = 8;
  spec.steps.forEach((step, i) => {
    const rowTop = y;
    els.push({ kind: "circle", id: `num-bg-${i}`, cx: 22, cy: rowTop + 18, r: 13, fill: "paper", stroke: "ink", strokeWidth: 1.5 });
    els.push(textEl(`num-${i}`, 22, rowTop + 23, String(i + 1), { size: 14, weight: "bold", editable: false, role: "tick" }));
    let textX = 48;
    if (step.icon) {
      els.push({ kind: "icon", id: `icon-${i}`, name: step.icon, x: 46, y: rowTop, size: 40 });
      textX = 98;
    }
    const maxW = W - textX - 8;
    els.push(textEl(`step-${i}`, textX, rowTop + 18, step.label, { anchor: "start", weight: "bold", maxWidth: maxW }));
    let h = textHeight(step.label, maxW, LABEL);
    if (step.detail) {
      els.push(textEl(`detail-${i}`, textX, rowTop + 18 + h + 2, step.detail, { anchor: "start", size: DETAIL, maxWidth: maxW, role: "detail" }));
      h += 2 + textHeight(step.detail, maxW, DETAIL);
    }
    const rowH = Math.max(44, h + 16);
    if (i < spec.steps.length - 1) {
      els.push({ kind: "arrow", id: `arrow-${i}`, x1: 22, y1: rowTop + 33, x2: 22, y2: rowTop + rowH + 3, stroke: "ink", strokeWidth: 1.4 });
    }
    y += rowH + 4;
  });
  return { width: W, height: Math.ceil(y), elements: els, legend: [] };
}

function compileCycle(spec: Extract<DiagramSpec, { type: "sequence" }>): SceneGraph {
  const n = spec.steps.length;
  const els: SceneElement[] = [];
  const cx = W / 2;
  const radius = n <= 4 ? 120 : 135;
  const cy = radius + 50;
  const nodeR = 34;
  spec.steps.forEach((step, i) => {
    const ang = -Math.PI / 2 + (i * 2 * Math.PI) / n;
    const x = cx + radius * Math.cos(ang);
    const y = cy + radius * Math.sin(ang);
    els.push({ kind: "circle", id: `node-${i}`, cx: x, cy: y, r: nodeR, fill: "paper", stroke: "ink", strokeWidth: 1.5 });
    if (step.icon) els.push({ kind: "icon", id: `icon-${i}`, name: step.icon, x: x - 22, y: y - 22, size: 44 });
    else els.push(textEl(`num-${i}`, x, y + 6, String(i + 1), { size: 18, weight: "bold", editable: false, role: "tick" }));
    // label outside the ring
    const outward = Math.cos(ang);
    const lx = x + (Math.abs(outward) < 0.3 ? 0 : Math.sign(outward) * (nodeR + 8));
    const anchor = Math.abs(outward) < 0.3 ? "middle" : outward > 0 ? "start" : "end";
    const ly = Math.abs(outward) < 0.3 ? (Math.sin(ang) < 0 ? y - nodeR - 26 : y + nodeR + 18) : y - 4;
    els.push(textEl(`step-${i}`, lx, ly, step.label, { anchor, weight: "bold", maxWidth: 150 }));
    if (step.detail) {
      els.push(textEl(`detail-${i}`, lx, ly + textHeight(step.label, 150, LABEL) + 2, step.detail, { anchor, size: DETAIL, maxWidth: 150, role: "detail" }));
    }
    // arrow to next node along the ring
    const a1 = ang + (nodeR + 6) / radius;
    const nextAng = -Math.PI / 2 + (((i + 1) % n) * 2 * Math.PI) / n + (i + 1 === n ? 2 * Math.PI : 0);
    const a2 = nextAng - (nodeR + 10) / radius;
    els.push({
      kind: "arrow",
      id: `arrow-${i}`,
      x1: cx + radius * Math.cos(a1),
      y1: cy + radius * Math.sin(a1),
      x2: cx + radius * Math.cos(a2),
      y2: cy + radius * Math.sin(a2),
      curve: radius,
      stroke: "ink",
      strokeWidth: 1.5,
    });
  });
  return { width: W, height: Math.ceil(cy + radius + 70), elements: els, legend: [] };
}

// ---------------------------------------------------------------- comparison

function compileComparison(spec: Extract<DiagramSpec, { type: "comparison" }>): SceneGraph {
  const n = spec.columns.length;
  const gap = 14;
  const colW = (W - gap * (n - 1)) / n;
  const els: SceneElement[] = [];
  let maxH = 0;
  const hasIcons = spec.columns.some((c) => c.icon);
  spec.columns.forEach((col, i) => {
    const x = i * (colW + gap);
    let y = 14;
    if (hasIcons) {
      if (col.icon) els.push({ kind: "icon", id: `icon-${i}`, name: col.icon, x: x + colW / 2 - 24, y: y, size: 48 });
      y += 56;
    }
    els.push(textEl(`title-${i}`, x + colW / 2, y + 16, col.title, { weight: "bold", size: TITLE, maxWidth: colW - 20, role: "title" }));
    y += 16 + textHeight(col.title, colW - 20, TITLE);
    els.push({ kind: "line", id: `rule-${i}`, x1: x + 12, y1: y, x2: x + colW - 12, y2: y, stroke: "muted", strokeWidth: 1 });
    y += 20;
    col.points.forEach((p, j) => {
      els.push({ kind: "circle", id: `bullet-${i}-${j}`, cx: x + 18, cy: y - 4.5, r: 2.4, fill: "ink", stroke: "none" });
      els.push(textEl(`point-${i}-${j}`, x + 28, y, p, { anchor: "start", size: 13.5, maxWidth: colW - 40, role: "detail" }));
      y += textHeight(p, colW - 40, 13.5) + 8;
    });
    maxH = Math.max(maxH, y);
  });
  spec.columns.forEach((_, i) => {
    const x = i * (colW + gap);
    els.unshift({ kind: "rect", id: `panel-${i}`, x, y: 2, w: colW, h: maxH + 4, rx: 6, fill: "none", stroke: "ink", strokeWidth: 1.3 });
  });
  return { width: W, height: Math.ceil(maxH + 10), elements: els, legend: [] };
}

// ---------------------------------------------------------------- timeline

function compileTimeline(spec: Extract<DiagramSpec, { type: "timeline" }>): SceneGraph {
  const els: SceneElement[] = [];
  const left = 30;
  const right = W - 30;
  const axisY = 130;
  const span = spec.end - spec.start || 1;
  const xOf = (v: number) => left + ((v - spec.start) / span) * (right - left);
  els.push({ kind: "arrow", id: "axis", x1: left - 10, y1: axisY, x2: right + 18, y2: axisY, stroke: "ink", strokeWidth: 2 });
  els.push(textEl("start", left, axisY + 24, `${spec.start}${spec.unitLabel ? " " + spec.unitLabel : ""}`, { size: 12, role: "tick", editable: false }));
  els.push(textEl("end", right, axisY + 24, `${spec.end}${spec.unitLabel ? " " + spec.unitLabel : ""}`, { size: 12, role: "tick", editable: false }));
  const events = [...spec.events].map((e, i) => ({ ...e, i }));
  // Order for placement only; the spec order is checked separately.
  events.sort((a, b) => a.value - b.value);
  const labelW = Math.min(150, (right - left) / Math.max(2, Math.ceil(events.length / 2)) - 6);
  events.forEach((e, k) => {
    const x = xOf(e.value);
    const above = k % 2 === 0;
    const stemEnd = above ? axisY - 36 : axisY + 44;
    els.push({ kind: "circle", id: `dot-${e.i}`, cx: x, cy: axisY, r: 5, fill: "paper", stroke: "ink", strokeWidth: 2 });
    els.push({ kind: "line", id: `stem-${e.i}`, x1: x, y1: above ? axisY - 6 : axisY + 6, x2: x, y2: stemEnd, stroke: "ink", strokeWidth: 1 });
    const h = textHeight(e.label, labelW, 13);
    const clampedX = Math.max(left + labelW / 2 - 24, Math.min(right - labelW / 2 + 24, x));
    els.push(
      textEl(`event-${e.i}`, clampedX, above ? stemEnd - h - 12 + 13 : stemEnd + 30, e.label, { size: 13, maxWidth: labelW, role: "label" }),
    );
    els.push(textEl(`year-${e.i}`, clampedX, above ? stemEnd - 4 : stemEnd + 15, `${e.value}${spec.unitLabel ? " " + spec.unitLabel : ""}`, { size: 12, weight: "bold", role: "value", editable: false }));
  });
  return { width: W, height: 260, elements: els, legend: [] };
}

// ---------------------------------------------------------------- light & shadow

/** Shadow length ratio for a vertical object: length / height = 1 / tan(elevation). */
export function shadowRatio(elevationDeg: number): number {
  return 1 / Math.tan((elevationDeg * Math.PI) / 180);
}

function compileLightShadow(spec: Extract<DiagramSpec, { type: "light-shadow" }>): SceneGraph {
  const n = spec.times.length;
  const gap = 12;
  const panelW = (W - gap * (n - 1)) / n;
  const els: SceneElement[] = [];
  const maxRatio = Math.max(...spec.times.map((t) => (t.sunSide === "overhead" ? 0 : shadowRatio(t.sunElevationDeg))));
  // One shared scale so panels can be compared fairly.
  const objH = Math.max(26, Math.min(70, (panelW - 34) / Math.max(1, maxRatio)));
  const groundY = 196;
  spec.times.forEach((t, i) => {
    const px = i * (panelW + gap);
    els.push({ kind: "rect", id: `panel-${i}`, x: px, y: 2, w: panelW, h: groundY + 50, rx: 6, fill: "none", stroke: "muted", strokeWidth: 1 });
    els.push(textEl(`time-${i}`, px + panelW / 2, 24, t.label, { weight: "bold", maxWidth: panelW - 12, role: "title" }));
    els.push({ kind: "line", id: `ground-${i}`, x1: px + 8, y1: groundY, x2: px + panelW - 8, y2: groundY, stroke: "ink", strokeWidth: 1.6 });
    const ratio = t.sunSide === "overhead" ? 0 : shadowRatio(t.sunElevationDeg);
    const len = ratio * objH;
    // object stands where its shadow fits inside the panel
    const dir = t.sunSide === "left" ? 1 : t.sunSide === "right" ? -1 : 0; // shadow direction
    const objX = dir === 1 ? px + 16 : dir === -1 ? px + panelW - 16 : px + panelW / 2;
    els.push({ kind: "line", id: `object-${i}`, x1: objX, y1: groundY, x2: objX, y2: groundY - objH, stroke: "ink", strokeWidth: 4 });
    if (len > 0.5) {
      els.push({ kind: "line", id: `shadow-${i}`, x1: objX, y1: groundY + 0.5, x2: objX + dir * len, y2: groundY + 0.5, stroke: "ink", strokeWidth: 7 });
    }
    // sun along the ray through the top of the object
    const elev = (t.sunElevationDeg * Math.PI) / 180;
    const rayLen = Math.min(118, (groundY - objH - 48) / Math.max(0.15, Math.sin(elev)));
    const sunX = t.sunSide === "overhead" ? objX : objX - dir * Math.cos(elev) * rayLen;
    const sunY = groundY - objH - Math.sin(elev) * rayLen;
    const sx = Math.max(px + 20, Math.min(px + panelW - 20, sunX));
    const sy = Math.max(44, sunY);
    els.push({ kind: "line", id: `ray-${i}`, x1: sx, y1: sy, x2: objX + dir * len, y2: groundY, stroke: "muted", strokeWidth: 1, dashed: true });
    els.push({ kind: "icon", id: `sun-${i}`, name: "sun", x: sx - 16, y: sy - 16, size: 32 });
    if (spec.showLengthLabels) {
      const word = ratio > 2 ? "long shadow" : ratio > 0.8 ? "medium shadow" : "short shadow";
      els.push(textEl(`shadow-label-${i}`, px + panelW / 2, groundY + 26, word, { size: 12.5, role: "detail", maxWidth: panelW - 12 }));
    }
  });
  els.push(textEl("object-label", 16, groundY + 44, `${spec.objectLabel} (same height in every panel)`, { anchor: "start", size: 11.5, role: "detail", italic: true }));
  return { width: W, height: groundY + 56, elements: els, legend: [] };
}

// ---------------------------------------------------------------- fraction bars

function compileFractionBars(spec: Extract<DiagramSpec, { type: "fraction-bars" }>): SceneGraph {
  const els: SceneElement[] = [];
  const labelW = spec.showFractionLabels ? 90 : 0;
  const barX = labelW + 6;
  const barW = W - barX - 6;
  const barH = 38;
  spec.bars.forEach((bar, i) => {
    const y = 8 + i * (barH + 18);
    const part = barW / bar.denominator;
    for (let k = 0; k < bar.denominator; k++) {
      els.push({
        kind: "rect",
        id: `bar-${i}-part-${k}`,
        x: barX + k * part,
        y,
        w: part,
        h: barH,
        fill: k < bar.numerator ? "hatch" : "paper",
        stroke: "ink",
        strokeWidth: 1.4,
      });
    }
    if (spec.showFractionLabels) {
      els.push(textEl(`frac-${i}`, labelW - 4, y + barH / 2 + 6, bar.label || `${bar.numerator}/${bar.denominator}`, { anchor: "end", size: 17, weight: "bold" }));
    }
  });
  const h = 8 + spec.bars.length * (barH + 18);
  return { width: W, height: h, elements: els, legend: [{ fill: "hatch", text: "shaded part" }] };
}

// ---------------------------------------------------------------- number line

function compileNumberLine(spec: Extract<DiagramSpec, { type: "number-line" }>): SceneGraph {
  const els: SceneElement[] = [];
  const left = 34;
  const right = W - 34;
  const y = 60;
  const span = spec.max - spec.min || 1;
  const xOf = (v: number) => left + ((v - spec.min) / span) * (right - left);
  els.push({ kind: "arrow", id: "axis", x1: left - 16, y1: y, x2: right + 22, y2: y, both: true, stroke: "ink", strokeWidth: 1.8 });
  const ticks = Math.round(span / spec.step);
  for (let k = 0; k <= Math.min(ticks, 48); k++) {
    const v = spec.min + k * spec.step;
    const x = xOf(v);
    els.push({ kind: "line", id: `tick-${k}`, x1: x, y1: y - 9, x2: x, y2: y + 9, stroke: "ink", strokeWidth: 1.4 });
    let tl: string;
    if (spec.fractionDenominator) {
      const num = Math.round(v * spec.fractionDenominator);
      tl = num === 0 ? "0" : num % spec.fractionDenominator === 0 ? String(num / spec.fractionDenominator) : `${num}/${spec.fractionDenominator}`;
    } else tl = String(Math.round(v * 1000) / 1000);
    els.push(textEl(`tick-label-${k}`, x, y + 28, tl, { size: 13, role: "tick", editable: false }));
  }
  spec.points.forEach((p, i) => {
    const x = xOf(p.value);
    els.push({ kind: "circle", id: `point-${i}`, cx: x, cy: y, r: 6, fill: "ink", stroke: "ink" });
    if (p.label) els.push(textEl(`point-label-${i}`, x, y - 20 - (i % 2) * 18, p.label, { size: 14, weight: "bold" }));
  });
  return { width: W, height: 104, elements: els, legend: [] };
}

// ---------------------------------------------------------------- lever

export function mechanicalAdvantage(effortArm: number, loadArm: number) {
  return effortArm / loadArm;
}

function compileLever(spec: Extract<DiagramSpec, { type: "lever" }>): SceneGraph {
  const els: SceneElement[] = [];
  const total = spec.effortArm + spec.loadArm;
  const left = 70;
  const right = W - 70;
  const scale = (right - left) / total;
  const beamY = 120;
  const fulcrumX = left + spec.loadArm * scale;
  els.push({ kind: "rect", id: "beam", x: left - 10, y: beamY - 6, w: right - left + 20, h: 12, rx: 2, fill: "paper", stroke: "ink", strokeWidth: 1.8 });
  els.push({ kind: "polygon", id: "fulcrum", points: [[fulcrumX, beamY + 6], [fulcrumX - 26, beamY + 52], [fulcrumX + 26, beamY + 52]], fill: "hatch", stroke: "ink", strokeWidth: 1.8 });
  els.push({ kind: "line", id: "ground", x1: 20, y1: beamY + 52, x2: W - 20, y2: beamY + 52, stroke: "ink", strokeWidth: 1.4 });
  // load: a box sitting on the left end
  els.push({ kind: "rect", id: "load", x: left - 30, y: beamY - 56, w: 60, h: 50, rx: 3, fill: "light", stroke: "ink", strokeWidth: 1.8 });
  els.push(textEl("load-label", left, beamY - 66, spec.loadLabel, { weight: "bold", maxWidth: 140 }));
  // effort: push-down arrow on the right end
  els.push({ kind: "arrow", id: "effort-arrow", x1: right, y1: beamY - 78, x2: right, y2: beamY - 10, stroke: "ink", strokeWidth: 2.4 });
  els.push(textEl("effort-label", right - 12, beamY - 66, spec.effortLabel, { weight: "bold", anchor: "end", maxWidth: 200 }));
  els.push(textEl("fulcrum-label", fulcrumX, beamY + 74, spec.fulcrumLabel, { weight: "bold", maxWidth: 160 }));
  if (spec.showDistances) {
    const dy = beamY + 100;
    els.push({ kind: "arrow", id: "load-dist", x1: left, y1: dy, x2: fulcrumX, y2: dy, both: true, stroke: "ink", strokeWidth: 1.2 });
    els.push({ kind: "arrow", id: "effort-dist", x1: fulcrumX, y1: dy, x2: right, y2: dy, both: true, stroke: "ink", strokeWidth: 1.2 });
    els.push(textEl("load-dist-label", (left + fulcrumX) / 2, dy + 20, `${spec.loadArm} ${spec.unit}`, { size: 13, role: "value", editable: false }));
    els.push(textEl("effort-dist-label", (fulcrumX + right) / 2, dy + 20, `${spec.effortArm} ${spec.unit}`, { size: 13, role: "value", editable: false }));
  }
  return { width: W, height: spec.showDistances ? beamY + 132 : beamY + 90, elements: els, legend: [] };
}

// ---------------------------------------------------------------- bar chart

export function niceMax(v: number): number {
  if (v <= 0) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  for (const m of [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]) if (m * p >= v) return m * p;
  return 10 * p;
}

function compileBarChart(spec: Extract<DiagramSpec, { type: "bar-chart" }>): SceneGraph {
  const els: SceneElement[] = [];
  const left = 64;
  const right = W - 10;
  const top = spec.title ? 40 : 16;
  const bottom = 230;
  const yMax = spec.yMax ?? niceMax(Math.max(...spec.bars.map((b) => b.value)));
  if (spec.title) els.push(textEl("title", W / 2, 22, spec.title, { weight: "bold", size: TITLE, role: "title", maxWidth: W - 40 }));
  els.push({ kind: "line", id: "y-axis", x1: left, y1: top, x2: left, y2: bottom, stroke: "ink", strokeWidth: 1.6 });
  els.push({ kind: "line", id: "x-axis", x1: left, y1: bottom, x2: right, y2: bottom, stroke: "ink", strokeWidth: 1.6 });
  for (let k = 0; k <= 4; k++) {
    const v = (yMax * k) / 4;
    const y = bottom - ((bottom - top) * k) / 4;
    if (k > 0) els.push({ kind: "line", id: `grid-${k}`, x1: left, y1: y, x2: right, y2: y, stroke: "muted", strokeWidth: 0.6, dashed: true });
    els.push(textEl(`ytick-${k}`, left - 8, y + 4, String(Math.round(v * 100) / 100), { anchor: "end", size: 11.5, role: "tick", editable: false }));
  }
  els.push(textEl("y-label", 14, top - 6 + (bottom - top) / 2, spec.yLabel + (spec.unit ? ` (${spec.unit})` : ""), { anchor: "start", size: 12, role: "detail", maxWidth: 46 }));
  const n = spec.bars.length;
  const slot = (right - left) / n;
  const bw = Math.min(64, slot * 0.6);
  spec.bars.forEach((b, i) => {
    const h = (b.value / yMax) * (bottom - top);
    const x = left + slot * i + (slot - bw) / 2;
    els.push({ kind: "rect", id: `bar-${i}`, x, y: bottom - h, w: bw, h: Math.max(h, 0.5), fill: "hatch", stroke: "ink", strokeWidth: 1.4 });
    els.push(textEl(`value-${i}`, x + bw / 2, bottom - h - 6, String(b.value), { size: 12, weight: "bold", role: "value", editable: false }));
    els.push(textEl(`xlabel-${i}`, x + bw / 2, bottom + 18, b.label, { size: 12.5, maxWidth: slot - 4 }));
  });
  return { width: W, height: bottom + 52, elements: els, legend: [] };
}

// ---------------------------------------------------------------- concept map

function compileConceptMap(spec: Extract<DiagramSpec, { type: "concept-map" }>): SceneGraph {
  const els: SceneElement[] = [];
  const central = spec.centralNodeId ?? spec.nodes[0].id;
  const others = spec.nodes.filter((n) => n.id !== central);
  const cx = W / 2;
  const cy = 170;
  const pos = new Map<string, { x: number; y: number }>();
  pos.set(central, { x: cx, y: cy });
  others.forEach((n, i) => {
    const ang = -Math.PI / 2 + (i * 2 * Math.PI) / others.length;
    pos.set(n.id, { x: cx + 225 * Math.cos(ang), y: cy + 125 * Math.sin(ang) });
  });
  const boxW = 128;
  spec.edges.forEach((e, i) => {
    const a = pos.get(e.from);
    const b = pos.get(e.to);
    if (!a || !b) return;
    // trim arrow to box edges (approximate as ellipse)
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy) || 1;
    const trim = (ux: number, uy: number) => 1 / Math.sqrt((ux * ux) / (boxW / 2 + 4) ** 2 + (uy * uy) / 26 ** 2);
    const t = trim(dx / len, dy / len);
    els.push({ kind: "arrow", id: `edge-${i}`, x1: a.x + (dx / len) * t, y1: a.y + (dy / len) * t, x2: b.x - (dx / len) * t, y2: b.y - (dy / len) * t, stroke: "ink", strokeWidth: 1.3 });
    if (e.label) {
      const mx = (a.x + b.x) / 2;
      const my = (a.y + b.y) / 2;
      els.push({ kind: "rect", id: `edge-bg-${i}`, x: mx - estimateTextWidth(e.label, 11.5) / 2 - 4, y: my - 11, w: estimateTextWidth(e.label, 11.5) + 8, h: 16, fill: "paper", stroke: "none" });
      els.push(textEl(`edge-label-${i}`, mx, my + 1, e.label, { size: 11.5, italic: true, role: "detail" }));
    }
  });
  spec.nodes.forEach((n) => {
    const p = pos.get(n.id)!;
    const h = Math.max(36, textHeight(n.label, boxW - 12, 13.5) + 14);
    els.push({ kind: "rect", id: `node-${n.id}`, x: p.x - boxW / 2, y: p.y - h / 2, w: boxW, h, rx: 8, fill: n.id === central ? "light" : "paper", stroke: "ink", strokeWidth: n.id === central ? 2 : 1.4 });
    const lines = wrapText(n.label, boxW - 12, 13.5).length;
    els.push(textEl(`label-${n.id}`, p.x, p.y + 5 - ((lines - 1) * 13.5 * 1.25) / 2, n.label, { size: 13.5, weight: n.id === central ? "bold" : "normal", maxWidth: boxW - 12 }));
  });
  return { width: W, height: 340, elements: els, legend: [] };
}

// ---------------------------------------------------------------- labelled scene

function compileLabelledScene(spec: Extract<DiagramSpec, { type: "labelled-scene" }>): SceneGraph {
  const els: SceneElement[] = spec.primitives.map((p, i): SceneElement => {
    const sid = `shape-${i}`;
    switch (p.shape) {
      case "rect":
        return { kind: "rect", id: sid, x: p.x, y: p.y, w: p.w, h: p.h, rx: p.rx, fill: p.fill, stroke: "ink", strokeWidth: 1.6 };
      case "circle":
        return { kind: "circle", id: sid, cx: p.cx, cy: p.cy, r: p.r, fill: p.fill, stroke: "ink", strokeWidth: 1.6 };
      case "ellipse":
        return { kind: "ellipse", id: sid, cx: p.cx, cy: p.cy, rx: p.rx, ry: p.ry, fill: p.fill, stroke: "ink", strokeWidth: 1.6 };
      case "line":
        return { kind: "line", id: sid, x1: p.x1, y1: p.y1, x2: p.x2, y2: p.y2, dashed: p.dashed, stroke: "ink", strokeWidth: 1.6 };
      case "polygon":
        return { kind: "polygon", id: sid, points: p.points, fill: p.fill, smooth: p.smooth, stroke: "ink", strokeWidth: 1.6 };
      case "polyline":
        return { kind: "polyline", id: sid, points: p.points, smooth: p.smooth, stroke: "ink", strokeWidth: 1.6 };
      case "arrow":
        return { kind: "arrow", id: sid, x1: p.x1, y1: p.y1, x2: p.x2, y2: p.y2, stroke: "ink", strokeWidth: 1.6 };
      case "icon":
        return { kind: "icon", id: sid, name: p.name, x: p.x, y: p.y, size: p.size };
    }
  });
  for (const c of spec.callouts) {
    els.push({ kind: "callout", id: c.id, text: c.text, anchor: c.anchor, at: c.at, size: 14, editable: true, blank: c.blank });
  }
  return { width: spec.width, height: spec.height, elements: els, legend: spec.legend };
}
