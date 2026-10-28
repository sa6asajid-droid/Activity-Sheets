/**
 * The staged generation pipeline.
 *
 * Plan job:  interpret → research → plan            (then the editor reviews the plan)
 * Build job: write → visuals → assemble → layout → check
 * Regenerate job: one section, returned as a proposal for the editor to accept.
 *
 * Every completed stage's output is saved on the job before the next stage
 * starts, so a failure (or cancellation) never discards finished work, and a
 * resumed job continues from the first unfinished stage.
 */
import type { z } from "zod";
import { getConfig, estimateCostUsd, type StageModel } from "../config";
import type { JobRow, ProjectSettings, Store } from "../db/store";
import type { Claim, Diagram, Section, Source, WorksheetDocument } from "../schema/document";
import { validateDocument } from "../schema/document";
import { ProviderError, describeProviderError, type SearchProvider, type TextProvider, type Usage } from "../providers/types";
import { InterpretOut, PlanOut, WriteOut, VisualsOut, CheckOut, RegenerateOut, type InterpretOutT, type PlanOutT, type WriteOutT, type VisualsOutT, type RegenerateOutT } from "./llm-schemas";
import { SYSTEM_BASE, checkPrompt, interpretPrompt, planPrompt, regeneratePrompt, visualsPrompt, writePrompt } from "./prompts";
import { recommendStrategies } from "../pedagogy/strategies";
import { audienceSummary } from "../defaults";
import { assembleDocument } from "./assemble";
import { convertActivity, convertAnswer, convertDiagramSpec, convertDiagrams, convertSection } from "./convert";
import { runQualityChecks } from "../quality/checks";
import { renderWorksheetHtml } from "../render/worksheet";
import { stripInline } from "../text";
import { loadUserSourceTexts } from "../sources/user-sources";

export interface LayoutEngine {
  /** Measure sections in a real browser and assign pages. */
  autoPaginate(doc: WorksheetDocument): Promise<WorksheetDocument>;
  /** Render and measure; returns per-page overflow and the student HTML. */
  measure(doc: WorksheetDocument): Promise<{ pages: { page: number; kind: string; overflowPx: number; clippedSections: string[] }[]; studentHtml: string }>;
}

export interface PipelineDeps {
  store: Store;
  text: TextProvider | null;
  search: SearchProvider | null;
  layout: LayoutEngine | null;
  loadSourceText?: (settings: ProjectSettings) => Promise<{ sources: Source[]; text: Record<string, string> }>;
}

export const STAGE_LABELS: Record<string, string> = {
  queued: "Waiting to start",
  interpret: "Understanding the question",
  research: "Researching",
  plan: "Planning the lesson",
  write: "Writing",
  visuals: "Building visuals",
  assemble: "Assembling the document",
  layout: "Laying out pages",
  check: "Checking",
  regenerate: "Rewriting the selected section",
  done: "Ready for review",
};

export const PLAN_STAGES = ["interpret", "research", "plan"] as const;
export const BUILD_STAGES = ["write", "visuals", "assemble", "layout", "check"] as const;

export class BudgetExceededError extends Error {
  constructor(readonly estimateUsd: number, readonly spentUsd: number, readonly maxUsd: number) {
    super(`This stage is estimated at about $${estimateUsd.toFixed(2)}; with $${spentUsd.toFixed(2)} already used it would pass the project budget of $${maxUsd.toFixed(2)}.`);
  }
}
export class NeedsInputError extends Error {}
export class UnsupportedTopicError extends Error {}

// ---------------------------------------------------------------- model calls

interface CallCtx {
  deps: PipelineDeps;
  job: JobRow;
  settings: ProjectSettings;
  signal: AbortSignal;
}

