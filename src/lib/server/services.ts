/**
 * Application operations used by the API routes (and directly by tests).
 * Each function takes its dependencies explicitly so tests can inject mocks.
 */
import type { PipelineDeps } from "../pipeline/pipeline";
import type { JobRow, ProjectSettings, Store } from "../db/store";
import type { Claim, Source, WorksheetDocument } from "../schema/document";
import { validateDocument } from "../schema/document";
import type { PlanOutT } from "../pipeline/llm-schemas";
import { PlanOut } from "../pipeline/llm-schemas";
import { runQualityChecks, type MeasuredPage } from "../quality/checks";
import { defaultSettings, FORMAT_PAGES } from "../defaults";
import type { RegenerationProposal } from "../pipeline/pipeline";
import { estimatePages } from "../pipeline/assemble";

export class ServiceError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
  }
}

type Starter = (jobId: string) => Promise<unknown>;

export function createProject(store: Store, input: Partial<ProjectSettings> & { question: string; title?: string; folder?: string }) {
  const q = input.question.trim();
  if (q.length < 5) throw new ServiceError("Enter a curiosity question.");
  const base = defaultSettings(q);
  const settings: ProjectSettings = {
    ...base,
    ...input,
    question: q,
    audience: { ...base.audience, ...(input.audience ?? {}) },
    format: { ...base.format, ...(input.format ?? {}) },
    layout: { ...base.layout, ...(input.layout ?? {}) },
    options: { ...base.options, ...(input.options ?? {}) },
    budget: { ...base.budget, ...(input.budget ?? {}) },
    clarifications: input.clarifications ?? [],
    userSources: input.userSources ?? [],
  };
  if (settings.audience.ageMin > settings.audience.ageMax) throw new ServiceError("Minimum age must not exceed maximum age.");
  if (settings.format.kind !== "custom") settings.format.targetStudentPages = FORMAT_PAGES[settings.format.kind];
  return store.createProject({ title: input.title?.trim() || q.slice(0, 120), settings, folder: input.folder });
}

export function updateSettings(store: Store, projectId: string, patch: Partial<ProjectSettings>) {
  const p = store.getProject(projectId);
  if (!p) throw new ServiceError("Project not found", 404);
  const next: ProjectSettings = { ...p.settings, ...patch };
  if (next.format.kind !== "custom") next.format.targetStudentPages = FORMAT_PAGES[next.format.kind];
  return store.updateProject(projectId, { settings: next });
}

/** Start (or return the already-running) plan job. Repeated clicks never start duplicates. */
export function startPlan(store: Store, deps: PipelineDeps, projectId: string, start: Starter): JobRow {
  const p = store.getProject(projectId);
  if (!p) throw new ServiceError("Project not found", 404);
  const active = store.activeJob(projectId);
  if (active) return active;
  if (!deps.text) throw new ServiceError("No AI provider is configured on the server, so new worksheets cannot be generated. Open a demo sample instead, or add ANTHROPIC_API_KEY.", 409);
  const job = store.createJob(projectId, "plan", {});
  void start(job.id);
  return job;
}

export function resumeJob(store: Store, jobId: string, start: Starter, extra: Record<string, unknown> = {}): JobRow {
  const job = store.getJob(jobId);
  if (!job) throw new ServiceError("Job not found", 404);
  if (job.status === "running" || job.status === "queued") return job;
  if (job.status === "succeeded") throw new ServiceError("This job already finished.");
  const updated = store.updateJob(jobId, { status: "queued", error: null, message: null, input: { ...job.input, ...extra } });
  void start(jobId);
  return updated;
}

export function answerClarification(store: Store, projectId: string, jobId: string, answers: { question: string; answer: string }[], start: Starter) {
  const p = store.getProject(projectId);
  if (!p) throw new ServiceError("Project not found", 404);
  const clean = answers.filter((a) => a.answer.trim()).map((a) => ({ question: a.question.slice(0, 400), answer: a.answer.slice(0, 400) }));
  if (!clean.length) throw new ServiceError("Answer the clarifying question.");
  store.updateProject(projectId, { settings: { ...p.settings, clarifications: [...p.settings.clarifications, ...clean] } });
  const job = store.getJob(jobId)!;
  // Re-interpret with the clarification.
  const { interpret: _drop, ...rest } = job.stages;
  void _drop;
  store.updateJob(jobId, { stages: rest });
  return resumeJob(store, jobId, start);
}

export function approveBudget(store: Store, projectId: string, jobId: string, extraUsd: number, start: Starter) {
  if (!(extraUsd > 0 && extraUsd <= 50)) throw new ServiceError("Choose an additional budget between $0 and $50.");
  const job = store.getJob(jobId);
  if (!job || job.projectId !== projectId) throw new ServiceError("Job not found", 404);
  const prev = Number((job.input as { approvedBudgetUsd?: number }).approvedBudgetUsd ?? 0);
  return resumeJob(store, jobId, start, { approvedBudgetUsd: prev + extraUsd });
}

