/**
 * Schemas the model is asked to fill. They are deliberately plain (objects,
 * arrays, strings, numbers, booleans, enums; every field required) so they
 * map cleanly onto structured-output JSON Schema. Model output is then
 * converted and validated again against the full document schemas.
 */
import { z } from "zod";
import { ActivityType, ResponseMode, SectionKind, StrategyId, EvidenceStatus } from "../schema/document";
import { ICON_NAMES } from "../schema/diagram";

export const InterpretOut = z.object({
  interpretedQuestion: z.string(),
  questionType: z.enum(["why", "how", "what", "how-do-we-know", "counterfactual", "historical-social", "other"]),
  scope: z.string(),
  subject: z.string(),
  ambiguities: z.array(z.object({ term: z.string(), meanings: z.array(z.string()), clarifyingQuestion: z.string() })),
  needsClarification: z.boolean(),
  supported: z.boolean(),
  unsupportedReason: z.string(),
  sensitivity: z.object({
    level: z.enum(["none", "care", "specialist-review"]),
    reasons: z.array(z.string()),
    adultSupervisionLikely: z.boolean(),
  }),
  prerequisites: z.array(z.string()),
  proposedObjectives: z.array(z.object({ text: z.string(), evidence: z.string() })),
});
export type InterpretOutT = z.infer<typeof InterpretOut>;

export const PlanOut = z.object({
  title: z.string(),
  directAnswerDraft: z.string(),
  scope: z.string(),
  learnerAssumptions: z.array(z.string()),
  prerequisites: z.array(z.string()),
  objectives: z.array(z.object({ id: z.string(), text: z.string(), evidence: z.string() })),
  misconceptions: z.array(
    z.object({ text: z.string(), correction: z.string(), basis: z.enum(["source", "plausible-not-verified"]), sourceIds: z.array(z.string()) }),
  ),
  explanationSequence: z.array(z.string()),
  selectedStrategies: z.array(z.object({ id: StrategyId, rationale: z.string() })),
  proposedActivities: z.array(z.object({ type: ActivityType, purpose: z.string(), objectiveIds: z.array(z.string()) })),
  proposedVisuals: z.array(
    z.object({
      diagramType: z.enum(["sequence", "comparison", "timeline", "light-shadow", "fraction-bars", "number-line", "lever", "bar-chart", "concept-map", "labelled-scene"]),
      purpose: z.string(),
      lossIfRemoved: z.string(),
    }),
  ),
  claims: z.array(
    z.object({
      text: z.string(),
      sourceIds: z.array(z.string()),
      /** Exact words copied from the source excerpt; empty if none. */
      quote: z.string(),
      evidenceStatus: EvidenceStatus,
      uncertainty: z.string(),
    }),
  ),
  supportOptions: z.array(z.string()),
  extensionOptions: z.array(z.string()),
  reviewDays: z.array(z.number()),
  rationale: z.string(),
  warnings: z.array(z.string()),
  curriculumSuggestions: z.array(z.object({ expectation: z.string(), coverageLimitations: z.string() })),
});
export type PlanOutT = z.infer<typeof PlanOut>;

const LlmItem = z.object({ key: z.string(), prompt: z.string(), options: z.array(z.string()), answerLines: z.number(), givenAnswer: z.string() });

export const LlmComputation = z.object({
  kind: z.enum(["none", "fraction-equivalence", "missing-numerator", "arithmetic", "percent-change", "mechanical-advantage"]),
  itemKey: z.string(),
  aNumerator: z.number(),
  aDenominator: z.number(),
  bNumerator: z.number(),
  bDenominator: z.number(),
  denominator: z.number(),
  expression: z.string(),
  from: z.number(),
  to: z.number(),
  effortArm: z.number(),
  loadArm: z.number(),
  expectedNumber: z.number(),
  expectedBoolean: z.boolean(),
});

export const LlmActivity = z.object({
  key: z.string(),
  objectiveIds: z.array(z.string()),
  type: ActivityType,
  title: z.string(),
  instructions: z.string(),
  responseMode: ResponseMode,
  supportLevel: z.enum(["more-support", "standard", "extension"]),
  sentenceStarter: z.string(),
  wordBank: z.array(z.string()),
  oralAlternative: z.string(),
  drawingAlternative: z.string(),
  items: z.array(LlmItem),
  diagramKey: z.string(),
  required: z.boolean(),
  scored: z.boolean(),
  marks: z.number(),
  coverInstruction: z.boolean(),
  computations: z.array(LlmComputation),
});
export type LlmActivityT = z.infer<typeof LlmActivity>;

export const LlmAnswer = z.object({
  activityKey: z.string(),
  answer: z.string(),
  itemAnswers: z.array(z.object({ itemKey: z.string(), answer: z.string() })),
  reasoning: z.string(),
  acceptableAlternatives: z.array(z.string()),
  rubric: z.array(z.object({ level: z.string(), descriptor: z.string() })),
  commonErrors: z.array(z.string()),
  marks: z.number(),
});
export type LlmAnswerT = z.infer<typeof LlmAnswer>;

export const LlmSection = z.object({
  key: z.string(),
  kind: SectionKind,
  heading: z.string(),
  body: z.string(),
  terms: z.array(z.object({ term: z.string(), definition: z.string() })),
  activityKey: z.string(),
  diagramKey: z.string(),
  optional: z.boolean(),
  claimIds: z.array(z.string()),
});
export type LlmSectionT = z.infer<typeof LlmSection>;

