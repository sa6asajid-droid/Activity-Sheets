/**
 * Versioned, validated document model for Curiosity Studio.
 *
 * The structured WorksheetDocument is the single source of truth. Previews,
 * PDFs, HTML and plain-text exports are all rendered from it; edits are made
 * to it, never reverse-engineered from rendered output.
 *
 * Text fields use a constrained inline markup (see `inline.ts`): **bold**,
 * _italic_ and [[term]]. Arbitrary HTML is never stored or rendered.
 */
import { z } from "zod";
import { DiagramSpecSchema } from "./diagram";

export const SCHEMA_VERSION = 2;

const id = z.string().min(1).max(80).regex(/^[A-Za-z0-9_.:-]+$/, "IDs may contain letters, digits, _ . : -");
const shortText = z.string().max(400);
const text = z.string().max(6000);

// ---------------------------------------------------------------- audience

export const ReadingDemand = z.enum(["early", "developing", "fluent", "advanced"]);
export const PriorKnowledge = z.enum(["new", "some", "confident"]);
export const IntendedUse = z.enum(["independent", "adult-supported", "classroom", "homeschool"]);

export const AudienceProfileSchema = z.object({
  ageMin: z.number().int().min(3).max(19),
  ageMax: z.number().int().min(3).max(19),
  grade: z.string().max(60).optional(),
  readingDemand: ReadingDemand,
  priorKnowledge: PriorKnowledge,
  intendedUse: IntendedUse,
  language: z.string().max(20).default("en"),
  regionalConventions: z.object({
    spelling: z.enum(["en-CA", "en-US", "en-GB", "en-AU"]).default("en-CA"),
    units: z.enum(["metric", "imperial", "both"]).default("metric"),
  }),
  supportPreferences: z.object({
    vocabularySupport: z.boolean().default(true),
    sentenceStarters: z.boolean().default(false),
    oralAlternatives: z.boolean().default(false),
    drawingAlternatives: z.boolean().default(false),
  }),
});
export type AudienceProfile = z.infer<typeof AudienceProfileSchema>;

// ---------------------------------------------------------------- format & layout

export const FormatKind = z.enum(["one-page", "two-page", "mini-workbook", "custom"]);
export const FormatSettingsSchema = z.object({
  kind: FormatKind,
  targetStudentPages: z.number().int().min(1).max(20),
  estimatedMinutes: z.number().int().min(5).max(240),
  grouping: z.enum(["individual", "collaborative"]),
});
export type FormatSettings = z.infer<typeof FormatSettingsSchema>;

export const ColourMode = z.enum(["bw", "grayscale", "accent", "full"]);
export const VisualFamily = z.enum([
  "field-notes",
  "editorial",
  "technical-cutaway",
  "archival-notebook",
  "geometric",
  "early-years",
]);

