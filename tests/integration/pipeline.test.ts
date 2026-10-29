import { afterAll, beforeAll, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "cs-int-"));
process.env.CS_DATA_DIR = dataDir;
process.env.CS_MAX_ATTEMPTS = "2";

import { SqliteStore } from "@/lib/db/store";
import { MockSearchProvider, MockTextProvider, type MockBehaviour } from "@/lib/providers/mock";
import { runJob, type PipelineDeps } from "@/lib/pipeline/pipeline";
import * as svc from "@/lib/server/services";
import { exportProject, compileWorkbook, ExportRefusedError } from "@/lib/export/exporter";
import { browserLayoutEngine, closeBrowser } from "@/lib/render/browser";
import { addPastedSource } from "@/lib/sources/user-sources";
import { validateDocument, type Claim } from "@/lib/schema/document";
import { seedSamples } from "@/lib/samples";
import type { PlanOutT } from "@/lib/pipeline/llm-schemas";
import { PDFDocument } from "pdf-lib";

function deps(behaviour: MockBehaviour = {}, opts: { search?: boolean; searchFail?: "rate-limit"; layout?: boolean } = {}): PipelineDeps & { text: MockTextProvider } {
  return {
    store: new SqliteStore(":memory:"),
    text: new MockTextProvider(behaviour),
    search: opts.search === false ? null : new MockSearchProvider(opts.searchFail),
    layout: opts.layout ? browserLayoutEngine : null,
  };
}

const run = (d: PipelineDeps, jobId: string) => runJob(d, jobId, new AbortController().signal);

async function planAndBuild(d: PipelineDeps, question = "Why do leaves change colour in autumn?") {
  const p = svc.createProject(d.store, { question, contentMode: "research" });
  const planJob = d.store.createJob(p.id, "plan", {});
  const pj = await run(d, planJob.id);
  expect(pj.status, pj.error ?? "").toBe("succeeded");
  const review = svc.getPlanReview(d.store, p.id)!;
  const plan = review.plan as { plan: PlanOutT; claims: Claim[] };
  let buildId = "";
  svc.startBuild(d.store, d, p.id, { plan: plan.plan, claims: plan.claims }, async (id) => {
    buildId = id;
  });
  const bj = await run(d, buildId);
  return { project: p, planJob: pj, buildJob: bj };
}

afterAll(async () => {
  await closeBrowser();
  fs.rmSync(dataDir, { recursive: true, force: true });
});

