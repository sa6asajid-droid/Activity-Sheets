/**
 * Mock providers for automated tests and offline UI checks. Output is
 * placeholder text, labelled [MOCK] wherever it appears, and must never be
 * presented as researched content. Enabled only with CS_TEXT_PROVIDER=mock.
 */
import type { Source } from "../schema/document";
import { ProviderError, type ResearchRequest, type ResearchResult, type SearchProvider, type StructuredRequest, type StructuredResult, type TextProvider } from "./types";
import type { InterpretOutT, PlanOutT, WriteOutT, VisualsOutT, CheckOutT, RegenerateOutT, LlmActivityT, LlmDiagramSpecT } from "../pipeline/llm-schemas";

export interface MockBehaviour {
  /** Throw this error kind on the first call to the named stage. */
  failOnce?: { stage: string; kind: ProviderError["kind"] };
  /** Return schema-invalid data once for the named stage (tests bounded retry). */
  invalidOnce?: string;
  /** Always ask for clarification at interpret. */
  ambiguous?: boolean;
  /** Delay per call in ms (tests cancellation). */
  delayMs?: number;
  /** Return an answer key with a wrong arithmetic answer (tests deterministic checks). */
  wrongArithmetic?: boolean;
}

const emptySpec = (): LlmDiagramSpecT => ({
  type: "sequence",
  sequence: { steps: [], cyclic: false },
  comparison: { columns: [] },
  timeline: { start: 0, end: 0, unitLabel: "", events: [] },
  lightShadow: { objectLabel: "", times: [] },
  fractionBars: { bars: [], claim: "none" },
  numberLine: { min: 0, max: 0, step: 0, fractionDenominator: 0, points: [] },
  lever: { effortArm: 0, loadArm: 0, unit: "", loadLabel: "", effortLabel: "", fulcrumLabel: "" },
  barChart: { title: "", yLabel: "", unit: "", bars: [] },
  conceptMap: { nodes: [], edges: [], centralNodeId: "" },
  labelledScene: { width: 0, height: 0, primitives: [], callouts: [], legend: [] },
});

const noComp = { kind: "none" as const, itemKey: "", aNumerator: 0, aDenominator: 1, bNumerator: 0, bDenominator: 1, denominator: 1, expression: "", from: 0, to: 0, effortArm: 0, loadArm: 0, expectedNumber: 0, expectedBoolean: false };

function activity(key: string, over: Partial<LlmActivityT>): LlmActivityT {
  return {
    key,
    objectiveIds: ["obj-1"],
    type: "short-answer",
    title: "[MOCK] Activity",
    instructions: "[MOCK] Answer the questions.",
    responseMode: "write",
    supportLevel: "standard",
    sentenceStarter: "",
    wordBank: [],
    oralAlternative: "",
    drawingAlternative: "",
    items: [{ key: "a", prompt: "[MOCK] Question?", options: [], answerLines: 2, givenAnswer: "" }],
    diagramKey: "",
    required: true,
    scored: false,
    marks: 0,
    coverInstruction: false,
    computations: [],
    ...over,
  };
}

export class MockTextProvider implements TextProvider {
  readonly name = "mock";
  readonly isMock = true;
  calls: { stage: string; prompt: string }[] = [];
  private failed = new Set<string>();

  constructor(private behaviour: MockBehaviour = {}) {}

  async generateStructured<T>(req: StructuredRequest<T>): Promise<StructuredResult<T>> {
    this.calls.push({ stage: req.stage, prompt: req.prompt });
    if (this.behaviour.delayMs) {
      await new Promise<void>((resolve, reject) => {
        const t = setTimeout(resolve, this.behaviour.delayMs);
        req.signal?.addEventListener("abort", () => {
          clearTimeout(t);
          reject(new ProviderError("cancelled", "Cancelled", false));
        });
      });
    }
    if (req.signal?.aborted) throw new ProviderError("cancelled", "Cancelled", false);
    const f = this.behaviour.failOnce;
    if (f && f.stage === req.stage && !this.failed.has(`fail:${req.stage}`)) {
      this.failed.add(`fail:${req.stage}`);
      throw new ProviderError(f.kind, `Injected ${f.kind}`, ["rate-limit", "timeout", "overloaded", "network"].includes(f.kind));
    }
    if (this.behaviour.invalidOnce === req.stage && !this.failed.has(`invalid:${req.stage}`)) {
      this.failed.add(`invalid:${req.stage}`);
      throw new ProviderError("invalid-response", "Response could not be parsed against the schema", true);
    }
    const q = (req.prompt.match(/Main question: (.*)/)?.[1] ?? "the question").trim();
    const data = this.respond(req.stage, q, req.prompt);
    const parsed = req.schema.parse(data);
    return { data: parsed, usage: { inputTokens: Math.ceil(req.prompt.length / 4), outputTokens: 800, searches: 0 }, model: req.model.model };
  }

