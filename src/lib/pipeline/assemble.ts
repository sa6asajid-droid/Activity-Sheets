/**
 * Assemble model outputs into a WorksheetDocument, and estimate initial page
 * placement. Estimated placement is replaced by measured placement when the
 * browser layout engine is available.
 */
import type { Claim, Diagram, Section, Source, WorksheetDocument } from "../schema/document";
import { SCHEMA_VERSION } from "../schema/document";
import type { ProjectSettings } from "../db/store";
import type { PlanOutT, WriteOutT } from "./llm-schemas";
import { convertActivity, convertAnswer, convertSection, safeId, type ConvertReport } from "./convert";
import { contentBoxMm } from "../computations";
import { TYPE_SCALE, lineHeightMm } from "../render/styles";
import { compileDiagram } from "../diagrams/compile";
import { stripInline } from "../text";

export interface AssembleInput {
  settings: ProjectSettings;
  plan: PlanOutT;
  claims: Claim[];
  sources: Source[];
  write: WriteOutT;
  diagrams: Diagram[];
  diagramKeyToId: Map<string, string>;
  contentMode: WorksheetDocument["contentMode"];
  questionType: WorksheetDocument["learningPlan"]["questionType"];
}

export function buildLearningPlan(plan: PlanOutT, questionType: WorksheetDocument["learningPlan"]["questionType"], retrieval: boolean): WorksheetDocument["learningPlan"] {
  return {
    questionType,
    scope: plan.scope,
    learnerAssumptions: plan.learnerAssumptions.slice(0, 8),
    prerequisites: plan.prerequisites.slice(0, 8),
    objectives: plan.objectives.slice(0, 3).map((o, i) => ({ id: o.id || `obj-${i + 1}`, text: o.text, evidence: o.evidence })),
    misconceptions: plan.misconceptions.slice(0, 4).map((m, i) => ({ id: `mis-${i + 1}`, text: m.text, correction: m.correction, basis: m.basis, sourceIds: m.sourceIds })),
    explanationSequence: plan.explanationSequence.slice(0, 8),
    selectedStrategies: plan.selectedStrategies.slice(0, 6),
    assessmentMap: [],
    visualPlan: plan.proposedVisuals.map((v) => ({ purpose: v.purpose, diagramType: v.diagramType, lossIfRemoved: v.lossIfRemoved })),
    supportOptions: plan.supportOptions.slice(0, 8),
    extensionOptions: plan.extensionOptions.slice(0, 8),
    reviewPlan: { retrievalCard: retrieval, suggestedReviewDays: plan.reviewDays.filter((d) => d >= 1 && d <= 120).slice(0, 5).map(Math.round) },
    rationale: plan.rationale,
  };
}