function addUsage(ctx: CallCtx, stage: string, model: string, u: Usage) {
  const cost = estimateCostUsd(model, u.inputTokens, u.outputTokens, u.searches);
  ctx.deps.store.recordUsage({ projectId: ctx.job.projectId, jobId: ctx.job.id, stage, model, inputTokens: u.inputTokens, outputTokens: u.outputTokens, searches: u.searches, costUsd: cost });
  const j = ctx.deps.store.getJob(ctx.job.id)!;
  ctx.job = ctx.deps.store.updateJob(j.id, {
    actualUsage: {
      inputTokens: j.actualUsage.inputTokens + u.inputTokens,
      outputTokens: j.actualUsage.outputTokens + u.outputTokens,
      searches: j.actualUsage.searches + u.searches,
      costUsd: j.actualUsage.costUsd + cost,
    },
  });
}

function checkBudget(ctx: CallCtx, model: StageModel, promptChars: number, searches = 0) {
  // Rough estimate: ~4 characters per input token; assume up to half of max_tokens is used.
  const estimate = estimateCostUsd(model.model, promptChars / 4 + 1500, model.maxTokens * 0.5, searches);
  const spent = ctx.deps.store.projectUsage(ctx.job.projectId).costUsd;
  const max = ctx.settings.budget.maxCostUsd;
  const approvedExtra = Number((ctx.job.input as { approvedBudgetUsd?: number }).approvedBudgetUsd ?? 0);
  ctx.job = ctx.deps.store.updateJob(ctx.job.id, { costEstimateUsd: ctx.job.costEstimateUsd + estimate });
  if (spent + estimate > max + approvedExtra) throw new BudgetExceededError(estimate, spent, max + approvedExtra);
}

/**
 * Structured call with bounded retries. A response that parses but fails
 * semantic validation is retried once with the problems listed; after that
 * the stage fails with an actionable message rather than looping.
 */
async function callStructured<T>(
  ctx: CallCtx,
  stage: string,
  model: StageModel,
  prompt: string,
  schema: z.ZodType<T>,
  validate?: (data: T) => string[],
): Promise<T> {
  const text = ctx.deps.text;
  if (!text) throw new ProviderError("not-configured", "No text provider", false);
  const maxAttempts = Math.max(1, getConfig().maxAttempts);
  let lastProblems: string[] = [];
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    if (ctx.signal.aborted) throw new ProviderError("cancelled", "Cancelled", false);
    const fullPrompt = lastProblems.length
      ? `${prompt}\n\nYour previous answer had these problems. Fix them:\n${lastProblems.map((p) => `- ${p}`).join("\n")}`
      : prompt;
    checkBudget(ctx, model, fullPrompt.length + SYSTEM_BASE.length);
    ctx.job = ctx.deps.store.updateJob(ctx.job.id, { attempts: ctx.job.attempts + 1 });
    try {
      const res = await text.generateStructured({ stage, system: SYSTEM_BASE, prompt: fullPrompt, schema, model, signal: ctx.signal });
      addUsage(ctx, stage, res.servedBy ?? res.model, res.usage);
      if (res.servedBy) {
        ctx.job = ctx.deps.store.updateJob(ctx.job.id, { providerMetadata: { ...ctx.job.providerMetadata, [`${stage}.servedBy`]: res.servedBy } });
      }
      const problems = validate ? validate(res.data) : [];
      if (!problems.length) return res.data;
      lastProblems = problems.slice(0, 12);
    } catch (e) {
      if (e instanceof ProviderError && e.kind === "invalid-response" && attempt < maxAttempts) {
        lastProblems = [e.message];
        continue;
      }
      throw e;
    }
  }
  throw new ProviderError("invalid-response", lastProblems.join("; ").slice(0, 400), true);
}

// ---------------------------------------------------------------- helpers

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();