/** The editable plan from the latest successful plan job. */
export function getPlanReview(store: Store, projectId: string) {
  const job = store.latestJob(projectId, "plan");
  if (!job) return null;
  return {
    job,
    interpret: job.stages.interpret ?? null,
    research: job.stages.research ? { sources: (job.stages.research as { sources: Source[] }).sources, note: (job.stages.research as { note: string }).note } : null,
    plan: job.stages.plan ?? null,
  };
}

export function startBuild(store: Store, deps: PipelineDeps, projectId: string, edits: { plan: PlanOutT; claims: Claim[]; sources?: Source[] }, start: Starter): JobRow {
  const p = store.getProject(projectId);
  if (!p) throw new ServiceError("Project not found", 404);
  const active = store.activeJob(projectId);
  if (active) return active;
  if (!deps.text) throw new ServiceError("No AI provider is configured.", 409);
  const planJob = store.latestJob(projectId, "plan");
  if (!planJob || planJob.status !== "succeeded") throw new ServiceError("Approve a lesson plan first.");
  const parsed = PlanOut.safeParse(edits.plan);
  if (!parsed.success) throw new ServiceError(`The edited plan is not valid: ${parsed.error.issues[0]?.message}`);
  const research = planJob.stages.research as { sources: Source[] };
  const planStage = planJob.stages.plan as { questionType: string };
  const job = store.createJob(projectId, "build", {
    plan: parsed.data,
    claims: edits.claims,
    sources: edits.sources ?? research.sources,
    questionType: planStage.questionType,
  });
  void start(job.id);
  return job;
}

// ---------------------------------------------------------------- editing

export function saveDraft(store: Store, projectId: string, doc: unknown, baseVersion: number | null) {
  const v = validateDocument(doc);
  if (!v.ok) throw new ServiceError(`Not saved — the document is invalid: ${v.errors.slice(0, 3).join("; ")}`, 422);
  const version = store.saveDraft(projectId, v.doc, baseVersion);
  if (version === null) throw new ServiceError("This worksheet was changed elsewhere (another tab or a generation job). Reload to see the latest version; your edits are still in this tab.", 409);
  return { version };
}

export function snapshot(store: Store, projectId: string, label: string) {
  const d = store.getDraft(projectId);
  if (!d) throw new ServiceError("Nothing to save yet.");
  return store.createRevision(projectId, d.doc, "snapshot", label.slice(0, 120) || "Saved revision");
}

export function restoreRevision(store: Store, projectId: string, revisionId: string) {
  const r = store.getRevision(revisionId);
  if (!r || r.projectId !== projectId) throw new ServiceError("Revision not found", 404);
  const current = store.getDraft(projectId);
  store.saveDraft(projectId, r.doc, current?.version ?? null);
  store.createRevision(projectId, r.doc, "restored", `Restored revision ${r.number}`);
  return store.getDraft(projectId)!;
}

/** Re-run all deterministic checks (and keep previous override decisions). */
export function recheck(doc: WorksheetDocument, measuredPages?: MeasuredPage[], studentHtml?: string): WorksheetDocument {
  const report = runQualityChecks(doc, { measuredPages, studentHtml, previous: doc.qualityReport?.issues });
  // Model critique findings are kept until a new generation replaces them.
  const kept = (doc.qualityReport?.issues ?? []).filter((i) => i.checkKind === "model-critique" || i.code === "generation-note");
  const seen = new Set(report.issues.map((i) => `${i.code}|${i.message}`));
  for (const k of kept) if (!seen.has(`${k.code}|${k.message}`)) report.issues.push({ ...k, id: `q${report.issues.length + 1}` });
  return { ...doc, qualityReport: report };
}

export function overrideIssue(store: Store, projectId: string, issueId: string, reason: string, reviewer: string) {
  const d = store.getDraft(projectId);
  if (!d) throw new ServiceError("No document", 404);
  const issue = d.doc.qualityReport?.issues.find((i) => i.id === issueId);
  if (!issue) throw new ServiceError("Issue not found", 404);
  if (issue.severity === "blocking") throw new ServiceError("Blocking issues cannot be overridden. Fix them, or export a clearly labelled draft.");
  if (reason.trim().length < 5) throw new ServiceError("Record a reason for the override.");
  issue.resolutionStatus = "overridden";
  issue.reviewer = reviewer.slice(0, 80) || "editor";
  issue.overrideReason = reason.slice(0, 400);
  store.saveDraft(projectId, d.doc, d.version);
  store.recordDecision({ projectId, action: "override-warning", subject: `${issue.code}: ${issue.message}`.slice(0, 400), reason: issue.overrideReason, reviewer: issue.reviewer });
  return d.doc;
}

/** Approval is a deliberate human action, recorded with the reviewer's name. */
export function approve(store: Store, projectId: string, reviewer: string, note: string) {
  const d = store.getDraft(projectId);
  if (!d) throw new ServiceError("No document to approve.");
  if (!reviewer.trim()) throw new ServiceError("Enter the reviewer's name.");
  const checked = recheck(d.doc);
  const blocking = (checked.qualityReport?.issues ?? []).filter((i) => i.severity === "blocking" && i.resolutionStatus === "open");
  if (blocking.length) throw new ServiceError(`Resolve ${blocking.length} blocking issue(s) before approving.`);
  const rev = store.createRevision(projectId, checked, "approved", `Approved by ${reviewer.slice(0, 60)}`, reviewer.slice(0, 80));
  store.saveDraft(projectId, checked, null);
  store.updateProject(projectId, { status: "approved", currentRevisionId: rev.id });
  store.recordDecision({ projectId, action: "approve", subject: `Revision ${rev.number}`, reason: note.slice(0, 400) || "Approved", reviewer: reviewer.slice(0, 80) });
  return rev;
}