export function assembleDocument(input: AssembleInput, report: ConvertReport): WorksheetDocument {
  const { settings, plan, write } = input;
  const objectiveIds = new Set(plan.objectives.map((o) => o.id));
  const used = new Set<string>();
  const activities: WorksheetDocument["activities"] = [];
  const answerKey: WorksheetDocument["answerKey"] = [];
  const actKeyToId = new Map<string, string>();
  for (const a of write.activities) {
    const id = safeId("act", a.key, used);
    actKeyToId.set(a.key, id);
    const diagramId = a.diagramKey ? input.diagramKeyToId.get(a.diagramKey) : undefined;
    if (a.diagramKey && !diagramId) report.problems.push(`Activity "${a.title}" refers to a diagram that was not produced.`);
    const keyId = `key-${id}`;
    const { activity, itemIds } = convertActivity(a, { activity: id, answerKey: keyId, diagram: diagramId && input.diagrams.some((d) => d.id === diagramId) ? diagramId : undefined }, objectiveIds, report);
    activities.push(activity);
    const k = write.answerKey.find((x) => x.activityKey === a.key);
    if (k) answerKey.push(convertAnswer(k, keyId, id, itemIds, activity.scored));
    else report.problems.push(`Activity "${a.title}" had no answer-key entry.`);
  }
  const claimIds = new Set(input.claims.map((c) => c.id));
  const sections: Section[] = [];
  for (const s of write.sections) {
    const activityId = s.activityKey ? actKeyToId.get(s.activityKey) : undefined;
    const diagramId = s.diagramKey ? input.diagramKeyToId.get(s.diagramKey) : undefined;
    if (s.kind === "activity" && !activityId) {
      report.problems.push(`An activity section referred to an unknown activity "${s.activityKey}" and was dropped.`);
      continue;
    }
    if (s.kind === "diagram" && (!diagramId || !input.diagrams.some((d) => d.id === diagramId))) {
      report.problems.push(`A diagram section for "${s.diagramKey}" had no usable diagram and was dropped.`);
      continue;
    }
    sections.push(convertSection(s, safeId("sec", s.key || s.kind, used), { activityId, diagramId, claimIds }, 1));
  }
  // Every activity must appear somewhere.
  for (const a of activities) {
    if (!sections.some((s) => s.activityId === a.id)) {
      sections.push({ id: safeId("sec", a.id, used), kind: "activity", heading: "", body: "", terms: [], activityId: a.id, page: 1, optional: !a.required, hidden: false, locked: false, keepWithNext: false, claimIds: [] });
    }
  }
  // Mark claims with where they are used.
  const claims = input.claims.map((c) => ({ ...c, usedIn: sections.filter((s) => s.claimIds.includes(c.id)).map((s) => s.id) }));
  // New statements the writer relied on become explicit unsupported claims.
  write.newUnsupportedClaims.slice(0, 10).forEach((t, i) => {
    if (t.trim().length < 3) return;
    claims.push({ id: `claim-new-${i + 1}`, text: t.slice(0, 400), sourceIds: [], excerpts: [], evidenceStatus: "unsupported", statusAssignedBy: "no-sources", uncertainty: "Added during writing without a linked source.", reviewStatus: "unreviewed", usedIn: [] });
  });
  const learningPlan = buildLearningPlan(plan, input.questionType, settings.options.retrievalCard);
  learningPlan.assessmentMap = learningPlan.objectives.map((o) => ({ objectiveId: o.id, activityIds: activities.filter((a) => a.objectiveIds.includes(o.id)).map((a) => a.id) }));
  learningPlan.visualPlan = learningPlan.visualPlan.map((v) => ({ ...v, diagramId: input.diagrams.find((d) => d.spec.type === v.diagramType)?.id }));
  const tn = write.teacherNotes;
  const doc: WorksheetDocument = {
    schemaVersion: SCHEMA_VERSION,
    question: settings.question,
    supportingQuestions: write.supportingQuestions.slice(0, 5),
    subject: settings.subject || "General",
    title: write.title || plan.title || settings.question,
    directAnswer: write.directAnswer || plan.directAnswerDraft,
    audience: settings.audience,
    format: settings.format,
    learningPlan,
    sections,
    activities,
    answerKey,
    diagrams: input.diagrams,
    teacherNotes: {
      overview: tn.overview,
      materials: tn.materials,
      safety: tn.safety,
      differentiation: { moreSupport: tn.moreSupport, extension: tn.extension },
      misconceptionNotes: tn.misconceptionNotes,
      reviewSuggestions: tn.reviewSuggestions,
      curriculum: plan.curriculumSuggestions.length
        ? { status: "suggested-unverified", items: plan.curriculumSuggestions.map((c) => ({ expectation: c.expectation, objectiveIds: [], activityIds: [], coverageLimitations: c.coverageLimitations, verifiedInDocument: false })) }
        : { status: "none", items: [] },
      sensitivity: { level: tn.sensitivityLevel, notes: tn.sensitivityNotes, adultSupervision: tn.adultSupervision },
    },
    sources: input.sources,
    claims,
    layout: settings.layout,
    contentMode: input.contentMode,
    nextQuestion: write.nextQuestion,
    differentiation: settings.options.supportLevel,
  };
  estimatePages(doc);
  return doc;
}

const PX_PER_MM = 96 / 25.4;