export const LayoutSettingsSchema = z.object({
  pageSize: z.enum(["letter", "a4"]),
  orientation: z.enum(["portrait", "landscape"]).default("portrait"),
  marginsMm: z.object({
    top: z.number().min(6).max(40),
    bottom: z.number().min(6).max(40),
    inner: z.number().min(6).max(40),
    outer: z.number().min(6).max(40),
  }),
  bindingMm: z.number().min(0).max(25).default(0),
  fontScale: z.enum(["standard", "large", "extra-large"]),
  writingSpace: z.enum(["compact", "standard", "generous"]),
  colourMode: ColourMode,
  accentColour: z.string().regex(/^#[0-9a-fA-F]{6}$/).default("#1f5f8b"),
  visualFamily: VisualFamily,
  showNameDate: z.boolean().default(true),
  showPageNumbers: z.boolean().default(true),
  brand: z.object({
    name: z.string().max(80).default(""),
    footer: z.string().max(160).default(""),
    copyright: z.string().max(160).default(""),
    logoAssetId: z.string().max(80).optional(),
  }),
  studentReferences: z.enum(["none", "short", "full"]).default("short"),
});
export type LayoutSettings = z.infer<typeof LayoutSettingsSchema>;

// ---------------------------------------------------------------- learning plan

export const StrategyId = z.enum([
  "prior-knowledge-activation",
  "prediction-and-revisit",
  "misconception-address",
  "cognitive-load-chunking",
  "explicit-explanation",
  "worked-example",
  "faded-example",
  "guided-inquiry",
  "text-visual-integration",
  "retrieval-practice",
  "spaced-review",
  "metacognitive-prompt",
  "purposeful-choice",
  "real-world-connection",
  "structured-discussion",
  "experiential-observation",
  "formative-check",
  "examples-and-non-examples",
  "evidence-reasoning",
]);
export type StrategyIdT = z.infer<typeof StrategyId>;

export const LearningObjectiveSchema = z.object({
  id,
  text: shortText.min(3),
  evidence: shortText, // what a learner would do to show it
});

export const MisconceptionSchema = z.object({
  id,
  text: shortText.min(3),
  correction: shortText,
  /** Where the expectation comes from. Never claimed as universal. */
  basis: z.enum(["source", "educator-experience", "plausible-not-verified"]),
  sourceIds: z.array(id).default([]),
});

export const LearningPlanSchema = z.object({
  questionType: z.enum(["why", "how", "what", "how-do-we-know", "counterfactual", "historical-social", "other"]),
  scope: text,
  learnerAssumptions: z.array(shortText).max(8),
  prerequisites: z.array(shortText).max(8),
  objectives: z.array(LearningObjectiveSchema).min(1).max(3),
  misconceptions: z.array(MisconceptionSchema).max(4),
  explanationSequence: z.array(shortText).min(1).max(8),
  selectedStrategies: z
    .array(z.object({ id: StrategyId, rationale: shortText }))
    .min(1)
    .max(6),
  assessmentMap: z.array(z.object({ objectiveId: id, activityIds: z.array(id) })),
  visualPlan: z.array(
    z.object({
      purpose: shortText,
      diagramType: z.string().max(40),
      lossIfRemoved: shortText,
      diagramId: id.optional(),
    }),
  ),
  supportOptions: z.array(shortText).max(8),
  extensionOptions: z.array(shortText).max(8),
  reviewPlan: z.object({
    retrievalCard: z.boolean(),
    suggestedReviewDays: z.array(z.number().int().min(1).max(120)).max(5),
  }),
  rationale: text,
});
export type LearningPlan = z.infer<typeof LearningPlanSchema>;

// ---------------------------------------------------------------- evidence

export const SourceSchema = z.object({
  id,
  title: shortText.min(1),
  authorOrOrganization: shortText.optional(),
  location: z.object({
    kind: z.enum(["url", "upload", "pasted", "book"]),
    value: z.string().max(2000),
  }),
  publicationDate: z.string().max(40).optional(),
  retrievedAt: z.string().max(40),
  excerpt: z.string().max(4000),
  locator: z.string().max(200).optional(),
  sourceType: z.enum(["reference", "government", "museum", "academic", "educational", "news", "primary", "user-supplied", "other"]),
  licenceStatus: z.enum(["unknown", "read-only", "quotable-short-excerpt", "open-licence", "public-domain", "owned"]),
});
export type Source = z.infer<typeof SourceSchema>;

export const EvidenceStatus = z.enum(["supported", "partially-supported", "unsupported", "contested", "inference", "speculation"]);
export const ReviewStatus = z.enum(["unreviewed", "accepted", "needs-change", "rejected"]);

export const ClaimSchema = z.object({
  id,
  text: shortText.min(3),
  sourceIds: z.array(id),
  excerpts: z.array(z.string().max(1200)).default([]),
  evidenceStatus: EvidenceStatus,
  /** Who assigned the evidence status. A model assessment is never verification. */
  statusAssignedBy: z.enum(["no-sources", "model-assessment", "human-reviewer", "deterministic"]),
  uncertainty: shortText.optional(),
  reviewStatus: ReviewStatus,
  /** Section or activity IDs whose text depends on this claim. */
  usedIn: z.array(id).default([]),
});
export type Claim = z.infer<typeof ClaimSchema>;

// ---------------------------------------------------------------- activities

export const ActivityType = z.enum([
  "label",
  "match",
  "sequence",
  "compare",
  "predict-explain",
  "interpret-evidence",
  "complete-worked-example",
  "solve",
  "sort",
  "read-graph",
  "annotate",
  "draw-model",
  "explain-misconception",
  "apply-new-setting",
  "observe",
  "discuss",
  "short-answer",
  "multiple-choice",
  "recall",
  "reflect",
]);
export type ActivityTypeT = z.infer<typeof ActivityType>;

export const ResponseMode = z.enum(["write", "draw", "label", "circle", "match", "order", "tick", "oral"]);

export const ActivityItemSchema = z.object({
  id,
  prompt: shortText,
  /** For match: the right-hand option text; for sort: the category; for choice: the options. */
  options: z.array(shortText).max(8).default([]),
  /** Lines (or drawing-box height in lines) reserved for this item. */
  answerLines: z.number().int().min(0).max(20).default(2),
  /** Worked-example step already completed for the learner. */
  givenAnswer: shortText.optional(),
});

export const ComputationSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("fraction-equivalence"),
    itemId: id,
    a: z.tuple([z.number().int(), z.number().int().min(1)]),
    b: z.tuple([z.number().int(), z.number().int().min(1)]),
    /** The answer key's claim: are the two fractions equivalent? */
    expected: z.boolean(),
  }),
  z.object({
    kind: z.literal("missing-numerator"),
    itemId: id,
    a: z.tuple([z.number().int(), z.number().int().min(1)]),
    denominator: z.number().int().min(1),
    expected: z.number(),
  }),
  z.object({
    kind: z.literal("arithmetic"),
    itemId: id,
    expression: z.string().max(120).regex(/^[0-9+\-*/(). ]+$/, "Only digits and + - * / ( ) are allowed"),
    expected: z.number(),
    tolerance: z.number().min(0).default(0),
  }),
  z.object({
    kind: z.literal("percent-change"),
    itemId: id,
    from: z.number(),
    to: z.number(),
    expected: z.number(),
    tolerance: z.number().min(0).default(0.05),
  }),
  z.object({
    kind: z.literal("mechanical-advantage"),
    itemId: id,
    effortArm: z.number().positive(),
    loadArm: z.number().positive(),
    expected: z.number(),
    tolerance: z.number().min(0).default(0.01),
  }),
]);
export type Computation = z.infer<typeof ComputationSchema>;