export function duplicateProject(store: Store, projectId: string, opts: { title?: string; differentiation?: WorksheetDocument["differentiation"] } = {}) {
  const p = store.getProject(projectId);
  if (!p) throw new ServiceError("Project not found", 404);
  const copy = store.createProject({ title: opts.title || `${p.title} (copy)`, settings: { ...p.settings, options: { ...p.settings.options, supportLevel: opts.differentiation ?? p.settings.options.supportLevel } }, folder: p.folder });
  const d = store.getDraft(projectId);
  if (d) {
    const doc = { ...d.doc, differentiation: opts.differentiation ?? d.doc.differentiation, title: opts.title || d.doc.title };
    store.saveDraft(copy.id, doc, null);
    store.createRevision(copy.id, doc, "snapshot", `Duplicated from "${p.title}"`);
  }
  return store.getProject(copy.id)!;
}

export function startRegenerate(store: Store, deps: PipelineDeps, projectId: string, sectionId: string, instruction: string, start: Starter) {
  const d = store.getDraft(projectId);
  if (!d) throw new ServiceError("No document", 404);
  const s = d.doc.sections.find((x) => x.id === sectionId);
  if (!s) throw new ServiceError("Section not found", 404);
  if (s.locked) throw new ServiceError("This section is locked. Unlock it first.");
  if (!deps.text) throw new ServiceError("No AI provider is configured, so sections cannot be regenerated. You can still edit them by hand.", 409);
  const active = store.activeJob(projectId);
  if (active) return active;
  const job = store.createJob(projectId, "regenerate-section", { sectionId, instruction: instruction.slice(0, 600), doc: d.doc, baseVersion: d.version });
  void start(job.id);
  return job;
}

/** Apply an accepted regeneration to the current draft, leaving everything else (and every locked section) untouched. */
export function acceptProposal(store: Store, projectId: string, jobId: string) {
  const job = store.getJob(jobId);
  if (!job || job.projectId !== projectId || job.kind !== "regenerate-section" || job.status !== "succeeded") throw new ServiceError("Proposal not found", 404);
  const proposal = (job.stages.regenerate as { proposal: RegenerationProposal }).proposal;
  const d = store.getDraft(projectId);
  if (!d) throw new ServiceError("No document", 404);
  const doc: WorksheetDocument = structuredClone(d.doc);
  const idx = doc.sections.findIndex((s) => s.id === proposal.sectionId);
  if (idx < 0) throw new ServiceError("The section no longer exists.");
  if (doc.sections[idx].locked) throw new ServiceError("The section was locked after the proposal was made.");
  doc.sections[idx] = { ...proposal.after.section, page: doc.sections[idx].page, keepWithNext: doc.sections[idx].keepWithNext };
  if (proposal.after.activity) {
    const ai = doc.activities.findIndex((a) => a.id === proposal.after.activity!.id);
    if (ai >= 0) doc.activities[ai] = proposal.after.activity;
  }
  if (proposal.after.answer) {
    const ki = doc.answerKey.findIndex((k) => k.id === proposal.after.answer!.id);
    if (ki >= 0) doc.answerKey[ki] = proposal.after.answer;
    else doc.answerKey.push(proposal.after.answer);
  }
  if (proposal.after.diagram) {
    const di = doc.diagrams.findIndex((x) => x.id === proposal.after.diagram!.id);
    if (di >= 0) doc.diagrams[di] = proposal.after.diagram;
  }
  proposal.newUnsupportedClaims.slice(0, 5).forEach((t, i) => {
    doc.claims.push({ id: `claim-regen-${job.id.slice(0, 6)}-${i + 1}`, text: t.slice(0, 400), sourceIds: [], excerpts: [], evidenceStatus: "unsupported", statusAssignedBy: "no-sources", uncertainty: "Added during regeneration without a source.", reviewStatus: "unreviewed", usedIn: [proposal.sectionId] });
  });
  const checked = recheck(doc);
  const v = validateDocument(checked);
  if (!v.ok) throw new ServiceError(`The proposal would make the document invalid: ${v.errors[0]}`);
  const version = store.saveDraft(projectId, checked, d.version);
  if (version === null) throw new ServiceError("The document changed; reload and try again.", 409);
  store.createRevision(projectId, checked, "regenerated", `Regenerated section ${proposal.sectionId}`);
  store.updateJob(job.id, { message: "accepted" });
  return { doc: checked, version };
}

/** Change page size etc. and re-estimate pagination (the editor then measures). */
export function relayout(doc: WorksheetDocument): WorksheetDocument {
  const copy = structuredClone(doc);
  estimatePages(copy);
  return copy;
}
