"use client";
import { use, useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/client/api";
import { useDocument } from "@/lib/client/useDocument";
import type { ProjectRow } from "@/lib/db/store";
import type { WorksheetDocument } from "@/lib/schema/document";
import { Badge, Button, ErrorText, Notice } from "@/components/ui";
import { JobProgress, type JobSummary } from "@/components/JobProgress";
import { PlanReview } from "@/components/PlanReview";
import { SourcesPanel } from "@/components/SourcesPanel";
import { Editor } from "@/components/Editor";
import { ReviewPanel } from "@/components/ReviewPanel";
import { ExportPanel } from "@/components/ExportPanel";
import { HistoryPanel } from "@/components/HistoryPanel";
import { useStatus } from "@/components/ProviderBanner";

export interface ProjectData {
  project: ProjectRow;
  draft: { doc: WorksheetDocument; version: number } | null;
  jobs: { active: JobSummary | null; plan: JobSummary | null; build: JobSummary | null; regenerate: (JobSummary & { proposal: unknown }) | null };
  usage: { inputTokens: number; outputTokens: number; searches: number; costUsd: number; calls: number };
  revisions: { id: string; number: number; kind: string; label: string; createdAt: string; approvedBy: string | null }[];
  exports: { id: string; kind: string; revisionId: string; draft: boolean; createdAt: string; sha256: string; unresolved: { code: string; severity: string; message: string }[] }[];
  decisions: { id: string; action: string; subject: string; reason: string; reviewer: string; createdAt: string }[];
}

const TABS = [
  { key: "plan", label: "Plan" },
  { key: "sources", label: "Sources" },
  { key: "edit", label: "Edit" },
  { key: "review", label: "Review" },
  { key: "export", label: "Export" },
  { key: "history", label: "History" },
] as const;
type Tab = (typeof TABS)[number]["key"];

export default function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const search = useSearchParams();
  const status = useStatus();
  const [data, setData] = useState<ProjectData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab | null>((search.get("tab") as Tab) ?? null);
  const docState = useDocument(id, null, 0);
  const { reset } = docState;

  const load = useCallback(
    async (resetDoc = true) => {
      try {
        const d = await api<ProjectData>(`/api/projects/${id}`);
        setData(d);
        if (resetDoc) reset(d.draft?.doc ?? null, d.draft?.version ?? 0);
        setTab((t) => t ?? (d.draft ? "edit" : "plan"));
      } catch (e) {
        setError((e as Error).message);
      }
    },
    [id, reset],
  );

  useEffect(() => {
    void load();
  }, [load]);

  async function switchTab(t: Tab) {
    await docState.flush();
    setTab(t);
    router.replace(`/projects/${id}?tab=${t}`, { scroll: false });
    void load(false);
  }

  if (error) return <ErrorText error={error} />;
  if (!data) return <p className="cs-pulse text-muted">Loading…</p>;
  const p = data.project;
  const blocking = (docState.doc?.qualityReport?.issues ?? []).filter((i) => i.severity === "blocking" && i.resolutionStatus === "open").length;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start gap-3">
        <div className="mr-auto min-w-0">
          <p className="text-sm text-muted">
            <Link href="/" className="hover:underline">
              Worksheets
            </Link>{" "}
            / {p.folder || "Unfiled"}
          </p>
          <h1 className="font-display text-2xl font-semibold leading-tight">{p.title}</h1>
          <div className="flex flex-wrap gap-2 items-center mt-1 text-xs text-muted">
            <Badge tone={p.status}>{p.status.replace("-", " ")}</Badge>
            {p.isSample && <Badge tone="info">Demo sample — not reviewed</Badge>}
            {docState.doc?.contentMode === "unverified-draft" && <Badge tone="warning">Unverified draft</Badge>}
            <span>
              AI usage: ${data.usage.costUsd.toFixed(3)} of ${p.settings.budget.maxCostUsd.toFixed(2)} limit · {data.usage.calls} call{data.usage.calls === 1 ? "" : "s"}
            </span>
          </div>
        </div>
      </div>

      <nav aria-label="Worksheet steps" className="flex flex-wrap gap-1 border-b border-line">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => void switchTab(t.key)}
            aria-current={tab === t.key ? "page" : undefined}
            className={`px-3 py-2 text-sm font-semibold border-b-2 -mb-px ${tab === t.key ? "border-accent text-accent" : "border-transparent text-muted hover:text-ink"}`}
          >
            {t.label}
            {t.key === "review" && blocking > 0 && <span className="ml-1 rounded bg-[#f8e1e2] px-1 text-bad">{blocking}</span>}
          </button>
        ))}
      </nav>

      {data.jobs.active && data.jobs.active.kind !== "regenerate-section" && (
        <JobProgress
          jobId={data.jobs.active.id}
          onFinished={(status) => {
            const wasBuild = data.jobs.active?.kind === "build";
            void load().then(() => {
              if (status === "succeeded" && wasBuild) setTab("edit");
            });
          }}
        />
      )}

      {tab === "plan" && <PlanTab data={data} reload={load} demoOnly={Boolean(status?.providers.demoOnly)} goSources={() => void switchTab("sources")} />}
      {tab === "sources" && <SourcesPanel project={p} onChange={() => void load(false)} onStartPlan={async () => { await api(`/api/projects/${id}/plan`, { method: "POST", json: {} }); await load(); setTab("plan"); }} demoOnly={Boolean(status?.providers.demoOnly)} />}
      {tab === "edit" &&
        (docState.doc ? (
          <Editor projectId={id} state={docState} regenerate={data.jobs.regenerate} reload={() => load(false)} reloadDocument={() => load(true)} canGenerate={!status?.providers.demoOnly} />
        ) : (
          <Notice>There is no worksheet yet. Review and approve the lesson plan first.</Notice>
        ))}
      {tab === "review" && (docState.doc ? <ReviewPanel projectId={id} state={docState} decisions={data.decisions} onApproved={() => load()} /> : <Notice>Nothing to review yet.</Notice>)}
      {tab === "export" && (docState.doc ? <ExportPanel projectId={id} state={docState} data={data} reload={() => load(false)} /> : <Notice>Nothing to export yet.</Notice>)}
      {tab === "history" && <HistoryPanel projectId={id} data={data} onRestored={() => load()} />}
    </div>
  );
}

