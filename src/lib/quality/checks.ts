/**
 * Quality gates. Every issue records how it was found (deterministic code,
 * rendered-layout measurement, heuristic, or model critique) so reviewers
 * know what each one is worth. Nothing here certifies truth, accessibility,
 * rights clearance or educational effectiveness, and there is no overall score.
 */
import type { QualityIssue, QualityReport, WorksheetDocument } from "../schema/document";
import { validateDocument } from "../schema/document";
import { checkDiagram } from "../diagrams/checks";
import { runComputation } from "../computations";
import { fleschKincaidGrade, stripInline } from "../text";

export interface MeasuredPage {
  page: number;
  kind: string;
  overflowPx: number;
  clippedSections: string[];
}

export interface CheckInputs {
  /** Pages measured in a real browser (preview iframe or export renderer). */
  measuredPages?: MeasuredPage[];
  /** Rendered student HTML, used to prove teacher content did not leak. */
  studentHtml?: string;
  /** Issues from a previous report, so overrides and resolutions persist. */
  previous?: QualityIssue[];
  /** Model critique findings (optional). */
  critique?: Omit<QualityIssue, "id" | "resolutionStatus" | "checkKind">[];
}

const READING_BANDS: Record<WorksheetDocument["audience"]["readingDemand"], [number, number]> = {
  early: [0, 2.9],
  developing: [1.5, 4.9],
  fluent: [3, 7.9],
  advanced: [5, 11],
};

type Draft = Omit<QualityIssue, "id" | "resolutionStatus">;