describe("generation with a mocked provider", () => {
  it("plans, builds, saves a draft and a revision", async () => {
    const d = deps();
    const { project, buildJob } = await planAndBuild(d);
    expect(buildJob.status, buildJob.error ?? "").toBe("succeeded");
    const draft = d.store.getDraft(project.id)!;
    expect(validateDocument(draft.doc).ok).toBe(true);
    expect(draft.doc.diagrams.length).toBe(1);
    expect(draft.doc.sources[0].title).toMatch(/MOCK/);
    expect(d.store.listRevisions(project.id)[0].kind).toBe("generated");
    expect(d.store.getProject(project.id)!.status).toBe("needs-review");
    expect(draft.doc.qualityReport!.issues.some((i) => i.checkKind === "model-critique")).toBe(true);
    expect(d.store.projectUsage(project.id).calls).toBeGreaterThan(3);
  });

  it("retries once after an invalid structured response", async () => {
    const d = deps({ invalidOnce: "plan" });
    const p = svc.createProject(d.store, { question: "How do bees make honey?" });
    const j = await run(d, d.store.createJob(p.id, "plan", {}).id);
    expect(j.status).toBe("succeeded");
    expect(d.text.calls.filter((c) => c.stage === "plan").length).toBe(2);
    expect(d.text.calls.find((c, i) => c.stage === "plan" && i > 0 && /previous answer had these problems/.test(c.prompt))).toBeTruthy();
  });

  it("stops on a rate limit, keeps finished stages, and resumes without redoing them", async () => {
    const d = deps({ failOnce: { stage: "plan", kind: "rate-limit" } });
    const p = svc.createProject(d.store, { question: "How do bees make honey?" });
    const job = d.store.createJob(p.id, "plan", {});
    const failed = await run(d, job.id);
    expect(failed.status).toBe("failed");
    expect(failed.error).toMatch(/rate-limiting/);
    expect(Object.keys(d.store.getJob(job.id)!.stages)).toEqual(["interpret", "research"]);
    const interpretCalls = d.text.calls.filter((c) => c.stage === "interpret").length;
    d.store.updateJob(job.id, { status: "queued" });
    const resumed = await run(d, job.id);
    expect(resumed.status).toBe("succeeded");
    expect(d.text.calls.filter((c) => c.stage === "interpret").length).toBe(interpretCalls);
  });

  it("reports failed retrieval clearly", async () => {
    const d = deps({}, { searchFail: "rate-limit" });
    const p = svc.createProject(d.store, { question: "How do bees make honey?" });
    const j = await run(d, d.store.createJob(p.id, "plan", {}).id);
    expect(j.status).toBe("failed");
    expect(j.error).toBeTruthy();
  });

  it("does not pretend research happened when search is unavailable", async () => {
    const d = deps({}, { search: false });
    const p = svc.createProject(d.store, { question: "How do bees make honey?", contentMode: "research" });
    const j = await run(d, d.store.createJob(p.id, "plan", {}).id);
    expect(j.status).toBe("awaiting-input");
    expect(j.message).toMatch(/no search provider/);
  });

  it("supports cancellation and resume", async () => {
    const d = deps({ delayMs: 300 });
    const p = svc.createProject(d.store, { question: "How do bees make honey?" });
    const job = d.store.createJob(p.id, "plan", {});
    const ac = new AbortController();
    const pending = runJob(d, job.id, ac.signal);
    setTimeout(() => ac.abort(), 100);
    const j = await pending;
    expect(j.status).toBe("cancelled");
    d.store.updateJob(job.id, { status: "queued" });
    expect((await run(d, job.id)).status).toBe("succeeded");
  });

  it("pauses for clarification on an ambiguous question and continues once answered", async () => {
    const d = deps({ ambiguous: true });
    const p = svc.createProject(d.store, { question: "How big is a mole?" });
    const job = d.store.createJob(p.id, "plan", {});
    const j = await run(d, job.id);
    expect(j.status).toBe("awaiting-input");
    let started = "";
    svc.answerClarification(d.store, p.id, job.id, [{ question: "Which mole?", answer: "the animal" }], async (id) => {
      started = id;
    });
    expect((await run(d, started)).status).toBe("succeeded");
    expect(d.text.calls.filter((c) => c.stage === "interpret").at(-1)!.prompt).toMatch(/the animal/);
  });

  it("asks before exceeding the budget", async () => {
    const d = deps();
    const p = svc.createProject(d.store, { question: "How do bees make honey?", budget: { maxCostUsd: 0.01 } });
    const job = d.store.createJob(p.id, "plan", {});
    const j = await run(d, job.id);
    expect(j.status).toBe("awaiting-budget");
    let started = "";
    svc.approveBudget(d.store, p.id, job.id, 5, async (id) => {
      started = id;
    });
    expect((await run(d, started)).status).toBe("succeeded");
  });

  it("flags a wrong model-written arithmetic answer as blocking", async () => {
    const d = deps({ wrongArithmetic: true });
    const { project } = await planAndBuild(d);
    const doc = d.store.getDraft(project.id)!.doc;
    expect(doc.qualityReport!.issues.some((i) => i.code === "computation-failed" && i.severity === "blocking")).toBe(true);
    expect(() => svc.approve(d.store, project.id, "Ana", "")).toThrow(/blocking/);
  });

  it("prevents duplicate jobs from repeated clicks", async () => {
    const d = deps({ delayMs: 50 });
    const p = svc.createProject(d.store, { question: "How do bees make honey?" });
    const ids: string[] = [];
    const a = svc.startPlan(d.store, d, p.id, async (id) => void ids.push(id));
    d.store.updateJob(a.id, { status: "running" });
    const b = svc.startPlan(d.store, d, p.id, async (id) => void ids.push(id));
    expect(b.id).toBe(a.id);
    expect(ids.length).toBe(1);
  });
});

