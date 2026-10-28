/**
 * Convert model output into validated document parts. Keys chosen by the
 * model are mapped to stable IDs; dangling references are dropped and
 * reported rather than silently trusted.
 */
import type { Activity, AnswerKeyEntry, Computation, Diagram, Section } from "../schema/document";
import { ActivitySchema, AnswerKeyEntrySchema, DiagramSchema, SectionSchema } from "../schema/document";
import { DiagramSpecSchema, ICON_NAMES, type DiagramSpec } from "../schema/diagram";
import type { LlmActivityT, LlmAnswerT, LlmDiagramSpecT, LlmSectionT, VisualsOutT } from "./llm-schemas";
import { slug } from "../text";

const iconOrUndefined = (s: string) => ((ICON_NAMES as readonly string[]).includes(s) ? (s as (typeof ICON_NAMES)[number]) : undefined);

export function safeId(prefix: string, key: string, used: Set<string>): string {
  let base = `${prefix}-${slug(key || prefix, 30)}`;
  if (!/^[A-Za-z0-9_.:-]+$/.test(base)) base = `${prefix}-x`;
  let id = base;
  let n = 2;
  while (used.has(id)) id = `${base}-${n++}`;
  used.add(id);
  return id;
}

export function convertDiagramSpec(s: LlmDiagramSpecT): DiagramSpec {
  let raw: unknown;
  switch (s.type) {
    case "sequence":
      raw = { type: "sequence", cyclic: s.sequence.cyclic, steps: s.sequence.steps.map((st) => ({ label: st.label, detail: st.detail, icon: iconOrUndefined(st.icon) })) };
      break;
    case "comparison":
      raw = { type: "comparison", columns: s.comparison.columns.map((c) => ({ title: c.title, points: c.points, icon: iconOrUndefined(c.icon) })) };
      break;
    case "timeline":
      raw = { type: "timeline", ...s.timeline };
      break;
    case "light-shadow":
      raw = { type: "light-shadow", objectLabel: s.lightShadow.objectLabel || "stick", times: s.lightShadow.times, showLengthLabels: true };
      break;
    case "fraction-bars":
      raw = { type: "fraction-bars", bars: s.fractionBars.bars, claim: s.fractionBars.claim, showFractionLabels: true };
      break;
    case "number-line":
      raw = { type: "number-line", min: s.numberLine.min, max: s.numberLine.max, step: s.numberLine.step, fractionDenominator: s.numberLine.fractionDenominator >= 2 ? s.numberLine.fractionDenominator : undefined, points: s.numberLine.points };
      break;
    case "lever":
      raw = { type: "lever", ...s.lever, showDistances: true };
      break;
    case "bar-chart":
      raw = { type: "bar-chart", ...s.barChart };
      break;
    case "concept-map":
      raw = {
        type: "concept-map",
        nodes: s.conceptMap.nodes.map((nd) => ({ id: slug(nd.id, 30), label: nd.label })),
        edges: s.conceptMap.edges.map((e) => ({ from: slug(e.from, 30), to: slug(e.to, 30), label: e.label })),
        centralNodeId: s.conceptMap.centralNodeId ? slug(s.conceptMap.centralNodeId, 30) : undefined,
      };
      break;
    case "labelled-scene": {
      const ls = s.labelledScene;
      raw = {
        type: "labelled-scene",
        width: ls.width,
        height: ls.height,
        legend: ls.legend,
        callouts: ls.callouts.map((c, i) => ({ ...c, id: `callout-${slug(c.id || String(i), 24)}` })),
        primitives: ls.primitives.map((p) => {
          switch (p.shape) {
            case "rect":
              return { shape: "rect", x: p.x, y: p.y, w: p.w, h: p.h, rx: 0, fill: p.fill };
            case "circle":
              return { shape: "circle", cx: p.x, cy: p.y, r: p.r, fill: p.fill };
            case "ellipse":
              return { shape: "ellipse", cx: p.x, cy: p.y, rx: p.w / 2, ry: p.h / 2, fill: p.fill };
            case "line":
              return { shape: "line", x1: p.x, y1: p.y, x2: p.x2, y2: p.y2, dashed: p.dashed };
            case "arrow":
              return { shape: "arrow", x1: p.x, y1: p.y, x2: p.x2, y2: p.y2 };
            case "polygon":
              return { shape: "polygon", points: p.points.map((q) => [q.x, q.y]), fill: p.fill, smooth: p.smooth };
            case "polyline":
              return { shape: "polyline", points: p.points.map((q) => [q.x, q.y]), smooth: p.smooth };
            case "icon":
              return { shape: "icon", name: iconOrUndefined(p.icon) ?? "magnifier", x: p.x, y: p.y, size: p.w || 48 };
          }
        }),
      };
      break;
    }
  }
  return DiagramSpecSchema.parse(raw);
}

export interface ConvertReport {
  problems: string[];
}

export function convertDiagrams(out: VisualsOutT["diagrams"], keyToId: Map<string, string>, used: Set<string>, report: ConvertReport): Diagram[] {
  const diagrams: Diagram[] = [];
  for (const d of out) {
    try {
      const spec = convertDiagramSpec(d.spec);
      const id = keyToId.get(d.key) ?? safeId("fig", d.key, used);
      keyToId.set(d.key, id);
      diagrams.push(
        DiagramSchema.parse({
          id,
          teachingPurpose: d.teachingPurpose || "Explains the idea visually.",
          lossIfRemoved: d.lossIfRemoved,
          spec,
          caption: d.caption,
          altText: d.altText || d.caption || "Diagram",
          longDescription: d.longDescription,
          provenance: { kind: "deterministic-svg", note: "Drawn from a validated specification by Curiosity Studio's diagram engine.", rights: "owned" },
          reviewStatus: "unreviewed",
        }),
      );
    } catch (e) {
      report.problems.push(`Diagram "${d.key}" was not usable (${(e as Error).message.slice(0, 200)}). It was left out instead of substituting a guess.`);
    }
  }
  return diagrams;
}