/** Build claim records; quotes are checked deterministically against stored source text. */
export function buildClaims(plan: PlanOutT, sources: Source[], fullText: Record<string, string>, findings: { text: string; sourceIds: string[]; excerpts: string[] }[]): Claim[] {
  const ids = new Set(sources.map((s) => s.id));
  return plan.claims.slice(0, 60).map((c, i) => {
    const validIds = c.sourceIds.filter((s) => ids.has(s));
    const excerpts: string[] = [];
    let status = c.evidenceStatus;
    let assignedBy: Claim["statusAssignedBy"] = validIds.length ? "model-assessment" : "no-sources";
    let uncertainty = c.uncertainty || undefined;
    if (!validIds.length && (status === "supported" || status === "partially-supported")) {
      status = "unsupported";
      uncertainty = "No valid source was cited.";
    }
    if (c.quote.trim()) {
      const q = norm(c.quote);
      const found = validIds.some((sid) => norm(fullText[sid] ?? sources.find((s) => s.id === sid)!.excerpt).includes(q));
      if (found) excerpts.push(c.quote.slice(0, 1200));
      else {
        status = "unsupported";
        assignedBy = "deterministic";
        uncertainty = "The quoted supporting passage was not found in the cited source text.";
      }
    }
    if (!excerpts.length) {
      for (const f of findings) if (f.sourceIds.some((s) => validIds.includes(s))) excerpts.push(...f.excerpts.slice(0, 2));
      if (!excerpts.length) for (const sid of validIds) excerpts.push((sources.find((s) => s.id === sid)?.excerpt ?? "").slice(0, 600));
    }
    return {
      id: `claim-${i + 1}`,
      text: c.text.slice(0, 400),
      sourceIds: validIds,
      excerpts: excerpts.slice(0, 4).map((e) => e.slice(0, 1200)),
      evidenceStatus: status,
      statusAssignedBy: assignedBy,
      uncertainty: uncertainty?.slice(0, 400),
      reviewStatus: "unreviewed",
      usedIn: [],
    };
  });
}

function studentText(doc: WorksheetDocument): string {
  const parts = [doc.question, doc.directAnswer];
  for (const s of doc.sections) {
    if (s.hidden) continue;
    parts.push(`[${s.id}] ${s.heading}\n${s.body}`);
    for (const t of s.terms) parts.push(`${t.term}: ${t.definition}`);
    const a = s.activityId ? doc.activities.find((x) => x.id === s.activityId) : undefined;
    if (a) parts.push(`[${a.id}] ${a.title}\n${a.instructions}\n${a.items.map((i) => `${i.prompt} ${i.options.join(" / ")}`).join("\n")}`);
  }
  return stripInline(parts.join("\n\n"));
}

// ---------------------------------------------------------------- stages

type StageFn = (ctx: CallCtx, stages: Record<string, unknown>) => Promise<unknown>;

const stageInterpret: StageFn = async (ctx) => {
  const cfg = getConfig();
  const out = await callStructured(ctx, "interpret", cfg.stages.interpret, interpretPrompt(ctx.settings), InterpretOut, (d) => {
    const p: string[] = [];
    if (!d.proposedObjectives.length) p.push("Propose at least one learning objective.");
    if (d.needsClarification && !d.ambiguities.length) p.push("needsClarification is true but no ambiguity was listed.");
    return p;
  });
  return out;
};