export const WriteOut = z.object({
  title: z.string(),
  directAnswer: z.string(),
  supportingQuestions: z.array(z.string()),
  sections: z.array(LlmSection),
  activities: z.array(LlmActivity),
  answerKey: z.array(LlmAnswer),
  teacherNotes: z.object({
    overview: z.string(),
    materials: z.array(z.string()),
    safety: z.array(z.string()),
    moreSupport: z.string(),
    extension: z.string(),
    misconceptionNotes: z.string(),
    reviewSuggestions: z.string(),
    adultSupervision: z.boolean(),
    sensitivityLevel: z.enum(["none", "care", "specialist-review"]),
    sensitivityNotes: z.string(),
  }),
  nextQuestion: z.string(),
  /** Claim text the writing relies on that is not in the evidence list. */
  newUnsupportedClaims: z.array(z.string()),
});
export type WriteOutT = z.infer<typeof WriteOut>;

const Pt = z.object({ x: z.number(), y: z.number() });
const FillE = z.enum(["none", "paper", "light", "mid", "ink", "accent", "hatch"]);
const Icon = z.enum(ICON_NAMES);
/** Flat primitive: unused fields are ignored by the converter. */
const LlmPrimitive = z.object({
  shape: z.enum(["rect", "circle", "ellipse", "line", "polygon", "polyline", "arrow", "icon"]),
  x: z.number(),
  y: z.number(),
  w: z.number(),
  h: z.number(),
  r: z.number(),
  x2: z.number(),
  y2: z.number(),
  points: z.array(Pt),
  fill: FillE,
  dashed: z.boolean(),
  /** Draw polygon/polyline as a smooth curve through the points. */
  smooth: z.boolean(),
  icon: z.string(),
});

export const LlmDiagramSpec = z.object({
  type: z.enum(["sequence", "comparison", "timeline", "light-shadow", "fraction-bars", "number-line", "lever", "bar-chart", "concept-map", "labelled-scene"]),
  sequence: z.object({ steps: z.array(z.object({ label: z.string(), detail: z.string(), icon: z.string() })), cyclic: z.boolean() }),
  comparison: z.object({ columns: z.array(z.object({ title: z.string(), points: z.array(z.string()), icon: z.string() })) }),
  timeline: z.object({ start: z.number(), end: z.number(), unitLabel: z.string(), events: z.array(z.object({ value: z.number(), label: z.string() })) }),
  lightShadow: z.object({ objectLabel: z.string(), times: z.array(z.object({ label: z.string(), sunElevationDeg: z.number(), sunSide: z.enum(["left", "right", "overhead"]) })) }),
  fractionBars: z.object({ bars: z.array(z.object({ numerator: z.number(), denominator: z.number(), label: z.string() })), claim: z.enum(["all-equivalent", "none", "not-equivalent"]) }),
  numberLine: z.object({ min: z.number(), max: z.number(), step: z.number(), fractionDenominator: z.number(), points: z.array(z.object({ value: z.number(), label: z.string() })) }),
  lever: z.object({ effortArm: z.number(), loadArm: z.number(), unit: z.string(), loadLabel: z.string(), effortLabel: z.string(), fulcrumLabel: z.string() }),
  barChart: z.object({ title: z.string(), yLabel: z.string(), unit: z.string(), bars: z.array(z.object({ label: z.string(), value: z.number() })) }),
  conceptMap: z.object({ nodes: z.array(z.object({ id: z.string(), label: z.string() })), edges: z.array(z.object({ from: z.string(), to: z.string(), label: z.string() })), centralNodeId: z.string() }),
  labelledScene: z.object({
    width: z.number(),
    height: z.number(),
    primitives: z.array(LlmPrimitive),
    callouts: z.array(z.object({ id: z.string(), text: z.string(), anchor: Pt, at: Pt, blank: z.boolean() })),
    legend: z.array(z.object({ fill: z.enum(["light", "mid", "ink", "accent", "hatch"]), text: z.string() })),
  }),
});
export type LlmDiagramSpecT = z.infer<typeof LlmDiagramSpec>;

export const VisualsOut = z.object({
  diagrams: z.array(
    z.object({
      key: z.string(),
      teachingPurpose: z.string(),
      lossIfRemoved: z.string(),
      caption: z.string(),
      altText: z.string(),
      longDescription: z.string(),
      spec: LlmDiagramSpec,
    }),
  ),
  unsupportedRequests: z.array(z.object({ key: z.string(), reason: z.string(), simplerAlternative: z.string() })),
});
export type VisualsOutT = z.infer<typeof VisualsOut>;

export const CheckOut = z.object({
  claimAssessments: z.array(
    z.object({ claimId: z.string(), status: z.enum(["supported", "partially-supported", "unsupported", "contested"]), note: z.string() }),
  ),
  critique: z.array(
    z.object({
      category: z.enum(["content-evidence", "teaching-assessment", "visual-accuracy", "accessibility"]),
      severity: z.enum(["warning", "info"]),
      message: z.string(),
      affectedElementIds: z.array(z.string()),
      suggestedFix: z.string(),
    }),
  ),
});
export type CheckOutT = z.infer<typeof CheckOut>;

export const RegenerateOut = z.object({
  section: LlmSection,
  activity: z.array(LlmActivity),
  answer: z.array(LlmAnswer),
  diagrams: VisualsOut.shape.diagrams,
  changeSummary: z.string(),
  newUnsupportedClaims: z.array(z.string()),
});
export type RegenerateOutT = z.infer<typeof RegenerateOut>;

export { Icon as LlmIcon };