export const ActivitySchema = z.object({
  id,
  objectiveIds: z.array(id).min(1),
  type: ActivityType,
  title: shortText,
  instructions: text,
  responseMode: ResponseMode,
  supportLevel: z.enum(["more-support", "standard", "extension"]),
  supportOptions: z.object({
    sentenceStarter: shortText.optional(),
    wordBank: z.array(z.string().max(60)).max(16).default([]),
    oralAlternative: shortText.optional(),
    drawingAlternative: shortText.optional(),
  }),
  items: z.array(ActivityItemSchema).max(16),
  /** Diagram the learner works on (label, annotate, read-graph). */
  diagramId: id.optional(),
  required: z.boolean().default(true),
  scored: z.boolean().default(false),
  marks: z.number().int().min(0).max(50).optional(),
  answerKeyId: id,
  computations: z.array(ComputationSchema).default([]),
  /** Ask the learner to cover the explanation first (print retrieval). */
  coverInstruction: z.boolean().default(false),
});
export type Activity = z.infer<typeof ActivitySchema>;

export const AnswerKeyEntrySchema = z.object({
  id,
  activityId: id,
  answer: text, // overall answer or sample response
  itemAnswers: z.array(z.object({ itemId: id, answer: shortText })).default([]),
  reasoning: text,
  acceptableAlternatives: z.array(shortText).default([]),
  rubric: z.array(z.object({ level: z.string().max(40), descriptor: shortText })).default([]),
  commonErrors: z.array(shortText).default([]),
  marks: z.number().int().min(0).max(50).optional(),
});
export type AnswerKeyEntry = z.infer<typeof AnswerKeyEntrySchema>;

// ---------------------------------------------------------------- diagrams

export const DiagramSchema = z.object({
  id,
  teachingPurpose: shortText.min(3),
  lossIfRemoved: shortText,
  spec: DiagramSpecSchema,
  caption: shortText,
  altText: z.string().max(400).min(3),
  longDescription: text,
  provenance: z.object({
    kind: z.enum(["deterministic-svg", "uploaded-image", "illustration-provider"]),
    note: shortText,
    rights: z.enum(["owned", "licensed", "unknown", "generated"]),
  }),
  reviewStatus: ReviewStatus,
  /** Decorative visuals must be marked optional. */
  decorative: z.boolean().default(false),
  /** Label overrides typed by the editor, keyed by scene element id. */
  labelOverrides: z.record(z.string(), z.string().max(200)).default({}),
  /** Width as a fraction of the content column. */
  widthPct: z.number().min(30).max(100).default(100),
});
export type Diagram = z.infer<typeof DiagramSchema>;

