/** Small builders that keep the hand-written sample documents readable. */
import type { Activity, AnswerKeyEntry, Claim, Diagram, Section, WorksheetDocument } from "../schema/document";
import { SCHEMA_VERSION } from "../schema/document";
import { defaultLayout } from "../defaults";
import type { DiagramSpec } from "../schema/diagram";

export function sec(id: string, kind: Section["kind"], page: number, fields: Partial<Section> = {}): Section {
  return { id, kind, heading: "", body: "", terms: [], page, optional: false, hidden: false, locked: false, keepWithNext: false, claimIds: [], ...fields };
}

export function act(id: string, fields: Partial<Activity> & Pick<Activity, "type" | "title" | "instructions" | "items" | "objectiveIds">): Activity {
  return {
    responseMode: "write",
    supportLevel: "standard",
    supportOptions: { wordBank: [] },
    required: true,
    scored: false,
    computations: [],
    coverInstruction: false,
    answerKeyId: `key-${id}`,
    id,
    ...fields,
  };
}

export const item = (id: string, prompt: string, answerLines = 2, extra: Partial<Activity["items"][number]> = {}) => ({ id, prompt, options: [], answerLines, ...extra });

export function key(activityId: string, fields: Partial<AnswerKeyEntry> & Pick<AnswerKeyEntry, "answer" | "reasoning">): AnswerKeyEntry {
  return { id: `key-${activityId}`, activityId, itemAnswers: [], acceptableAlternatives: [], rubric: [], commonErrors: [], ...fields };
}

export function fig(id: string, spec: DiagramSpec, f: Pick<Diagram, "caption" | "altText" | "longDescription" | "teachingPurpose" | "lossIfRemoved"> & Partial<Diagram>): Diagram {
  return {
    id,
    spec,
    provenance: { kind: "deterministic-svg", note: "Drawn from a validated specification by Curiosity Studio's diagram engine.", rights: "owned" },
    reviewStatus: "unreviewed",
    decorative: false,
    labelOverrides: {},
    widthPct: 100,
    ...f,
  };
}

export const SAMPLE_BRAND = { name: "Curiosity Studio sample", footer: "Demo sample — not reviewed for publication", copyright: "" };

const DEMO_NOTE = "Demo sample drafted from general knowledge. It has not been checked against a source; verify before publishing.";

export function claim(id: string, text: string, usedIn: string[] = [], over: Partial<Claim> = {}): Claim {
  return { id, text, sourceIds: [], excerpts: [], evidenceStatus: "unsupported", statusAssignedBy: "no-sources", uncertainty: DEMO_NOTE, reviewStatus: "unreviewed", usedIn, ...over };
}

export function baseDoc(over: Partial<WorksheetDocument> & Pick<WorksheetDocument, "question" | "title" | "subject" | "directAnswer" | "learningPlan" | "sections">): WorksheetDocument {
  return {
    schemaVersion: SCHEMA_VERSION,
    supportingQuestions: [],
    audience: {
      ageMin: 8,
      ageMax: 10,
      readingDemand: "developing",
      priorKnowledge: "some",
      intendedUse: "independent",
      language: "en",
      regionalConventions: { spelling: "en-CA", units: "metric" },
      supportPreferences: { vocabularySupport: true, sentenceStarters: true, oralAlternatives: true, drawingAlternatives: false },
    },
    format: { kind: "two-page", targetStudentPages: 2, estimatedMinutes: 35, grouping: "individual" },
    activities: [],
    answerKey: [],
    diagrams: [],
    teacherNotes: {
      overview: "",
      materials: [],
      safety: [],
      differentiation: { moreSupport: "", extension: "" },
      misconceptionNotes: "",
      reviewSuggestions: "",
      curriculum: { status: "none", items: [] },
      sensitivity: { level: "none", notes: "", adultSupervision: false },
    },
    sources: [],
    claims: [],
    layout: { ...defaultLayout(), brand: SAMPLE_BRAND },
    contentMode: "demo-sample",
    nextQuestion: "",
    differentiation: "standard",
    ...over,
  };
}
