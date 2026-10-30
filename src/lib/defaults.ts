import type { LayoutSettings, WorksheetDocument } from "./schema/document";
import type { ProjectSettings } from "./db/store";

export function defaultLayout(): LayoutSettings {
  return {
    pageSize: "letter",
    orientation: "portrait",
    marginsMm: { top: 16, bottom: 16, inner: 16, outer: 16 },
    bindingMm: 0,
    fontScale: "standard",
    writingSpace: "standard",
    colourMode: "bw",
    accentColour: "#1f5f8b",
    visualFamily: "field-notes",
    showNameDate: true,
    showPageNumbers: true,
    brand: { name: "", footer: "", copyright: "" },
    studentReferences: "short",
  };
}

export const FORMAT_PAGES: Record<WorksheetDocument["format"]["kind"], number> = {
  "one-page": 1,
  "two-page": 2,
  "mini-workbook": 4,
  custom: 3,
};

export function defaultSettings(question = ""): ProjectSettings {
  return {
    question,
    supportingQuestions: [],
    subject: "",
    scope: "",
    requiredConcepts: [],
    excludedConcepts: [],
    realWorldContext: "",
    learnerInterests: "",
    audience: {
      ageMin: 8,
      ageMax: 10,
      grade: "",
      readingDemand: "developing",
      priorKnowledge: "some",
      intendedUse: "independent",
      language: "en",
      regionalConventions: { spelling: "en-CA", units: "metric" },
      supportPreferences: { vocabularySupport: true, sentenceStarters: false, oralAlternatives: false, drawingAlternatives: false },
    },
    format: { kind: "two-page", targetStudentPages: 2, estimatedMinutes: 30, grouping: "individual" },
    layout: defaultLayout(),
    contentMode: "research",
    options: {
      investigation: false,
      discussion: false,
      retrievalCard: true,
      extension: true,
      vocabulary: true,
      assessmentEmphasis: "balanced",
      supportLevel: "standard",
      curriculumReference: "",
    },
    budget: { maxCostUsd: 2 },
    clarifications: [],
    userSources: [],
  };
}

export function audienceSummary(a: WorksheetDocument["audience"]): string {
  return `ages ${a.ageMin}–${a.ageMax}${a.grade ? ` (${a.grade})` : ""}; reading demand ${a.readingDemand} (independent of age); prior knowledge ${a.priorKnowledge}; use: ${a.intendedUse}; spelling ${a.regionalConventions.spelling}; units ${a.regionalConventions.units}`;
}
