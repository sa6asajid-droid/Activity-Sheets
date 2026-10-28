/**
 * Computational diagram checks. These catch internal contradictions and
 * geometry/data errors; they do not establish scientific correctness, which
 * still needs human subject review.
 */
import type { Diagram } from "../schema/document";
import type { SceneGraph } from "../schema/diagram";
import { estimateTextWidth, wrapText } from "../text";
import { compileDiagram, shadowRatio } from "./compile";

export interface DiagramFinding {
  code: string;
  severity: "blocking" | "warning" | "info";
  message: string;
  elementIds: string[];
}

function gcd(a: number, b: number): number {
  a = Math.abs(a);
  b = Math.abs(b);
  while (b) [a, b] = [b, a % b];
  return a || 1;
}
export function fractionsEquivalent(a: [number, number], b: [number, number]) {
  return a[0] * b[1] === b[0] * a[1];
}

type Box = { id: string; x0: number; y0: number; x1: number; y1: number };

function textBoxes(graph: SceneGraph): Box[] {
  const boxes: Box[] = [];
  for (const el of graph.elements) {
    if (el.kind === "text") {
      const lines = wrapText(el.text, el.maxWidth, el.size);
      const w = Math.max(...lines.map((l) => estimateTextWidth(l, el.size)));
      const x0 = el.anchor === "middle" ? el.x - w / 2 : el.anchor === "end" ? el.x - w : el.x;
      boxes.push({ id: el.id, x0, y0: el.y - el.size * 0.8, x1: x0 + w, y1: el.y + (lines.length - 1) * el.size * 1.25 + el.size * 0.25 });
    } else if (el.kind === "callout") {
      const w = el.blank ? 120 : estimateTextWidth(el.text, el.size);
      const start = el.at.x >= el.anchor.x;
      const x0 = start ? el.at.x + (el.blank ? 0 : 4) : el.at.x - (el.blank ? 0 : 4) - w;
      boxes.push({ id: el.id, x0, y0: el.at.y - el.size * 0.6, x1: x0 + w, y1: el.at.y + el.size * 0.5 });
    }
  }
  return boxes;
}