  private respond(stage: string, q: string, prompt: string): unknown {
    switch (stage) {
      case "interpret": {
        const answered = /Clarifications from the editor/.test(prompt);
        const ambiguous = this.behaviour.ambiguous && !answered;
        return {
          interpretedQuestion: q,
          questionType: /^why/i.test(q) ? "why" : /^how do we know/i.test(q) ? "how-do-we-know" : /^how/i.test(q) ? "how" : /^what/i.test(q) ? "what" : "other",
          scope: "[MOCK] A short introduction suitable for the audience.",
          subject: "Science",
          ambiguities: ambiguous ? [{ term: "mole", meanings: ["the animal", "the chemistry unit"], clarifyingQuestion: "Do you mean the animal or the unit used in chemistry?" }] : [],
          needsClarification: Boolean(ambiguous),
          supported: true,
          unsupportedReason: "",
          sensitivity: { level: "none", reasons: [], adultSupervisionLikely: false },
          prerequisites: ["[MOCK] Basic familiarity with the topic"],
          proposedObjectives: [{ text: "[MOCK] Explain the main idea in their own words", evidence: "A short written explanation" }],
        } satisfies InterpretOutT;
      }
      case "plan": {
        const ids = [...prompt.matchAll(/<source id="([^"]+)"/g)].map((m) => m[1]);
        return {
          title: `[MOCK] ${q}`,
          directAnswerDraft: "[MOCK] This is placeholder answer text produced by the test provider. It is not researched content.",
          scope: "[MOCK] scope",
          learnerAssumptions: ["[MOCK] assumption"],
          prerequisites: ["[MOCK] prerequisite"],
          objectives: [
            { id: "obj-1", text: "[MOCK] Explain the main idea", evidence: "Written explanation" },
            { id: "obj-2", text: "[MOCK] Apply the idea to a new example", evidence: "Correct application" },
          ],
          misconceptions: [{ text: "[MOCK] A common mix-up", correction: "[MOCK] The accurate idea", basis: "plausible-not-verified", sourceIds: [] }],
          explanationSequence: ["[MOCK] step one", "[MOCK] step two"],
          selectedStrategies: [
            { id: "explicit-explanation", rationale: "[MOCK] rationale" },
            { id: "retrieval-practice", rationale: "[MOCK] rationale" },
            { id: "text-visual-integration", rationale: "[MOCK] rationale" },
          ],
          proposedActivities: [{ type: "short-answer", purpose: "[MOCK] check", objectiveIds: ["obj-1"] }],
          proposedVisuals: [{ diagramType: "sequence", purpose: "[MOCK] show the process", lossIfRemoved: "[MOCK] the order of steps" }],
          claims: [
            { text: "[MOCK] Placeholder claim one.", sourceIds: ids.slice(0, 1), quote: "", evidenceStatus: ids.length ? "supported" : "unsupported", uncertainty: "" },
            { text: "[MOCK] Placeholder claim two.", sourceIds: [], quote: "", evidenceStatus: "unsupported", uncertainty: "" },
          ],
          supportOptions: ["[MOCK] word bank"],
          extensionOptions: ["[MOCK] transfer task"],
          reviewDays: [2, 7],
          rationale: "[MOCK] Rationale placeholder.",
          warnings: ["[MOCK] This content comes from the mock test provider."],
          curriculumSuggestions: [],
        } satisfies PlanOutT;
      }
      case "write": {
        const arithmetic = { ...noComp, kind: "arithmetic" as const, itemKey: "a", expression: "3 * 4", expectedNumber: this.behaviour.wrongArithmetic ? 13 : 12 };
        return {
          title: `[MOCK] ${q}`,
          directAnswer: "[MOCK] Placeholder answer from the test provider. Not researched content.",
          supportingQuestions: [],
          sections: [
            { key: "hook", kind: "hook", heading: "", body: "[MOCK] A short opening scenario.", terms: [], activityKey: "", diagramKey: "", optional: false, claimIds: ["claim-1"] },
            { key: "predict", kind: "prediction", heading: "Predict", body: "[MOCK] What do you think will happen?", terms: [], activityKey: "", diagramKey: "", optional: false, claimIds: [] },
            { key: "explain", kind: "explanation", heading: "What is going on", body: "[MOCK] Explanation placeholder paragraph one.\n\n[MOCK] Explanation placeholder paragraph two.", terms: [], activityKey: "", diagramKey: "", optional: false, claimIds: ["claim-1", "claim-2"] },
            { key: "fig", kind: "diagram", heading: "", body: "", terms: [], activityKey: "", diagramKey: "fig-steps", optional: false, claimIds: [] },
            { key: "act1", kind: "activity", heading: "", body: "", terms: [], activityKey: "a1", diagramKey: "", optional: false, claimIds: [] },
            { key: "act2", kind: "activity", heading: "", body: "", terms: [], activityKey: "a2", diagramKey: "", optional: false, claimIds: [] },
            { key: "next", kind: "next-question", heading: "Wonder next", body: "[MOCK] What else could you ask?", terms: [], activityKey: "", diagramKey: "", optional: false, claimIds: [] },
          ],
          activities: [
            activity("a1", { title: "[MOCK] Explain it", objectiveIds: ["obj-1"], items: [{ key: "a", prompt: "[MOCK] Explain the idea.", options: [], answerLines: 3, givenAnswer: "" }] }),
            activity("a2", { title: "[MOCK] Calculate", objectiveIds: ["obj-2"], type: "solve", items: [{ key: "a", prompt: "What is 3 × 4?", options: [], answerLines: 1, givenAnswer: "" }], computations: [arithmetic] }),
          ],
          answerKey: [
            { activityKey: "a1", answer: "[MOCK] Sample response placeholder for the explanation task.", itemAnswers: [{ itemKey: "a", answer: "[MOCK] sample" }], reasoning: "[MOCK] reasoning placeholder", acceptableAlternatives: [], rubric: [], commonErrors: [], marks: 0 },
            { activityKey: "a2", answer: this.behaviour.wrongArithmetic ? "13" : "12", itemAnswers: [{ itemKey: "a", answer: this.behaviour.wrongArithmetic ? "13" : "12" }], reasoning: "Three groups of four make twelve.", acceptableAlternatives: [], rubric: [], commonErrors: [], marks: 0 },
          ],
          teacherNotes: { overview: "[MOCK] Teacher overview placeholder.", materials: [], safety: [], moreSupport: "", extension: "", misconceptionNotes: "", reviewSuggestions: "", adultSupervision: false, sensitivityLevel: "none", sensitivityNotes: "" },
          nextQuestion: "[MOCK] What else could you ask?",
          newUnsupportedClaims: [],
        } satisfies WriteOutT;
      }
      case "visuals": {
        const spec = emptySpec();
        spec.sequence = { steps: [{ label: "[MOCK] First", detail: "", icon: "seed" }, { label: "[MOCK] Then", detail: "", icon: "sprout" }, { label: "[MOCK] Finally", detail: "", icon: "seedling" }], cyclic: false };
        return { diagrams: [{ key: "fig-steps", teachingPurpose: "[MOCK] Show the order", lossIfRemoved: "[MOCK] The order of steps", caption: "[MOCK] Three steps", altText: "[MOCK] Three steps in order.", longDescription: "[MOCK] A row of three steps, each with an icon, connected by arrows from left to right.", spec }], unsupportedRequests: [] } satisfies VisualsOutT;
      }
      case "check":
        return { claimAssessments: [], critique: [{ category: "teaching-assessment", severity: "info", message: "[MOCK] Critique placeholder.", affectedElementIds: [], suggestedFix: "" }] } satisfies CheckOutT;
      case "regenerate": {
        const sec = prompt.match(/"section":\{"id":"([^"]+)","kind":"([^"]+)"/);
        const kind = (sec?.[2] ?? "note") as RegenerateOutT["section"]["kind"];
        const isActivity = kind === "activity";
        return {
          section: { key: sec?.[1] ?? "s", kind, heading: "[MOCK] Revised heading", body: "[MOCK] Revised body text.", terms: [], activityKey: "", diagramKey: "", optional: false, claimIds: [] },
          activity: isActivity ? [activity("a", { title: "[MOCK] Revised activity", items: [{ key: "a", prompt: "[MOCK] Revised prompt?", options: [], answerLines: 2, givenAnswer: "" }] })] : [],
          answer: isActivity ? [{ activityKey: "a", answer: "[MOCK] Revised answer.", itemAnswers: [{ itemKey: "a", answer: "[MOCK] revised" }], reasoning: "[MOCK]", acceptableAlternatives: [], rubric: [], commonErrors: [], marks: 0 }] : [],
          diagrams: [],
          changeSummary: "[MOCK] Rewrote the section.",
          newUnsupportedClaims: [],
        } satisfies RegenerateOutT;
      }
    }
    throw new Error(`Mock has no response for stage ${stage}`);
  }
}

export class MockSearchProvider implements SearchProvider {
  readonly name = "mock-search";
  readonly isMock = true;
  constructor(private fail?: ProviderError["kind"]) {}
  async research(req: ResearchRequest): Promise<ResearchResult> {
    if (this.fail) throw new ProviderError(this.fail, `Injected ${this.fail}`, false);
    const src: Source = {
      id: "src-1",
      title: "[MOCK] Placeholder source",
      authorOrOrganization: "Mock search provider",
      location: { kind: "url", value: "https://example.org/mock" },
      retrievedAt: new Date().toISOString(),
      excerpt: `[MOCK] Placeholder excerpt about ${req.question}.`,
      sourceType: "other",
      licenceStatus: "unknown",
    };
    return { sources: [src], findings: [{ text: "[MOCK] Placeholder finding.", sourceIds: ["src-1"], excerpts: [src.excerpt] }], usage: { inputTokens: 1000, outputTokens: 300, searches: 1 }, model: req.model.model, note: "Mock search: placeholder data, not research." };
  }
}