const stageResearch: StageFn = async (ctx, stages) => {
  const interp = stages.interpret as InterpretOutT;
  const cfg = getConfig();
  const mode = ctx.settings.contentMode;
  const loader = ctx.deps.loadSourceText ?? ((s: ProjectSettings) => loadUserSourceTexts(s));
  let sources: Source[] = [];
  const fullText: Record<string, string> = {};
  let findings: { text: string; sourceIds: string[]; excerpts: string[] }[] = [];
  const notes: string[] = [];
  if (mode === "user-sources" || mode === "mixed") {
    const u = await loader(ctx.settings);
    sources.push(...u.sources);
    Object.assign(fullText, u.text);
    if (!u.sources.length) {
      if (mode === "user-sources") throw new NeedsInputError("Source mode is selected but no sources have been added. Add pasted text, a file or a URL — or switch to research mode or a labelled unverified draft.");
      notes.push("No user sources were supplied.");
    } else notes.push(`${u.sources.length} supplied source(s).`);
  }
  if (mode === "research" || mode === "mixed") {
    if (!ctx.deps.search) {
      throw new NeedsInputError("Web research is not available: no search provider is configured. Add sources yourself (source mode) or continue as a clearly labelled unverified draft.");
    }
    checkBudget(ctx, cfg.stages.research, 3000, cfg.maxSearches);
    const r = await ctx.deps.search.research({
      question: interp.interpretedQuestion,
      scope: interp.scope,
      audienceSummary: audienceSummary(ctx.settings.audience),
      questionType: interp.questionType,
      model: cfg.stages.research,
      maxSearches: cfg.maxSearches,
      signal: ctx.signal,
    });
    addUsage(ctx, "research", r.model, r.usage);
    // Re-number web sources after any user sources.
    const offset = sources.length;
    const remap = new Map(r.sources.map((s, i) => [s.id, `src-${offset + i + 1}`]));
    sources.push(...r.sources.map((s) => ({ ...s, id: remap.get(s.id)! })));
    findings = r.findings.map((f) => ({ ...f, sourceIds: f.sourceIds.map((id) => remap.get(id) ?? id) }));
    notes.push(r.note);
    if (!r.sources.length) notes.push("Search returned no usable sources.");
  }
  if (mode === "unverified-draft") notes.push("Unverified draft: no research was performed and no sources were supplied.");
  sources = sources.slice(0, 40);
  return { sources, fullText, findings, note: notes.join(" ") };
};

const stagePlan: StageFn = async (ctx, stages) => {
  const interp = stages.interpret as InterpretOutT;
  const research = stages.research as { sources: Source[]; fullText: Record<string, string>; findings: { text: string; sourceIds: string[]; excerpts: string[] }[] };
  const s = ctx.settings;
  const cfg = getConfig();
  const recommended = recommendStrategies({
    questionType: interp.questionType,
    priorKnowledge: s.audience.priorKnowledge,
    intendedUse: s.audience.intendedUse,
    grouping: s.format.grouping,
    targetStudentPages: s.format.targetStudentPages,
    wantsInvestigation: s.options.investigation,
    wantsDiscussion: s.options.discussion,
    wantsRetrievalCard: s.options.retrievalCard,
    procedural: /math|fraction|number|calculat|equation/i.test(`${s.subject} ${s.question}`),
  });
  const ids = new Set(research.sources.map((x) => x.id));
  const plan = await callStructured(
    ctx,
    "plan",
    cfg.stages.plan,
    planPrompt(s, interp, research.sources, research.fullText, research.findings, recommended, research.sources.length === 0),
    PlanOut,
    (d) => {
      const p: string[] = [];
      if (d.objectives.length < 1 || d.objectives.length > 3) p.push("Give 1–3 objectives.");
      const oids = d.objectives.map((o) => o.id);
      if (new Set(oids).size !== oids.length) p.push("Objective ids must be unique.");
      for (const c of d.claims) for (const sid of c.sourceIds) if (!ids.has(sid)) p.push(`Claim cites unknown source id "${sid}". Only cite: ${[...ids].join(", ") || "(none)"}.`);
      if (!d.directAnswerDraft.trim()) p.push("Write the direct answer draft.");
      if (d.selectedStrategies.length < 1 || d.selectedStrategies.length > 6) p.push("Select 1–6 strategies.");
      return p;
    },
  );
  const claims = buildClaims(plan, research.sources, research.fullText, research.findings);
  return { plan, claims, recommended, questionType: interp.questionType };
};

function writeValidator(d: WriteOutT): string[] {
  const p: string[] = [];
  const actKeys = d.activities.map((a) => a.key);
  if (new Set(actKeys).size !== actKeys.length) p.push("Activity keys must be unique.");
  for (const a of d.activities) if (!d.answerKey.some((k) => k.activityKey === a.key)) p.push(`Activity "${a.key}" has no answerKey entry.`);
  for (const s of d.sections) {
    if (s.kind === "activity" && !actKeys.includes(s.activityKey)) p.push(`Section "${s.key}" refers to unknown activity "${s.activityKey}".`);
  }
  if (!d.sections.some((s) => s.kind === "explanation")) p.push("Include one explanation section containing the direct answer.");
  if (!d.directAnswer.trim()) p.push("Write the direct answer.");
  if (d.sections.length < 2) p.push("Too few sections.");
  return p;
}

