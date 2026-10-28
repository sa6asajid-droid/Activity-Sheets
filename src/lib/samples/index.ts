/**
 * Demo samples. They are drafted from general knowledge and are NOT marked
 * reviewed: their claims carry "no sources" and every diagram awaits human
 * review, so the quality screen shows exactly what an editor must still check.
 */
import type { WorksheetDocument } from "../schema/document";
import type { Store } from "../db/store";
import { seedSample, shadowsSample } from "./science";
import { fractionsSample, historiansSample, inflationSample, leverSample } from "./more";
import { defaultSettings, FORMAT_PAGES } from "../defaults";
import { runQualityChecks } from "../quality/checks";
import type { InterpretOutT } from "../pipeline/llm-schemas";
import { estimatePages } from "../pipeline/assemble";
import type { LayoutEngine } from "../pipeline/pipeline";

export interface SampleDef {
  key: string;
  build: () => WorksheetDocument;
}

export const SAMPLES: SampleDef[] = [
  { key: "shadows", build: shadowsSample },
  { key: "seed", build: seedSample },
  { key: "fractions", build: fractionsSample },
  { key: "historians", build: historiansSample },
  { key: "lever", build: leverSample },
  { key: "inflation", build: inflationSample },
];

export const SAMPLE_FOLDER = "Demo samples";

/** The deliberately ambiguous example: stops at clarification. */
export const AMBIGUOUS_INTERPRET: InterpretOutT = {
  interpretedQuestion: "How big is a mole?",
  questionType: "what",
  scope: "Depends on the meaning chosen.",
  subject: "Science",
  ambiguities: [
    {
      term: "mole",
      meanings: ["the small burrowing animal", "the mole as a unit of amount in chemistry", "a mole (spot) on the skin"],
      clarifyingQuestion: "Which “mole” do you mean: the animal, the chemistry unit, or a spot on the skin?",
    },
  ],
  needsClarification: true,
  supported: true,
  unsupportedReason: "",
  sensitivity: { level: "none", reasons: ["If the skin meaning is chosen, the sheet must avoid individual medical advice."], adultSupervisionLikely: false },
  prerequisites: [],
  proposedObjectives: [{ text: "Depends on the meaning chosen", evidence: "—" }],
};

export async function seedSamples(store: Store, layout: LayoutEngine | null, opts: { force?: boolean } = {}) {
  const existing = store.listProjects({ includeArchived: true }).filter((p) => p.isSample);
  if (existing.length && !opts.force) return { created: 0 };
  let created = 0;
  for (const s of SAMPLES) {
    let doc = s.build();
    estimatePages(doc);
    if (layout) {
      try {
        doc = await layout.autoPaginate(doc);
      } catch {
        /* keep the estimate; the editor measures again */
      }
    }
    let measured: Awaited<ReturnType<LayoutEngine["measure"]>> | undefined;
    if (layout) measured = await layout.measure(doc).catch(() => undefined);
    doc.qualityReport = runQualityChecks(doc, { measuredPages: measured?.pages, studentHtml: measured?.studentHtml });
    const settings = {
      ...defaultSettings(doc.question),
      subject: doc.subject,
      audience: doc.audience,
      format: doc.format,
      layout: doc.layout,
      contentMode: "unverified-draft" as const,
    };
    const p = store.createProject({ title: doc.title, settings, folder: SAMPLE_FOLDER, isSample: true });
    store.saveDraft(p.id, doc, null);
    store.createRevision(p.id, doc, "snapshot", "Demo sample (not reviewed)");
    store.updateProject(p.id, { status: "needs-review" });
    created++;
  }
  // Ambiguous example: a plan job paused for clarification.
  const settings = defaultSettings("How big is a mole?");
  settings.format = { kind: "one-page", targetStudentPages: FORMAT_PAGES["one-page"], estimatedMinutes: 20, grouping: "individual" };
  const p = store.createProject({ title: "How big is a mole? (needs clarification)", settings, folder: SAMPLE_FOLDER, isSample: true });
  const job = store.createJob(p.id, "plan", {}, { interpret: AMBIGUOUS_INTERPRET });
  store.updateJob(job.id, { status: "awaiting-input", stage: "interpret", message: "The question can be read in more than one way. Choose what you mean to continue." });
  created++;
  return { created };
}