export function checkDiagram(diagram: Diagram): DiagramFinding[] {
  const out: DiagramFinding[] = [];
  const spec = diagram.spec;
  let graph: SceneGraph;
  try {
    graph = compileDiagram(spec, diagram.labelOverrides);
  } catch (e) {
    return [{ code: "diagram-compile-failed", severity: "blocking", message: `Diagram could not be built: ${(e as Error).message}`, elementIds: [diagram.id] }];
  }

  // -- labels present and inside the drawing
  for (const el of graph.elements) {
    if ((el.kind === "text" || el.kind === "callout") && !el.blank && el.text.trim() === "") {
      out.push({ code: "diagram-empty-label", severity: "blocking", message: `Diagram "${diagram.caption || diagram.id}" has an empty label (${el.id}).`, elementIds: [diagram.id, el.id] });
    }
  }
  for (const b of textBoxes(graph)) {
    if (b.x0 < -2 || b.x1 > graph.width + 2 || b.y0 < -2 || b.y1 > graph.height + 2) {
      out.push({ code: "diagram-label-out-of-bounds", severity: "blocking", message: `A label in "${diagram.caption || diagram.id}" extends outside the diagram (${b.id}). Shorten it or move it.`, elementIds: [diagram.id, b.id] });
    }
  }
  const boxes = textBoxes(graph);
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i];
      const b = boxes[j];
      const overlapX = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0);
      const overlapY = Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0);
      if (overlapX > 4 && overlapY > 3) {
        out.push({ code: "diagram-label-overlap", severity: "warning", message: `Two labels may overlap in "${diagram.caption || diagram.id}" (${a.id}, ${b.id}). Check the rendered diagram.`, elementIds: [diagram.id, a.id, b.id] });
      }
    }
  }

  // -- type-specific checks
  switch (spec.type) {
    case "timeline": {
      for (const e of spec.events) {
        if (e.value < spec.start || e.value > spec.end) {
          out.push({ code: "timeline-out-of-range", severity: "blocking", message: `Timeline event "${e.label}" (${e.value}) is outside the axis range ${spec.start}–${spec.end}.`, elementIds: [diagram.id] });
        }
      }
      if (spec.start >= spec.end) out.push({ code: "timeline-axis", severity: "blocking", message: "Timeline start must be before end.", elementIds: [diagram.id] });
      const values = spec.events.map((e) => e.value);
      const sorted = [...values].sort((a, b) => a - b);
      if (values.some((v, i) => v !== sorted[i])) {
        out.push({ code: "timeline-order", severity: "info", message: "Timeline events were listed out of order; they are drawn in date order. Check any text that refers to the sequence.", elementIds: [diagram.id] });
      }
      break;
    }
    case "light-shadow": {
      const ratios = spec.times.map((t) => (t.sunSide === "overhead" ? 0 : shadowRatio(t.sunElevationDeg)));
      spec.times.forEach((t, i) => {
        if (t.sunSide === "overhead" && t.sunElevationDeg < 85) {
          out.push({ code: "shadow-overhead", severity: "warning", message: `"${t.label}" marks the sun as overhead but gives an elevation of ${t.sunElevationDeg}°. An overhead sun is near 90°.`, elementIds: [diagram.id] });
        }
        if (t.sunSide !== "overhead" && t.sunElevationDeg >= 89) {
          out.push({ code: "shadow-side", severity: "warning", message: `"${t.label}" has a ${t.sunElevationDeg}° sun but a side position.`, elementIds: [diagram.id] });
        }
        void i;
      });
      // Shadow labels are generated from the geometry, so they always match it.
      // Flag a scene that teaches the opposite of the stated idea: lower sun must mean longer shadow.
      for (let i = 0; i < spec.times.length; i++)
        for (let j = 0; j < spec.times.length; j++)
          if (spec.times[i].sunElevationDeg < spec.times[j].sunElevationDeg && ratios[i] <= ratios[j])
            out.push({ code: "shadow-geometry", severity: "blocking", message: "Shadow geometry is inconsistent: a lower sun must cast a longer shadow.", elementIds: [diagram.id] });
      break;
    }
    case "fraction-bars": {
      for (const bar of spec.bars) {
        if (bar.numerator > bar.denominator) {
          out.push({ code: "fraction-improper", severity: "warning", message: `Bar ${bar.numerator}/${bar.denominator} is improper; only one whole is drawn, so the shading is capped.`, elementIds: [diagram.id] });
        }
        if (bar.label && /\d+\s*\/\s*\d+/.test(bar.label)) {
          const m = bar.label.match(/(\d+)\s*\/\s*(\d+)/)!;
          if (Number(m[1]) !== bar.numerator || Number(m[2]) !== bar.denominator) {
            out.push({ code: "fraction-label-mismatch", severity: "blocking", message: `Bar label "${bar.label}" does not match the drawn fraction ${bar.numerator}/${bar.denominator}.`, elementIds: [diagram.id] });
          }
        }
      }
      if (spec.claim !== "none" && spec.bars.length >= 2) {
        const first: [number, number] = [spec.bars[0].numerator, spec.bars[0].denominator];
        const allEq = spec.bars.every((b) => fractionsEquivalent(first, [b.numerator, b.denominator]));
        if (spec.claim === "all-equivalent" && !allEq) {
          out.push({ code: "fraction-claim-false", severity: "blocking", message: "The diagram is described as showing equivalent fractions, but the bars are not all equivalent.", elementIds: [diagram.id] });
        }
        if (spec.claim === "not-equivalent" && allEq) {
          out.push({ code: "fraction-claim-false", severity: "blocking", message: "The diagram is described as showing non-equivalent fractions, but all bars are equivalent.", elementIds: [diagram.id] });
        }
      }
      void gcd;
      break;
    }
    case "number-line": {
      if (spec.min >= spec.max) out.push({ code: "numberline-range", severity: "blocking", message: "Number line minimum must be less than maximum.", elementIds: [diagram.id] });
      const ticks = (spec.max - spec.min) / spec.step;
      if (Math.abs(ticks - Math.round(ticks)) > 1e-6) out.push({ code: "numberline-step", severity: "warning", message: "The step does not divide the range evenly; the last tick will not land on the maximum.", elementIds: [diagram.id] });
      if (ticks > 48) out.push({ code: "numberline-dense", severity: "warning", message: "More than 48 ticks; only the first 48 are drawn.", elementIds: [diagram.id] });
      for (const p of spec.points)
        if (p.value < spec.min || p.value > spec.max)
          out.push({ code: "numberline-point-range", severity: "blocking", message: `Point "${p.label}" (${p.value}) is outside the number line.`, elementIds: [diagram.id] });
      break;
    }
    case "bar-chart": {
      const max = Math.max(...spec.bars.map((b) => b.value));
      if (spec.yMax !== undefined && spec.yMax < max) {
        out.push({ code: "chart-axis-clipped", severity: "blocking", message: `Chart axis maximum (${spec.yMax}) is below the largest value (${max}); bars would be misrepresented.`, elementIds: [diagram.id] });
      }
      if (!spec.yLabel.trim()) out.push({ code: "chart-axis-label", severity: "warning", message: "Chart has no y-axis label.", elementIds: [diagram.id] });
      break;
    }
    case "concept-map": {
      const ids = new Set(spec.nodes.map((nd) => nd.id));
      for (const e of spec.edges) {
        if (!ids.has(e.from) || !ids.has(e.to)) out.push({ code: "concept-edge", severity: "blocking", message: `Concept map link ${e.from} → ${e.to} refers to a missing node.`, elementIds: [diagram.id] });
      }
      break;
    }
    case "labelled-scene": {
      const pts: { x: number; y: number }[] = [];
      for (const p of spec.primitives) {
        if (p.shape === "rect") pts.push({ x: p.x, y: p.y }, { x: p.x + p.w, y: p.y + p.h });
        if (p.shape === "circle") pts.push({ x: p.cx - p.r, y: p.cy - p.r }, { x: p.cx + p.r, y: p.cy + p.r });
        if (p.shape === "ellipse") pts.push({ x: p.cx - p.rx, y: p.cy - p.ry }, { x: p.cx + p.rx, y: p.cy + p.ry });
        if (p.shape === "line" || p.shape === "arrow") pts.push({ x: p.x1, y: p.y1 }, { x: p.x2, y: p.y2 });
        if (p.shape === "polygon" || p.shape === "polyline") p.points.forEach(([x, y]) => pts.push({ x, y }));
        if (p.shape === "icon") pts.push({ x: p.x, y: p.y }, { x: p.x + p.size, y: p.y + p.size });
      }
      for (const c of spec.callouts) pts.push(c.anchor, c.at);
      if (pts.some((p) => p.x < -1 || p.y < -1 || p.x > spec.width + 1 || p.y > spec.height + 1)) {
        out.push({ code: "scene-out-of-bounds", severity: "blocking", message: "Part of the illustration lies outside its drawing area.", elementIds: [diagram.id] });
      }
      if (spec.legend.length === 0 && spec.primitives.some((p) => "fill" in p && (p.fill === "accent" || p.fill === "mid"))) {
        out.push({ code: "scene-legend", severity: "warning", message: "Shaded or coloured areas carry no legend; make sure their meaning is labelled, not shown by colour alone.", elementIds: [diagram.id] });
      }
      break;
    }
    default:
      break;
  }

  if (!diagram.altText.trim()) out.push({ code: "diagram-alt", severity: "blocking", message: `Diagram "${diagram.id}" has no alternative text.`, elementIds: [diagram.id] });
  if (diagram.longDescription.trim().length < 40 && ["timeline", "concept-map", "bar-chart", "labelled-scene", "light-shadow", "lever"].includes(spec.type)) {
    out.push({ code: "diagram-long-description", severity: "warning", message: `Complex diagram "${diagram.caption || diagram.id}" needs a fuller text description.`, elementIds: [diagram.id] });
  }
  if (diagram.decorative) {
    out.push({ code: "diagram-decorative", severity: "info", message: `"${diagram.caption || diagram.id}" is marked decorative; it should be optional and must not carry needed information.`, elementIds: [diagram.id] });
  } else if (!diagram.lossIfRemoved.trim()) {
    out.push({ code: "diagram-purpose", severity: "warning", message: `State what understanding would be lost without "${diagram.caption || diagram.id}" — or mark it decorative.`, elementIds: [diagram.id] });
  }
  return out;
}