const stageWrite: StageFn = async (ctx) => {
  const input = ctx.job.input as { plan: PlanOutT; claims: Claim[] };
  const cfg = getConfig();
  return callStructured(ctx, "write", cfg.stages.write, writePrompt(ctx.settings, input.plan, input.claims), WriteOut, writeValidator);
};

function diagramRequests(write: WriteOutT, plan: PlanOutT) {
  const keys = new Map<string, { key: string; purpose: string; type: string; context: string }>();
  const visual = (i: number) => plan.proposedVisuals[i] ?? plan.proposedVisuals[0];
  let k = 0;
  for (const s of write.sections) {
    if (s.diagramKey && !keys.has(s.diagramKey)) {
      const v = visual(k++);
      keys.set(s.diagramKey, { key: s.diagramKey, purpose: s.heading || v?.purpose || "Explain the idea", type: v?.diagramType ?? "sequence", context: s.body });
    }
  }
  for (const a of write.activities) {
    if (a.diagramKey && !keys.has(a.diagramKey)) {
      keys.set(a.diagramKey, { key: a.diagramKey, purpose: `Diagram used in activity "${a.title}" (${a.type})`, type: a.type === "label" ? "labelled-scene" : a.type === "read-graph" ? "bar-chart" : "sequence", context: `${a.instructions}\n${a.items.map((i) => i.prompt).join("\n")}` });
    }
  }
  return [...keys.values()];
}

const stageVisuals: StageFn = async (ctx, stages) => {
  const input = ctx.job.input as { plan: PlanOutT };
  const write = stages.write as WriteOutT;
  const requests = diagramRequests(write, input.plan);
  if (!requests.length) return { diagrams: [], unsupportedRequests: [] } satisfies VisualsOutT;
  const cfg = getConfig();
  return callStructured(ctx, "visuals", cfg.stages.visuals, visualsPrompt(ctx.settings, write, requests), VisualsOut, (d) => {
    const p: string[] = [];
    for (const dg of d.diagrams) {
      try {
        convertDiagramSpec(dg.spec);
      } catch (e) {
        p.push(`Diagram "${dg.key}" is invalid: ${(e as Error).message.slice(0, 300)}`);
      }
      if (!dg.altText.trim()) p.push(`Diagram "${dg.key}" needs altText.`);
    }
    const produced = new Set([...d.diagrams.map((x) => x.key), ...d.unsupportedRequests.map((x) => x.key)]);
    for (const r of requests) if (!produced.has(r.key)) p.push(`No diagram or unsupported note for key "${r.key}".`);
    return p;
  });
};

const stageAssemble: StageFn = async (ctx, stages) => {
  const input = ctx.job.input as { plan: PlanOutT; claims: Claim[]; sources: Source[]; questionType: WorksheetDocument["learningPlan"]["questionType"] };
  const write = stages.write as WriteOutT;
  const visuals = stages.visuals as VisualsOutT;
  const report = { problems: [] as string[] };
  const keyToId = new Map<string, string>();
  const used = new Set<string>();
  const diagrams = convertDiagrams(visuals.diagrams, keyToId, used, report);
  for (const u of visuals.unsupportedRequests) report.problems.push(`Visual "${u.key}" is not supported by the diagram engine (${u.reason}). Suggested alternative: ${u.simplerAlternative}. Upload a reviewed image or use the alternative.`);
  const contentMode: WorksheetDocument["contentMode"] = ctx.settings.contentMode === "unverified-draft" || input.sources.length === 0 ? "unverified-draft" : ctx.settings.contentMode;
  const doc = assembleDocument({ settings: ctx.settings, plan: input.plan, claims: input.claims, sources: input.sources, write, diagrams, diagramKeyToId: keyToId, contentMode, questionType: input.questionType ?? "other" }, report);
  const v = validateDocument(doc);
  if (!v.ok) throw new ProviderError("invalid-response", `The generated document failed validation: ${v.errors.slice(0, 5).join("; ")}`, true);
  return { doc: v.doc, problems: report.problems };
};