function convertComputation(c: LlmActivityT["computations"][number], itemIds: Map<string, string>): Computation | null {
  const itemId = itemIds.get(c.itemKey);
  if (!itemId || c.kind === "none") return null;
  switch (c.kind) {
    case "fraction-equivalence":
      return { kind: c.kind, itemId, a: [c.aNumerator, c.aDenominator], b: [c.bNumerator, c.bDenominator], expected: c.expectedBoolean };
    case "missing-numerator":
      return { kind: c.kind, itemId, a: [c.aNumerator, c.aDenominator], denominator: c.denominator, expected: c.expectedNumber };
    case "arithmetic":
      return { kind: c.kind, itemId, expression: c.expression, expected: c.expectedNumber, tolerance: 0 };
    case "percent-change":
      return { kind: c.kind, itemId, from: c.from, to: c.to, expected: c.expectedNumber, tolerance: 0.05 };
    case "mechanical-advantage":
      return { kind: c.kind, itemId, effortArm: c.effortArm, loadArm: c.loadArm, expected: c.expectedNumber, tolerance: 0.01 };
  }
}

export function convertActivity(
  a: LlmActivityT,
  ids: { activity: string; answerKey: string; diagram?: string },
  objectiveIds: Set<string>,
  report: ConvertReport,
): { activity: Activity; itemIds: Map<string, string> } {
  const itemIds = new Map<string, string>();
  const usedItems = new Set<string>();
  const items = a.items.slice(0, 16).map((it) => {
    const id = safeId("i", it.key, usedItems);
    itemIds.set(it.key, id);
    return {
      id,
      prompt: it.prompt.slice(0, 400),
      options: it.options.slice(0, 8).map((o) => o.slice(0, 400)),
      answerLines: Math.max(0, Math.min(20, Math.round(it.answerLines))),
      givenAnswer: it.givenAnswer ? it.givenAnswer.slice(0, 400) : undefined,
    };
  });
  const objs = a.objectiveIds.filter((o) => objectiveIds.has(o));
  if (objs.length < a.objectiveIds.length) report.problems.push(`Activity "${a.title}" referenced unknown objectives; they were removed.`);
  if (!objs.length) objs.push([...objectiveIds][0]);
  const computations: Computation[] = [];
  for (const c of a.computations) {
    try {
      const cc = convertComputation(c, itemIds);
      if (cc) computations.push(cc);
    } catch {
      report.problems.push(`A computation in "${a.title}" was malformed and ignored.`);
    }
  }
  const activity = ActivitySchema.parse({
    id: ids.activity,
    objectiveIds: objs,
    type: a.type,
    title: a.title.slice(0, 400),
    instructions: a.instructions,
    responseMode: a.responseMode,
    supportLevel: a.supportLevel,
    supportOptions: {
      sentenceStarter: a.sentenceStarter || undefined,
      wordBank: a.wordBank.slice(0, 16).map((w) => w.slice(0, 60)),
      oralAlternative: a.oralAlternative || undefined,
      drawingAlternative: a.drawingAlternative || undefined,
    },
    items,
    diagramId: ids.diagram,
    required: a.required,
    scored: a.scored,
    marks: a.scored ? Math.max(0, Math.min(50, Math.round(a.marks))) : undefined,
    answerKeyId: ids.answerKey,
    computations,
    coverInstruction: a.coverInstruction,
  });
  return { activity, itemIds };
}

export function convertAnswer(k: LlmAnswerT, id: string, activityId: string, itemIds: Map<string, string>, scored: boolean): AnswerKeyEntry {
  return AnswerKeyEntrySchema.parse({
    id,
    activityId,
    answer: k.answer || "See item answers.",
    itemAnswers: k.itemAnswers.filter((ia) => itemIds.has(ia.itemKey)).map((ia) => ({ itemId: itemIds.get(ia.itemKey)!, answer: ia.answer.slice(0, 400) })),
    reasoning: k.reasoning,
    acceptableAlternatives: k.acceptableAlternatives.map((x) => x.slice(0, 400)),
    rubric: k.rubric.map((r) => ({ level: r.level.slice(0, 40), descriptor: r.descriptor.slice(0, 400) })),
    commonErrors: k.commonErrors.map((x) => x.slice(0, 400)),
    marks: scored ? Math.max(0, Math.min(50, Math.round(k.marks))) : undefined,
  });
}

export function convertSection(s: LlmSectionT, id: string, refs: { activityId?: string; diagramId?: string; claimIds: Set<string> }, page: number): Section {
  return SectionSchema.parse({
    id,
    kind: s.kind,
    heading: s.heading.slice(0, 400),
    body: s.body,
    terms: s.terms.slice(0, 12).map((t) => ({ term: t.term.slice(0, 60), definition: t.definition.slice(0, 400) })),
    activityId: refs.activityId,
    diagramId: refs.diagramId,
    page,
    optional: s.optional,
    claimIds: s.claimIds.filter((c) => refs.claimIds.has(c)),
  });
}