// ---------------------------------------------------------------- sections

export const SectionKind = z.enum([
  "hook",
  "prediction",
  "explanation",
  "vocabulary",
  "diagram",
  "activity",
  "investigation",
  "discussion",
  "recall",
  "reflection",
  "next-question",
  "safety",
  "note",
]);
export type SectionKindT = z.infer<typeof SectionKind>;

export const SectionSchema = z.object({
  id,
  kind: SectionKind,
  heading: shortText.default(""),
  body: text.default(""),
  /** Vocabulary entries or bullet points. */
  terms: z.array(z.object({ term: z.string().max(60), definition: shortText })).max(12).default([]),
  diagramId: id.optional(),
  activityId: id.optional(),
  /** 1-based student page this section is placed on. */
  page: z.number().int().min(1).max(40),
  optional: z.boolean().default(false),
  hidden: z.boolean().default(false),
  locked: z.boolean().default(false),
  keepWithNext: z.boolean().default(false),
  claimIds: z.array(id).default([]),
});
export type Section = z.infer<typeof SectionSchema>;

// ---------------------------------------------------------------- teacher notes, curriculum

export const CurriculumAlignmentSchema = z.object({
  status: z.enum(["none", "suggested-unverified", "verified-from-document"]),
  jurisdiction: z.string().max(120).optional(),
  documentTitle: z.string().max(200).optional(),
  documentVersion: z.string().max(80).optional(),
  items: z
    .array(
      z.object({
        expectation: shortText, // exact wording, only when verified
        code: z.string().max(40).optional(), // only when present in the source document
        location: z.string().max(120).optional(),
        objectiveIds: z.array(id),
        activityIds: z.array(id),
        coverageLimitations: shortText,
      }),
    )
    .default([]),
});

export const TeacherNotesSchema = z.object({
  overview: text,
  materials: z.array(shortText).default([]),
  safety: z.array(shortText).default([]),
  differentiation: z.object({ moreSupport: text.default(""), extension: text.default("") }),
  misconceptionNotes: text.default(""),
  reviewSuggestions: text.default(""),
  curriculum: CurriculumAlignmentSchema,
  sensitivity: z.object({
    level: z.enum(["none", "care", "specialist-review"]),
    notes: shortText.default(""),
    adultSupervision: z.boolean().default(false),
  }),
});

// ---------------------------------------------------------------- quality

export const QualityCategory = z.enum([
  "content-evidence",
  "teaching-assessment",
  "visual-accuracy",
  "accessibility",
  "print-pagination",
  "rights-sources",
  "schema",
]);
export const QualityIssueSchema = z.object({
  id,
  code: z.string().max(60),
  category: QualityCategory,
  severity: z.enum(["blocking", "warning", "info"]),
  affectedElementIds: z.array(z.string().max(80)),
  message: shortText,
  suggestedFix: shortText.default(""),
  /** Who raised it: deterministic code, rendered-layout measurement, or a model critique. */
  checkKind: z.enum(["deterministic", "layout-measurement", "model-critique", "heuristic"]),
  resolutionStatus: z.enum(["open", "resolved", "overridden"]),
  reviewer: z.string().max(80).optional(),
  overrideReason: z.string().max(400).optional(),
});
export type QualityIssue = z.infer<typeof QualityIssueSchema>;

export const QualityReportSchema = z.object({
  checkedAt: z.string(),
  issues: z.array(QualityIssueSchema),
  readability: z
    .object({ method: z.string(), estimatedGrade: z.number(), note: z.string() })
    .optional(),
  layoutMeasured: z.boolean().default(false),
});
export type QualityReport = z.infer<typeof QualityReportSchema>;

// ---------------------------------------------------------------- document