/** Rough section height in mm, used when the browser layout engine is not available. */
export function estimateSectionMm(doc: WorksheetDocument, s: Section): number {
  const t = TYPE_SCALE[doc.layout.fontScale];
  const content = contentBoxMm(doc.layout.pageSize, doc.layout.orientation, doc.layout.marginsMm, doc.layout.bindingMm);
  const charsPerLine = Math.max(30, (content.w * 2.83) / (t.body * 0.5));
  const lineMm = (t.body * 1.42) / 2.83;
  const textMm = (txt: string) => Math.ceil(stripInline(txt).length / charsPerLine + (txt.match(/\n\s*\n/g)?.length ?? 0)) * lineMm;
  const writeLine = lineHeightMm(doc.layout);
  let h = (s.heading ? t.h2 / 2.83 + 3 : 0) + textMm(s.body) + 5;
  if (s.kind === "explanation" && doc.sections.find((x) => x.kind === "explanation") === s) h += textMm(doc.directAnswer) + 8;
  if (s.kind === "vocabulary") h += s.terms.length * lineMm * 1.6;
  if (["prediction", "reflection"].includes(s.kind)) h += 2 * writeLine + 8;
  if (s.kind === "recall") h += 3 * writeLine + 8;
  if (s.diagramId) {
    const d = doc.diagrams.find((x) => x.id === s.diagramId);
    if (d) {
      const g = compileDiagram(d.spec, d.labelOverrides);
      h += (content.w * (d.widthPct / 100) * (g.height + (g.legend.length ? 30 : 0))) / g.width + 8;
    }
  }
  if (s.activityId) {
    const a = doc.activities.find((x) => x.id === s.activityId);
    if (a) {
      h += textMm(a.title) + textMm(a.instructions) + 6;
      if (a.supportOptions.wordBank.length) h += 8;
      if (a.diagramId) {
        const d = doc.diagrams.find((x) => x.id === a.diagramId);
        if (d) {
          const g = compileDiagram(d.spec, d.labelOverrides);
          h += (content.w * (g.height + 30)) / g.width + 6;
        }
      }
      for (const it of a.items) {
        h += textMm(it.prompt) + (it.options.length ? lineMm + 2 : 0) + (it.givenAnswer ? lineMm + 2 : a.responseMode === "draw" ? Math.max(3, it.answerLines) * writeLine : (it.options.length ? Math.min(it.answerLines, 1) : it.answerLines) * writeLine) + 2.5;
      }
      if (a.type === "match") h = textMm(a.title) + textMm(a.instructions) + a.items.length * (lineMm + 2) + 10;
    }
  }
  return h;
}

export function estimatePages(doc: WorksheetDocument) {
  const content = contentBoxMm(doc.layout.pageSize, doc.layout.orientation, doc.layout.marginsMm, doc.layout.bindingMm);
  const t = TYPE_SCALE[doc.layout.fontScale];
  const titleMm = (t.title * 1.1 * Math.ceil(doc.question.length / 38)) / 2.83 + 14;
  packPages(
    doc,
    doc.sections.map((s) => estimateSectionMm(doc, s) * PX_PER_MM),
    content.h * PX_PER_MM,
    titleMm * PX_PER_MM,
  );
}

/**
 * Greedy packing with keep-with-next. Hidden sections take no space. A
 * section taller than a page gets a page to itself and is reported as overflow
 * by the measured check; text is never shrunk to fit.
 */
export function packPages(doc: WorksheetDocument, heightsPx: number[], pageHeightPx: number, titleHeightPx: number) {
  let page = 1;
  let used = titleHeightPx;
  const n = doc.sections.length;
  for (let i = 0; i < n; i++) {
    const s = doc.sections[i];
    if (s.hidden) {
      s.page = page;
      continue;
    }
    let h = heightsPx[i];
    // keep-with-next: treat this section and the following one as a unit
    if (s.keepWithNext && i + 1 < n && !doc.sections[i + 1].hidden) h += heightsPx[i + 1];
    if (used + h > pageHeightPx && used > (page === 1 ? titleHeightPx : 0)) {
      page++;
      used = 0;
    }
    s.page = page;
    used += heightsPx[i];
  }
}