function norm(s: string) {
  return stripInline(s).toLowerCase().replace(/<[^>]+>/g, " ").replace(/&[a-z#0-9]+;/g, " ").replace(/\s+/g, " ").trim();
}

/** All text the student pages are allowed to show. */
function studentFacingText(doc: WorksheetDocument): string {
  const parts: string[] = [doc.question, doc.directAnswer, doc.subject, doc.nextQuestion, ...doc.supportingQuestions];
  for (const s of doc.sections) parts.push(s.heading, s.body, ...s.terms.flatMap((t) => [t.term, t.definition]));
  for (const a of doc.activities)
    parts.push(
      a.title,
      a.instructions,
      a.supportOptions.sentenceStarter ?? "",
      a.supportOptions.oralAlternative ?? "",
      a.supportOptions.drawingAlternative ?? "",
      ...a.supportOptions.wordBank,
      ...a.items.flatMap((i) => [i.prompt, i.givenAnswer ?? "", ...i.options]),
    );
  for (const d of doc.diagrams) {
    parts.push(d.caption, d.altText, d.longDescription, JSON.stringify(d.spec), ...Object.values(d.labelOverrides));
  }
  for (const s of doc.sources) parts.push(s.title, s.authorOrOrganization ?? "");
  return norm(parts.join(" \n "));
}

/**
 * Find answer-key text in the rendered student HTML that does not come from
 * any student-facing field — i.e. a leak from the answer key or notes.
 */
export function findAnswerLeaks(doc: WorksheetDocument, studentHtml: string): string[] {
  const allowed = studentFacingText(doc);
  const rendered = norm(studentHtml);
  const leaks: string[] = [];
  const candidates: string[] = [];
  for (const k of doc.answerKey) {
    candidates.push(k.answer, k.reasoning, ...k.commonErrors, ...k.acceptableAlternatives, ...k.rubric.map((r) => r.descriptor));
    candidates.push(...k.itemAnswers.map((i) => i.answer));
  }
  candidates.push(doc.teacherNotes.overview, doc.teacherNotes.misconceptionNotes, doc.learningPlan.rationale);
  for (const c of doc.claims) candidates.push(...c.excerpts);
  for (const raw of candidates) {
    const t = norm(raw);
    if (t.length < 16) continue; // short answers ("3/4", "true") cannot be distinguished from prompts
    if (allowed.includes(t)) continue;
    if (rendered.includes(t)) leaks.push(raw.slice(0, 80));
  }
  return leaks;
}

export function runQualityChecks(doc: WorksheetDocument, inputs: CheckInputs = {}): QualityReport {
  const issues: Draft[] = [];
  const push = (d: Omit<Draft, "suggestedFix"> & { suggestedFix?: string }) => issues.push({ suggestedFix: "", ...d });

  // ---------------- schema
  const v = validateDocument(doc);
  if (!v.ok) {
    for (const e of v.errors) push({ code: "schema-invalid", category: "schema", severity: "blocking", affectedElementIds: [], message: e, checkKind: "deterministic" });
  }

  const visibleSections = doc.sections.filter((s) => !s.hidden);
  const visibleActivityIds = new Set(visibleSections.filter((s) => s.activityId).map((s) => s.activityId!));

  // ---------------- teaching & assessment
  if (!visibleSections.some((s) => s.kind === "explanation")) {
    push({ code: "no-explanation", category: "teaching-assessment", severity: "blocking", affectedElementIds: [], message: "The worksheet has no visible explanation, so the direct answer is not shown to learners.", suggestedFix: "Unhide or add an explanation section.", checkKind: "deterministic" });
  }
  for (const a of doc.activities) {
    const key = doc.answerKey.find((k) => k.id === a.answerKeyId);
    if (!key && a.required) {
      push({ code: "answer-key-missing", category: "teaching-assessment", severity: "blocking", affectedElementIds: [a.id], message: `Required activity "${a.title}" has no answer-key entry.`, suggestedFix: "Write the answer-key entry or regenerate this activity.", checkKind: "deterministic" });
    }
    if (key && !key.answer.trim()) {
      push({ code: "answer-key-empty", category: "teaching-assessment", severity: "blocking", affectedElementIds: [a.id, key.id], message: `Answer-key entry for "${a.title}" is empty.`, checkKind: "deterministic" });
    }
    if (key && a.items.length > 1 && key.itemAnswers.length > 0) {
      const missing = a.items.filter((it) => !it.givenAnswer && !key.itemAnswers.some((ia) => ia.itemId === it.id));
      if (missing.length) {
        push({ code: "answer-key-incomplete", category: "teaching-assessment", severity: "warning", affectedElementIds: [a.id, ...missing.map((m) => m.id)], message: `Answer key for "${a.title}" does not cover ${missing.length} item(s).`, checkKind: "deterministic" });
      }
    }
    if (key && ["predict-explain", "explain-misconception", "apply-new-setting", "interpret-evidence", "discuss", "short-answer", "reflect"].includes(a.type) && a.scored && key.rubric.length === 0) {
      push({ code: "rubric-missing", category: "teaching-assessment", severity: "warning", affectedElementIds: [a.id], message: `Scored open-ended activity "${a.title}" has no rubric.`, suggestedFix: "Add a short rubric so different wordings can be judged fairly.", checkKind: "deterministic" });
    }
    if (a.objectiveIds.length === 0) {
      push({ code: "activity-unaligned", category: "teaching-assessment", severity: "blocking", affectedElementIds: [a.id], message: `Activity "${a.title}" is not aligned to any learning objective.`, checkKind: "deterministic" });
    }
    for (const c of a.computations) {
      const r = runComputation(c);
      if (!r.ok) {
        push({ code: "computation-failed", category: "teaching-assessment", severity: "blocking", affectedElementIds: [a.id, c.itemId], message: `Answer check failed for "${a.title}": expected ${r.expected}, computed ${r.computed}. ${r.message}`, suggestedFix: "Correct the answer key (or the item) and recheck.", checkKind: "deterministic" });
      }
    }
    if (a.responseMode === "draw" && !a.supportOptions.oralAlternative && !a.supportOptions.drawingAlternative) {
      push({ code: "draw-alternative", category: "accessibility", severity: "info", affectedElementIds: [a.id], message: `"${a.title}" asks for a drawing. Consider an oral or written alternative that assesses the same objective.`, checkKind: "heuristic" });
    }
    if ((a.type === "label" || a.type === "annotate" || a.type === "read-graph") && !a.supportOptions.oralAlternative) {
      push({ code: "visual-task-adaptation", category: "accessibility", severity: "info", affectedElementIds: [a.id], message: `"${a.title}" depends on a visual. Learners who use screen readers or tactile graphics will need an adapted version.`, checkKind: "heuristic" });
    }
    if (a.type === "recall" && !a.coverInstruction) {
      const sec = doc.sections.find((s) => s.activityId === a.id);
      const expPage = doc.sections.find((s) => s.kind === "explanation")?.page;
      if (sec && expPage === sec.page) {
        push({ code: "recall-copyable", category: "teaching-assessment", severity: "warning", affectedElementIds: [a.id], message: `Recall task "${a.title}" sits on the same page as the explanation, so it can be copied rather than recalled.`, suggestedFix: "Move it to a later page or add a cover-the-explanation instruction.", checkKind: "deterministic" });
      }
    }
  }
  for (const o of doc.learningPlan.objectives) {
    if (!doc.activities.some((a) => a.objectiveIds.includes(o.id) && visibleActivityIds.has(a.id))) {
      push({ code: "objective-unassessed", category: "teaching-assessment", severity: "warning", affectedElementIds: [o.id], message: `Objective "${o.text}" has no visible activity that gives evidence of it.`, checkKind: "deterministic" });
    }
  }
  for (const s of doc.sections) {
    if (s.kind === "activity" && !s.activityId) push({ code: "section-empty-activity", category: "schema", severity: "blocking", affectedElementIds: [s.id], message: `Section ${s.id} is an activity slot with no activity.`, checkKind: "deterministic" });
  }

  // ---------------- content & evidence
  if (doc.contentMode === "unverified-draft") {
    push({ code: "unverified-draft", category: "content-evidence", severity: "warning", affectedElementIds: [], message: "This worksheet was drafted without research or supplied sources. Treat every factual statement as unverified.", checkKind: "deterministic" });
  }
  if (doc.sources.length === 0) {
    push({ code: "no-sources", category: "content-evidence", severity: "warning", affectedElementIds: [], message: "No sources are attached.", suggestedFix: "Add sources in the research panel, or keep this labelled as an unverified draft.", checkKind: "deterministic" });
  }
  for (const c of doc.claims) {
    if (c.evidenceStatus === "unsupported") {
      push({ code: "claim-unsupported", category: "content-evidence", severity: "warning", affectedElementIds: [c.id, ...c.usedIn], message: `Unsupported claim: “${c.text}”`, suggestedFix: "Find a source, soften the statement, or remove it.", checkKind: c.statusAssignedBy === "model-assessment" ? "model-critique" : "deterministic" });
    } else if (c.evidenceStatus === "contested") {
      push({ code: "claim-contested", category: "content-evidence", severity: "warning", affectedElementIds: [c.id, ...c.usedIn], message: `Contested claim: “${c.text}”. Present the disagreement and attribute each view.`, checkKind: "deterministic" });
    } else if (c.evidenceStatus === "partially-supported") {
      push({ code: "claim-partial", category: "content-evidence", severity: "warning", affectedElementIds: [c.id, ...c.usedIn], message: `Only partly supported: “${c.text}”`, checkKind: c.statusAssignedBy === "model-assessment" ? "model-critique" : "deterministic" });
    }
    if (c.reviewStatus === "unreviewed" && c.evidenceStatus === "supported" && c.statusAssignedBy === "model-assessment") {
      push({ code: "claim-needs-human", category: "content-evidence", severity: "info", affectedElementIds: [c.id], message: `“${c.text.slice(0, 90)}” was matched to a source by the model; a person has not confirmed it.`, checkKind: "model-critique" });
    }
  }
  const cur = doc.teacherNotes.curriculum;
  if (cur.status === "suggested-unverified") {
    push({ code: "curriculum-unverified", category: "content-evidence", severity: "warning", affectedElementIds: [], message: "Suggested topic alignment—not verified curriculum alignment.", checkKind: "deterministic" });
  }
  if (cur.status === "verified-from-document" && cur.items.some((i) => !i.location)) {
    push({ code: "curriculum-location", category: "content-evidence", severity: "warning", affectedElementIds: [], message: "A curriculum mapping has no location in the source document.", checkKind: "deterministic" });
  }
  if (doc.teacherNotes.sensitivity.level === "specialist-review") {
    push({ code: "specialist-review", category: "content-evidence", severity: "warning", affectedElementIds: [], message: `This topic needs specialist review before use. ${doc.teacherNotes.sensitivity.notes}`, checkKind: "heuristic" });
  }

  // ---------------- safety
  if (doc.teacherNotes.sensitivity.adultSupervision && !visibleSections.some((s) => s.kind === "safety")) {
    push({ code: "safety-note-missing", category: "content-evidence", severity: "blocking", affectedElementIds: [], message: "The practical task needs adult supervision, but no safety note appears on the student pages.", suggestedFix: "Add a safety section beside the investigation.", checkKind: "deterministic" });
  }

  // ---------------- visual accuracy & accessibility
  for (const d of doc.diagrams) {
    const used = visibleSections.some((s) => s.diagramId === d.id) || doc.activities.some((a) => a.diagramId === d.id && visibleActivityIds.has(a.id));
    if (!used) continue;
    for (const f of checkDiagram(d)) {
      const cat = f.code.includes("alt") || f.code.includes("description") || f.code.includes("legend") ? "accessibility" : "visual-accuracy";
      push({ code: f.code, category: cat, severity: f.severity, affectedElementIds: f.elementIds, message: f.message, checkKind: "deterministic" });
    }
    if (d.reviewStatus !== "accepted") {
      push({ code: "diagram-review", category: "visual-accuracy", severity: "warning", affectedElementIds: [d.id], message: `Diagram "${d.caption || d.id}" has not been reviewed by a person. Automated checks cannot confirm it is scientifically correct.`, suggestedFix: "Inspect it against the explanation and mark it accepted.", checkKind: "deterministic" });
    }
    if (d.provenance.rights === "unknown") {
      push({ code: "rights-unknown", category: "rights-sources", severity: "warning", affectedElementIds: [d.id], message: `Image rights are unknown for "${d.caption || d.id}".`, checkKind: "deterministic" });
    }
  }
  const prose = [doc.directAnswer, ...visibleSections.filter((s) => ["hook", "explanation", "investigation"].includes(s.kind)).map((s) => s.body)].join("\n");
  const grade = fleschKincaidGrade(prose);
  let readability: QualityReport["readability"];
  if (grade !== null) {
    const [lo, hi] = READING_BANDS[doc.audience.readingDemand];
    readability = { method: "Flesch–Kincaid grade (estimate)", estimatedGrade: grade, note: `Estimate only. Target band for “${doc.audience.readingDemand}” is about grade ${lo}–${hi}.` };
    if (grade > hi + 0.5) {
      push({ code: "reading-demand-high", category: "accessibility", severity: "warning", affectedElementIds: [], message: `Estimated reading demand (grade ${grade}) is above the requested “${doc.audience.readingDemand}” level. Surface estimates miss vocabulary and concept difficulty, so check by reading it.`, suggestedFix: "Shorten sentences or use the plain-language rewrite.", checkKind: "heuristic" });
    } else if (grade < lo - 1.5) {
      push({ code: "reading-demand-low", category: "accessibility", severity: "info", affectedElementIds: [], message: `Estimated reading demand (grade ${grade}) is below the requested level; make sure the language stays age-respectful.`, checkKind: "heuristic" });
    }
  }
  if (doc.layout.colourMode !== "bw" && doc.diagrams.some((d) => d.spec.type === "labelled-scene" && d.spec.primitives.some((p) => "fill" in p && p.fill === "accent")) && doc.diagrams.every((d) => d.spec.type !== "labelled-scene" || d.spec.legend.length === 0)) {
    push({ code: "colour-only", category: "accessibility", severity: "warning", affectedElementIds: [], message: "Colour is used in a diagram without a legend or label; meaning must not depend on colour alone.", checkKind: "heuristic" });
  }

  // ---------------- print & pagination
  const studentPagesUsed = Math.max(0, ...visibleSections.map((s) => s.page));
  if (studentPagesUsed > doc.format.targetStudentPages) {
    push({ code: "page-count-exceeded", category: "print-pagination", severity: "warning", affectedElementIds: [], message: `Content uses ${studentPagesUsed} student pages; the selected format allows ${doc.format.targetStudentPages}.`, suggestedFix: "Add a page, shorten selected content, hide an optional activity, or change the format.", checkKind: "deterministic" });
  }
  for (const p of inputs.measuredPages ?? []) {
    if (p.overflowPx > 1) {
      push({ code: "text-clipped", category: "print-pagination", severity: "blocking", affectedElementIds: p.clippedSections, message: `Page ${p.page} (${p.kind}) overflows by ${Math.round(p.overflowPx)}px; content would be clipped.`, suggestedFix: "Reflow pages, add a page, shorten text, or hide an optional section. Text is never shrunk below the minimum size.", checkKind: "layout-measurement" });
    }
  }
  for (const a of doc.activities) {
    if (!visibleActivityIds.has(a.id)) continue;
    // Prompts with their own blanks ("Length: ____ cm") carry their answer space inline.
    const writeItems = a.items.filter((i) => !i.givenAnswer && (a.responseMode === "write" || a.responseMode === "draw") && i.options.length === 0 && !/_{4,}/.test(i.prompt));
    if (writeItems.some((i) => i.answerLines < (a.responseMode === "draw" ? 3 : 1))) {
      push({ code: "answer-space-compressed", category: "print-pagination", severity: "warning", affectedElementIds: [a.id], message: `"${a.title}" leaves too little room to answer.`, checkKind: "deterministic" });
    }
  }

  // ---------------- leaks
  if (inputs.studentHtml) {
    const leaks = findAnswerLeaks(doc, inputs.studentHtml);
    for (const l of leaks) {
      push({ code: "teacher-content-in-student", category: "teaching-assessment", severity: "blocking", affectedElementIds: [], message: `Student pages contain answer-key or teacher text: “${l}…”`, checkKind: "deterministic" });
    }
  }

  // ---------------- rights
  for (const s of doc.sources) {
    if (s.licenceStatus === "unknown" && s.excerpt.length > 600) {
      push({ code: "excerpt-long-unknown-rights", category: "rights-sources", severity: "info", affectedElementIds: [s.id], message: `Stored excerpt from “${s.title}” is long and its licence is unknown. Excerpts are kept for review and are not printed on student pages.`, checkKind: "deterministic" });
    }
  }

  for (const c of inputs.critique ?? []) issues.push({ ...c, checkKind: "model-critique" });

  // ---------------- merge with previous decisions
  const prev = inputs.previous ?? [];
  const key = (i: { code: string; affectedElementIds: string[]; message: string }) => `${i.code}|${i.affectedElementIds.join(",")}|${i.message}`;
  const prevMap = new Map(prev.map((p) => [key(p), p]));
  const out: QualityIssue[] = issues.map((d, idx) => {
    const old = prevMap.get(key(d));
    return {
      ...d,
      id: `q${idx + 1}`,
      resolutionStatus: old?.resolutionStatus === "overridden" ? "overridden" : "open",
      reviewer: old?.reviewer,
      overrideReason: old?.overrideReason,
    };
  });
  return { checkedAt: new Date().toISOString(), issues: out, readability, layoutMeasured: Boolean(inputs.measuredPages) };
}

export function blockingIssues(report: QualityReport | undefined): QualityIssue[] {
  return (report?.issues ?? []).filter((i) => i.severity === "blocking" && i.resolutionStatus === "open");
}