export const WorksheetDocumentSchema = z.object({
  schemaVersion: z.literal(SCHEMA_VERSION),
  question: shortText.min(3),
  supportingQuestions: z.array(shortText).max(5).default([]),
  subject: z.string().max(80),
  title: shortText,
  directAnswer: text.min(10),
  audience: AudienceProfileSchema,
  format: FormatSettingsSchema,
  learningPlan: LearningPlanSchema,
  sections: z.array(SectionSchema).min(1).max(60),
  activities: z.array(ActivitySchema).max(30),
  answerKey: z.array(AnswerKeyEntrySchema).max(30),
  diagrams: z.array(DiagramSchema).max(12),
  teacherNotes: TeacherNotesSchema,
  sources: z.array(SourceSchema).max(40),
  claims: z.array(ClaimSchema).max(80),
  layout: LayoutSettingsSchema,
  contentMode: z.enum(["research", "user-sources", "mixed", "unverified-draft", "demo-sample"]),
  nextQuestion: shortText.default(""),
  qualityReport: QualityReportSchema.optional(),
  differentiation: z.enum(["more-support", "standard", "extension"]).default("standard"),
});
export type WorksheetDocument = z.infer<typeof WorksheetDocumentSchema>;

/**
 * Referential checks that a plain shape schema cannot express. Returns
 * human-readable problems; an empty array means the document is coherent.
 */
export function referentialProblems(doc: WorksheetDocument): string[] {
  const problems: string[] = [];
  const objectiveIds = new Set(doc.learningPlan.objectives.map((o) => o.id));
  const activityIds = new Set(doc.activities.map((a) => a.id));
  const diagramIds = new Set(doc.diagrams.map((d) => d.id));
  const sourceIds = new Set(doc.sources.map((s) => s.id));
  const claimIds = new Set(doc.claims.map((c) => c.id));
  const keyIds = new Set(doc.answerKey.map((k) => k.id));

  const dupes = (ids: string[], label: string) => {
    const seen = new Set<string>();
    for (const i of ids) {
      if (seen.has(i)) problems.push(`Duplicate ${label} id "${i}".`);
      seen.add(i);
    }
  };
  dupes(doc.sections.map((s) => s.id), "section");
  dupes(doc.activities.map((a) => a.id), "activity");
  dupes(doc.diagrams.map((d) => d.id), "diagram");
  dupes(doc.sources.map((s) => s.id), "source");
  dupes(doc.claims.map((c) => c.id), "claim");
  dupes(doc.answerKey.map((k) => k.id), "answer key");

  for (const s of doc.sections) {
    if (s.diagramId && !diagramIds.has(s.diagramId)) problems.push(`Section ${s.id} references missing diagram ${s.diagramId}.`);
    if (s.activityId && !activityIds.has(s.activityId)) problems.push(`Section ${s.id} references missing activity ${s.activityId}.`);
    for (const c of s.claimIds) if (!claimIds.has(c)) problems.push(`Section ${s.id} references missing claim ${c}.`);
  }
  for (const a of doc.activities) {
    for (const o of a.objectiveIds) if (!objectiveIds.has(o)) problems.push(`Activity ${a.id} references missing objective ${o}.`);
    if (a.diagramId && !diagramIds.has(a.diagramId)) problems.push(`Activity ${a.id} references missing diagram ${a.diagramId}.`);
    if (!keyIds.has(a.answerKeyId)) problems.push(`Activity ${a.id} has no answer-key entry (${a.answerKeyId}).`);
  }
  for (const k of doc.answerKey) {
    if (!activityIds.has(k.activityId)) problems.push(`Answer key ${k.id} references missing activity ${k.activityId}.`);
  }
  for (const c of doc.claims) {
    for (const s of c.sourceIds) if (!sourceIds.has(s)) problems.push(`Claim ${c.id} cites missing source ${s}.`);
  }
  for (const m of doc.learningPlan.assessmentMap) {
    if (!objectiveIds.has(m.objectiveId)) problems.push(`Assessment map references missing objective ${m.objectiveId}.`);
    for (const a of m.activityIds) if (!activityIds.has(a)) problems.push(`Assessment map references missing activity ${a}.`);
  }
  if (doc.audience.ageMin > doc.audience.ageMax) problems.push("Audience minimum age is greater than maximum age.");
  return problems;
}

export type ValidationResult =
  | { ok: true; doc: WorksheetDocument }
  | { ok: false; errors: string[] };

export function validateDocument(input: unknown): ValidationResult {
  const parsed = WorksheetDocumentSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      errors: parsed.error.issues.slice(0, 30).map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`),
    };
  }
  const problems = referentialProblems(parsed.data);
  if (problems.length) return { ok: false, errors: problems };
  return { ok: true, doc: parsed.data };
}