describe("user sources", () => {
  it("imports pasted text and checks quotes against it", async () => {
    const d = deps({}, { search: false });
    const p = svc.createProject(d.store, { question: "How do bees make honey?", contentMode: "user-sources" });
    const ref = await addPastedSource(p.id, { title: "Beekeeping notes", text: "Honey bees collect nectar from flowers and store it in wax cells, where water evaporates." });
    svc.updateSettings(d.store, p.id, { userSources: [ref] });
    const j = await run(d, d.store.createJob(p.id, "plan", {}).id);
    expect(j.status).toBe("succeeded");
    const research = j.stages.research as { sources: { id: string; sourceType: string }[] };
    expect(research.sources[0].sourceType).toBe("user-supplied");
    expect(d.text.calls.find((c) => c.stage === "plan")!.prompt).toContain('<source id="' + ref.id);
  });

  it("refuses source mode with no sources instead of inventing them", async () => {
    const d = deps({}, { search: false });
    const p = svc.createProject(d.store, { question: "How do bees make honey?", contentMode: "user-sources" });
    const j = await run(d, d.store.createJob(p.id, "plan", {}).id);
    expect(j.status).toBe("awaiting-input");
  });
});

describe("revisions, editing and regeneration", () => {
  it("saves revisions and detects concurrent edits", async () => {
    const d = deps();
    const { project } = await planAndBuild(d);
    const draft = d.store.getDraft(project.id)!;
    const edited = { ...draft.doc, title: "Edited title" };
    const { version } = svc.saveDraft(d.store, project.id, edited, draft.version);
    expect(version).toBe(draft.version + 1);
    expect(() => svc.saveDraft(d.store, project.id, edited, draft.version)).toThrow(/changed elsewhere/);
    expect(() => svc.saveDraft(d.store, project.id, { ...edited, sections: [] }, version)).toThrow(/invalid/);
    const snap = svc.snapshot(d.store, project.id, "Mine");
    expect(snap.doc.title).toBe("Edited title");
    svc.saveDraft(d.store, project.id, { ...edited, title: "Later" }, version);
    svc.restoreRevision(d.store, project.id, snap.id);
    expect(d.store.getDraft(project.id)!.doc.title).toBe("Edited title");
  });

  it("regenerates one section, preserves locked ones and needs acceptance", async () => {
    const d = deps();
    const { project } = await planAndBuild(d);
    let draft = d.store.getDraft(project.id)!;
    const hook = draft.doc.sections.find((s) => s.kind === "hook")!;
    const actSec = draft.doc.sections.find((s) => s.kind === "activity")!;
    const locked = { ...draft.doc, sections: draft.doc.sections.map((s) => (s.id === hook.id ? { ...s, locked: true } : s)) };
    svc.saveDraft(d.store, project.id, locked, draft.version);
    expect(() => svc.startRegenerate(d.store, d, project.id, hook.id, "", async () => undefined)).toThrow(/locked/);
    let jobId = "";
    svc.startRegenerate(d.store, d, project.id, actSec.id, "Make it shorter", async (id) => {
      jobId = id;
    });
    const j = await run(d, jobId);
    expect(j.status).toBe("succeeded");
    // Nothing changes until accepted.
    expect(d.store.getDraft(project.id)!.doc.sections.find((s) => s.id === actSec.id)).toEqual(locked.sections.find((s) => s.id === actSec.id));
    svc.acceptProposal(d.store, project.id, jobId);
    draft = d.store.getDraft(project.id)!;
    const act = draft.doc.activities.find((a) => a.id === actSec.activityId)!;
    expect(act.title).toMatch(/Revised activity/);
    expect(draft.doc.answerKey.find((k) => k.id === act.answerKeyId)!.answer).toMatch(/Revised answer/);
    expect(draft.doc.sections.find((s) => s.id === hook.id)).toEqual(locked.sections.find((s) => s.id === hook.id));
    expect(validateDocument(draft.doc).ok).toBe(true);
  });

  it("records override decisions and refuses to override blocking issues", async () => {
    const d = deps();
    const { project } = await planAndBuild(d);
    const doc = d.store.getDraft(project.id)!.doc;
    const warning = doc.qualityReport!.issues.find((i) => i.severity === "warning")!;
    svc.overrideIssue(d.store, project.id, warning.id, "Checked by our science editor", "Ana");
    expect(d.store.listDecisions(project.id)[0].action).toBe("override-warning");
  });
});