function PlanTab({ data, reload, demoOnly, goSources }: { data: ProjectData; reload: () => Promise<void>; demoOnly: boolean; goSources: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const plan = data.jobs.plan;
  async function start() {
    setBusy(true);
    setError(null);
    try {
      await api(`/api/projects/${data.project.id}/plan`, { method: "POST", json: {} });
      await reload();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  if (data.jobs.active?.kind === "plan") return null;
  if (!plan || plan.status === "cancelled" || plan.status === "failed") {
    return (
      <div className="flex flex-col gap-3 max-w-2xl">
        {plan?.status === "failed" && <Notice tone="blocking" title="Planning stopped">{plan.error}</Notice>}
        {demoOnly ? (
          <Notice tone="warning" title="Demo mode">No AI provider is configured, so this question cannot be planned or written here. Demo samples can still be edited, checked and exported.</Notice>
        ) : (
          <>
            <p>Planning reads the question, gathers evidence and proposes objectives and activities for you to review. Nothing is written until you approve the plan.</p>
            {(data.project.settings.contentMode === "user-sources" || data.project.settings.contentMode === "mixed") && (
              <p className="text-sm">
                This project uses your sources ({data.project.settings.userSources.length} added).{" "}
                <button className="underline" onClick={goSources}>
                  Manage sources
                </button>
              </p>
            )}
            <div>
              <Button variant="primary" onClick={start} disabled={busy}>
                {plan ? "Start planning again" : "Start planning"}
              </Button>
            </div>
          </>
        )}
        <ErrorText error={error} />
      </div>
    );
  }
  if (plan.status === "awaiting-input" || plan.status === "awaiting-budget") return <JobProgress jobId={plan.id} onFinished={() => void reload()} />;
  if (plan.status === "succeeded") return <PlanReview projectId={data.project.id} hasDraft={Boolean(data.draft)} onBuilt={() => void reload()} />;
  return null;
}