const stageLayout: StageFn = async (ctx, stages) => {
  const { doc } = stages.assemble as { doc: WorksheetDocument };
  if (!ctx.deps.layout) return { doc, measured: false };
  const laid = await ctx.deps.layout.autoPaginate(doc);
  return { doc: laid, measured: true };
};

const stageCheck: StageFn = async (ctx, stages) => {
  const { doc } = stages.layout as { doc: WorksheetDocument };
  const assembleProblems = (stages.assemble as { problems: string[] }).problems;
  const cfg = getConfig();
  const critique: NonNullable<Parameters<typeof runQualityChecks>[1]>["critique"] = [];
  if (ctx.deps.text) {
    const toAssess = doc.claims.filter((c) => c.statusAssignedBy === "model-assessment");
    const out = await callStructured(ctx, "check", cfg.stages.check, checkPrompt(toAssess.map((c) => ({ id: c.id, text: c.text, excerpts: c.excerpts })), studentText(doc)), CheckOut);
    for (const a of out.claimAssessments) {
      const c = doc.claims.find((x) => x.id === a.claimId);
      if (c && c.statusAssignedBy === "model-assessment") {
        c.evidenceStatus = a.status;
        if (a.note) c.uncertainty = a.note.slice(0, 400);
      }
    }
    const known = new Set([...doc.sections.map((s) => s.id), ...doc.activities.map((a) => a.id), ...doc.diagrams.map((d) => d.id), ...doc.claims.map((c) => c.id)]);
    for (const f of out.critique.slice(0, 8)) {
      critique.push({ code: "model-critique", category: f.category, severity: f.severity, message: f.message.slice(0, 400), affectedElementIds: f.affectedElementIds.filter((x) => known.has(x)), suggestedFix: f.suggestedFix.slice(0, 400) });
    }
  }
  for (const p of assembleProblems) critique.push({ code: "generation-note", category: "schema", severity: "warning", message: p.slice(0, 400), affectedElementIds: [], suggestedFix: "" });
  let measured: Awaited<ReturnType<LayoutEngine["measure"]>> | null = null;
  if (ctx.deps.layout) measured = await ctx.deps.layout.measure(doc);
  const report = runQualityChecks(doc, { measuredPages: measured?.pages, studentHtml: measured?.studentHtml ?? renderWorksheetHtml(doc, { variant: "student", fontSrc: () => "" }), critique });
  // Generation notes are deterministic facts about the run, not model opinions.
  for (const i of report.issues) if (i.code === "generation-note") i.checkKind = "deterministic";
  doc.qualityReport = report;
  return { doc };
};

