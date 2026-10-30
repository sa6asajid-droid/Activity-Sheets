/**
 * The planning engine's strategy catalogue and selector.
 *
 * Strategies are design lenses, not laws. The selector picks a small,
 * coherent set for a given learner, question type and format; it never
 * applies every framework at once and never sorts learners into "styles".
 */
import type { StrategyIdT } from "../schema/document";

export const STRATEGY_LABELS: Record<StrategyIdT, string> = {
  "prior-knowledge-activation": "Start from what learners already know",
  "prediction-and-revisit": "Predict first, then revisit the prediction",
  "misconception-address": "Name a likely mix-up and correct it",
  "cognitive-load-chunking": "Small steps, labels close to what they describe",
  "explicit-explanation": "Clear explanation before independent work",
  "worked-example": "Worked example",
  "faded-example": "Partly completed example, finished by the learner",
  "guided-inquiry": "Guided inquiry: observe, predict, explain",
  "text-visual-integration": "Diagram and text that explain each other",
  "retrieval-practice": "Recall from memory, then check",
  "spaced-review": "A later review card",
  "metacognitive-prompt": "A concrete prompt about how they worked it out",
  "purposeful-choice": "A limited, meaningful choice",
  "real-world-connection": "Connect to an everyday situation",
  "structured-discussion": "Partner talk with a clear purpose",
  "experiential-observation": "A safe first-hand observation",
  "formative-check": "A quick check aligned to the objective",
  "examples-and-non-examples": "Examples and non-examples",
  "evidence-reasoning": "Reason from evidence and note its limits",
};

export const QUESTION_TYPE_GUIDANCE: Record<string, string> = {
  why: "Prioritize causes and mechanisms, the conditions under which they hold, the evidence for them, multiple contributing factors where they exist, and the distinction between purpose and cause.",
  how: "Prioritize components, sequence, mechanism, inputs and outputs, dependencies, and a worked demonstration where useful.",
  what: "Prioritize a clear definition, essential features, examples and non-examples, related concepts, and boundaries and common confusions.",
  "how-do-we-know": "Prioritize evidence, observation, measurement, how sources are interpreted, uncertainty, and the limits of inference.",
  counterfactual: "Clearly separate established knowledge, reasonable inference, and speculation, and label each.",
  "historical-social": "Distinguish established events, interpretation, perspective, contested claims, and present-day versus historical terminology. Do not force a single cause onto complex human events.",
  other: "Answer the question directly, then support it with the most relevant evidence.",
};

export interface PlanningContext {
  questionType: keyof typeof QUESTION_TYPE_GUIDANCE;
  priorKnowledge: "new" | "some" | "confident";
  intendedUse: "independent" | "adult-supported" | "classroom" | "homeschool";
  grouping: "individual" | "collaborative";
  targetStudentPages: number;
  wantsInvestigation: boolean;
  wantsDiscussion: boolean;
  wantsRetrievalCard: boolean;
  procedural: boolean; // maths or a multi-step procedure
}

/**
 * Recommend 3–6 strategies. The model may swap one or two with a stated
 * rationale; the recommendation keeps the plan small and coherent.
 */
export function recommendStrategies(ctx: PlanningContext): StrategyIdT[] {
  const picks: StrategyIdT[] = [];
  const add = (s: StrategyIdT) => {
    if (!picks.includes(s)) picks.push(s);
  };
  // Foundation: learners new to a topic need the explanation before discovery.
  if (ctx.priorKnowledge === "new") add("explicit-explanation");
  if (ctx.procedural) add(ctx.priorKnowledge === "confident" ? "faded-example" : "worked-example");
  if (ctx.questionType === "why" || ctx.questionType === "how") add("prediction-and-revisit");
  if (ctx.questionType === "what") add("examples-and-non-examples");
  if (ctx.questionType === "how-do-we-know" || ctx.questionType === "historical-social" || ctx.questionType === "counterfactual") add("evidence-reasoning");
  add("text-visual-integration");
  if (ctx.priorKnowledge !== "new") add("misconception-address");
  if (ctx.wantsInvestigation) add(ctx.priorKnowledge === "new" ? "experiential-observation" : "guided-inquiry");
  if (ctx.wantsDiscussion || ctx.grouping === "collaborative") add("structured-discussion");
  if (ctx.wantsRetrievalCard || ctx.targetStudentPages >= 2) add("retrieval-practice");
  add("formative-check");
  if (picks.length < 6) add("metacognitive-prompt");
  if (ctx.priorKnowledge === "new" && picks.length < 6) add("cognitive-load-chunking");
  return picks.slice(0, 6);
}

/** Section budget per format, so one-page sheets select fewer elements rather than shrinking. */
export function sectionBudget(targetStudentPages: number): { min: number; max: number; activities: [number, number] } {
  if (targetStudentPages <= 1) return { min: 4, max: 7, activities: [1, 2] };
  if (targetStudentPages === 2) return { min: 6, max: 11, activities: [2, 4] };
  return { min: 8, max: 6 + targetStudentPages * 3, activities: [3, Math.min(8, targetStudentPages + 3)] };
}

export const WRITING_RULES = `Voice: warm, precise, natural children's nonfiction. Define important technical words instead of avoiding them.
Never write: "Let's dive into", "Unlock the secrets", "amazing", "magical", "incredible", "fun fact", fake excitement in headings, repeated sentence openings, unnecessary anthropomorphism, infantilizing language, filler, or statements that are false but "close enough for children".
Mark analogies as analogies and say where they break down. Keep simplifications accurate for the stated level.
Never fabricate quotations, page numbers, citations, statistics, dates, names, or curriculum codes.
Do not describe learners as visual/auditory/kinesthetic learners. Do not diagnose or label learners.`;