describe("exports (real browser)", () => {
  let d: ReturnType<typeof deps>;
  let projectId = "";
  beforeAll(async () => {
    d = deps({}, { layout: true });
    await seedSamples(d.store, d.layout);
    projectId = d.store.listProjects().find((p) => p.title.startsWith("How does a lever"))!.id;
  }, 120000);

  it("exports a student PDF and a separate answer key from a saved revision", async () => {
    const student = await exportProject(d.store, projectId, { kind: "student-pdf", allowDraft: true });
    const pdf = await PDFDocument.load(student.bytes);
    expect(pdf.getPageCount()).toBe(3);
    expect(student.row.draft).toBe(true);
    expect(d.store.getRevision(student.row.revisionId)).not.toBeNull();
    const key = await exportProject(d.store, projectId, { kind: "answer-key-pdf", allowDraft: true });
    expect((await PDFDocument.load(key.bytes)).getPageCount()).toBeGreaterThanOrEqual(1);
    expect(key.row.revisionId).toBe(student.row.revisionId); // same unchanged draft, same revision
    const html = (await exportProject(d.store, projectId, { kind: "student-html", allowDraft: true })).bytes.toString();
    expect(html).not.toContain("Ideal values ignore friction");
    const txt = (await exportProject(d.store, projectId, { kind: "plain-text", allowDraft: true })).bytes.toString();
    expect(txt).toContain("Description: A horizontal bar rests on a triangular fulcrum");
  }, 120000);

  it("refuses non-draft export while blocking issues remain, and allows it after approval", async () => {
    const draft = d.store.getDraft(projectId)!;
    const broken = structuredClone(draft.doc);
    const act = broken.activities.find((a) => a.id === "act-calc")!;
    (act.computations[2] as { expected: number }).expected = 90;
    svc.saveDraft(d.store, projectId, broken, draft.version);
    await expect(exportProject(d.store, projectId, { kind: "student-pdf" })).rejects.toBeInstanceOf(ExportRefusedError);
    const fixed = d.store.getDraft(projectId)!;
    svc.saveDraft(d.store, projectId, draft.doc, fixed.version);
    const rev = svc.approve(d.store, projectId, "Ana Reviewer", "Checked");
    const out = await exportProject(d.store, projectId, { kind: "student-pdf", revisionId: rev.id });
    expect(out.row.draft).toBe(false);
    expect(d.store.getProject(projectId)!.status).toBe("exported");
  }, 120000);

  it("changes page size and still exports without clipping", async () => {
    const draft = d.store.getDraft(projectId)!;
    let doc = { ...draft.doc, layout: { ...draft.doc.layout, pageSize: "a4" as const, fontScale: "large" as const } };
    doc = await browserLayoutEngine.autoPaginate(doc);
    svc.saveDraft(d.store, projectId, doc, draft.version);
    const out = await exportProject(d.store, projectId, { kind: "educator-pdf", allowDraft: true });
    const pdf = await PDFDocument.load(out.bytes);
    const { width, height } = pdf.getPage(0).getSize();
    expect(Math.round(width)).toBe(595); // A4 in points
    expect(Math.round(height)).toBe(842);
    expect(out.row.unresolved.some((u) => u.code === "text-clipped")).toBe(false);
  }, 120000);

  it("compiles a workbook", async () => {
    const ids = d.store.listProjects().filter((p) => p.hasDraft).slice(0, 2).map((p) => p.id);
    const wb = d.store.createWorkbook("Science starters", ids, { cumulativeReview: true, includeAnswerKey: true });
    await expect(compileWorkbook(d.store, wb.id)).rejects.toThrow(/approved/);
    const { bytes, notes } = await compileWorkbook(d.store, wb.id, { allowDraft: true });
    expect((await PDFDocument.load(bytes)).getPageCount()).toBeGreaterThan(4);
    expect(notes.join(" ")).toMatch(/unapproved draft/);
  }, 180000);
});