const stageRegenerate: StageFn = async (ctx) => {
  const input = ctx.job.input as { sectionId: string; instruction: string; doc: WorksheetDocument };
  const doc = input.doc;
  const section = doc.sections.find((s) => s.id === input.sectionId);
  if (!section) throw new NeedsInputError("The section no longer exists.");
  if (section.locked) throw new NeedsInputError("This section is locked. Unlock it before regenerating.");
  const activity = section.activityId ? doc.activities.find((a) => a.id === section.activityId) : undefined;
  const key = activity ? doc.answerKey.find((k) => k.id === activity.answerKeyId) : undefined;
  const diagram = section.diagramId ? doc.diagrams.find((d) => d.id === section.diagramId) : activity?.diagramId ? doc.diagrams.find((d) => d.id === activity.diagramId) : undefined;
  const context = {
    question: doc.question,
    directAnswer: doc.directAnswer,
    objectives: doc.learningPlan.objectives,
    audience: audienceSummary(doc.audience),
    claims: doc.claims.map((c) => ({ id: c.id, text: c.text, status: c.evidenceStatus })),
    otherSections: doc.sections.filter((s) => s.id !== section.id).map((s) => ({ id: s.id, kind: s.kind, heading: s.heading, body: s.body.slice(0, 300) })),
  };
  const cfg = getConfig();
  const out = await callStructured(
    ctx,
    "regenerate",
    cfg.stages.regenerate,
    regeneratePrompt(JSON.stringify(context), JSON.stringify({ section, activity, answerKey: key, diagram: diagram ? { id: diagram.id, caption: diagram.caption, spec: diagram.spec } : undefined }), input.instruction, ctx.settings),
    RegenerateOut,
    (d) => {
      const p: string[] = [];
      if (section.kind === "activity" && d.activity.length !== 1) p.push("Return exactly one activity for an activity section.");
      if (d.activity.length && d.answer.length !== 1) p.push("Return exactly one answer entry for the activity.");
      for (const dg of d.diagrams) {
        try {
          convertDiagramSpec(dg.spec);
        } catch (e) {
          p.push(`Diagram invalid: ${(e as Error).message.slice(0, 200)}`);
        }
      }
      return p;
    },
  );
  return { proposal: buildProposal(doc, section, out) };
};

export interface RegenerationProposal {
  sectionId: string;
  before: { section: Section; activity?: WorksheetDocument["activities"][number]; answer?: WorksheetDocument["answerKey"][number]; diagram?: Diagram };
  after: { section: Section; activity?: WorksheetDocument["activities"][number]; answer?: WorksheetDocument["answerKey"][number]; diagram?: Diagram };
  changeSummary: string;
  dependencies: string[];
  newUnsupportedClaims: string[];
}

export function buildProposal(doc: WorksheetDocument, section: Section, out: RegenerateOutT): RegenerationProposal {
  const report = { problems: [] as string[] };
  const activity = section.activityId ? doc.activities.find((a) => a.id === section.activityId) : undefined;
  const answer = activity ? doc.answerKey.find((k) => k.id === activity.answerKeyId) : undefined;
  const diagram = section.diagramId ? doc.diagrams.find((d) => d.id === section.diagramId) : undefined;
  const after: RegenerationProposal["after"] = {
    section: convertSection(out.section, section.id, { activityId: section.activityId, diagramId: section.diagramId, claimIds: new Set(doc.claims.map((c) => c.id)) }, section.page),
  };
  after.section.kind = section.kind; // kind is preserved so references stay valid
  after.section.locked = false;
  after.section.hidden = section.hidden;
  if (activity && out.activity[0]) {
    const { activity: na, itemIds } = convertActivity(out.activity[0], { activity: activity.id, answerKey: activity.answerKeyId, diagram: activity.diagramId }, new Set(doc.learningPlan.objectives.map((o) => o.id)), report);
    after.activity = na;
    if (out.answer[0]) after.answer = convertAnswer(out.answer[0], activity.answerKeyId, activity.id, itemIds, na.scored);
  }
  if (diagram && out.diagrams[0]) {
    const used = new Set<string>();
    const map = new Map([[out.diagrams[0].key, diagram.id]]);
    const [nd] = convertDiagrams([{ ...out.diagrams[0] }], map, used, report);
    if (nd) after.diagram = { ...nd, id: diagram.id, widthPct: diagram.widthPct };
  }
  const dependencies: string[] = [];
  if (after.activity && activity) {
    dependencies.push("The answer-key entry for this activity is replaced together with it.");
    if (after.activity.objectiveIds.join() !== activity.objectiveIds.join()) dependencies.push("The activity now targets a different objective; check the assessment map.");
  }
  if (after.diagram) dependencies.push("The diagram changes; check captions and any text that refers to it.");
  const refs = doc.sections.filter((s) => s.id !== section.id && (s.body.includes(section.heading) && section.heading.length > 6));
  if (refs.length) dependencies.push(`Other sections mention "${section.heading}": ${refs.map((r) => r.id).join(", ")}.`);
  if (section.claimIds.length) dependencies.push(`Claims linked to this section: ${section.claimIds.join(", ")}.`);
  return {
    sectionId: section.id,
    before: { section, activity, answer, diagram },
    after,
    changeSummary: out.changeSummary,
    dependencies: [...dependencies, ...report.problems],
    newUnsupportedClaims: out.newUnsupportedClaims,
  };
}

const STAGE_FNS: Record<string, StageFn> = {
  interpret: stageInterpret,
  research: stageResearch,
  plan: stagePlan,
  write: stageWrite,
  visuals: stageVisuals,
  assemble: stageAssemble,
  layout: stageLayout,
  check: stageCheck,
  regenerate: stageRegenerate,
};

export function stagesFor(kind: JobRow["kind"]): readonly string[] {
  return kind === "plan" ? PLAN_STAGES : kind === "build" ? BUILD_STAGES : ["regenerate"];
}

/**
 * Run (or resume) a job. Completed stages are skipped. Returns the final job row.
 */
export async function runJob(deps: PipelineDeps, jobId: string, signal: AbortSignal): Promise<JobRow> {
  const store = deps.store;
  let job = store.getJob(jobId);
  if (!job) throw new Error("Job not found");
  const project = store.getProject(job.projectId);
  if (!project) throw new Error("Project not found");
  const ctx: CallCtx = { deps, job, settings: project.settings, signal };
  job = store.updateJob(job.id, { status: "running", error: null, message: null });
  ctx.job = job;
  try {
    for (const stage of stagesFor(job.kind)) {
      const current = store.getJob(job.id)!;
      if (current.status === "cancelled" || signal.aborted) throw new ProviderError("cancelled", "Cancelled", false);
      if (stage in current.stages) continue;
      ctx.job = store.updateJob(job.id, { stage });
      const output = await STAGE_FNS[stage](ctx, current.stages);
      if (stage === "interpret") {
        const interp = output as InterpretOutT;
        if (!interp.supported) {
          store.updateJob(job.id, { stages: { ...current.stages, interpret: output } });
          throw new UnsupportedTopicError(interp.unsupportedReason || "This request is outside what the tool should produce.");
        }
        if (interp.needsClarification && !project.settings.clarifications.length) {
          store.updateJob(job.id, { stages: { ...current.stages, interpret: output } });
          ctx.job = store.updateJob(job.id, { status: "awaiting-input", message: "The question can be read in more than one way. Choose what you mean to continue." });
          return ctx.job;
        }
      }
      const latest = store.getJob(job.id)!;
      ctx.job = store.updateJob(job.id, { stages: { ...latest.stages, [stage]: output } });
    }
    const final = store.getJob(job.id)!;
    if (job.kind === "build") {
      const { doc } = final.stages.check as { doc: WorksheetDocument };
      store.transaction(() => {
        store.saveDraft(job!.projectId, doc, null);
        store.createRevision(job!.projectId, doc, "generated", "Generated draft");
        store.updateProject(job!.projectId, { status: "needs-review", title: doc.title.slice(0, 200) });
      });
    }
    return store.updateJob(job.id, { status: "succeeded", stage: "done", message: null });
  } catch (e) {
    if (e instanceof BudgetExceededError) {
      return store.updateJob(job.id, { status: "awaiting-budget", message: e.message, error: null });
    }
    if (e instanceof NeedsInputError) {
      return store.updateJob(job.id, { status: "awaiting-input", message: e.message, error: null });
    }
    if (e instanceof UnsupportedTopicError) {
      return store.updateJob(job.id, { status: "failed", error: `Not supported: ${e.message}`, message: null });
    }
    if (e instanceof ProviderError && e.kind === "cancelled") {
      return store.updateJob(job.id, { status: "cancelled", message: "Cancelled. Completed stages are kept; resume to continue." });
    }
    return store.updateJob(job.id, { status: "failed", error: describeProviderError(e) });
  }
}
