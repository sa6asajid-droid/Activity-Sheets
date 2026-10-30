"use client";
import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/client/api";
import { Button, Card, ErrorText, Notice } from "./ui";

export interface JobSummary {
  id: string;
  kind: string;
  stage: string;
  stageLabel: string;
  status: string;
  error: string | null;
  message: string | null;
}

interface JobDetail extends JobSummary {
  projectId: string;
  attempts: number;
  actualUsage: { inputTokens: number; outputTokens: number; searches: number; costUsd: number };
  costEstimateUsd: number;
  stages: { key: string; label: string; done: boolean; current: boolean }[];
  clarification: { term: string; meanings: string[]; clarifyingQuestion: string }[] | null;
  running: boolean;
}

/**
 * Shows real stages (never a fake percentage), and the actions each state
 * needs: cancel, resume, answer a clarification, or approve more budget.
 */
export function JobProgress({ jobId, onFinished }: { jobId: string; onFinished: (status: string) => void }) {
  const [job, setJob] = useState<JobDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [extra, setExtra] = useState(1);
  const [busy, setBusy] = useState(false);
  const finished = useRef(false);
  // Keep the latest callback without restarting the polling loop on every render.
  const onFinishedRef = useRef(onFinished);
  onFinishedRef.current = onFinished;

  useEffect(() => {
    let stop = false;
    let t: ReturnType<typeof setTimeout>;
    const tick = async () => {
      try {
        const r = await api<{ job: JobDetail }>(`/api/jobs/${jobId}`);
        if (stop) return;
        setJob(r.job);
        const active = r.job.status === "running" || r.job.status === "queued";
        if (!active && !finished.current && (r.job.status === "succeeded" || r.job.status === "failed" || r.job.status === "cancelled")) {
          finished.current = true;
          onFinishedRef.current(r.job.status);
        }
        if (active) {
          finished.current = false;
          t = setTimeout(tick, 1500);
        }
      } catch (e) {
        if (!stop) setError((e as Error).message);
      }
    };
    void tick();
    return () => {
      stop = true;
      clearTimeout(t);
    };
  }, [jobId, busy]);

  async function act(action: string, extraBody: Record<string, unknown> = {}) {
    setBusy(true);
    setError(null);
    try {
      await api(`/api/jobs/${jobId}`, { method: "POST", json: { action, ...extraBody } });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (!job) return <p className="text-muted cs-pulse">Checking progress…</p>;
  const active = job.status === "running" || job.status === "queued";
  if (job.status === "succeeded" && job.kind !== "plan") return null;

  return (
    <Card className="p-4 flex flex-col gap-3" as="div">
      <div className="flex items-center gap-3">
        <h2 className="font-display text-lg font-semibold mr-auto">{job.kind === "plan" ? "Planning" : job.kind === "build" ? "Building the worksheet" : "Regenerating"}</h2>
        {active && (
          <Button size="sm" variant="danger" onClick={() => act("cancel")} disabled={busy}>
            Cancel
          </Button>
        )}
        {(job.status === "failed" || job.status === "cancelled") && (
          <Button size="sm" variant="primary" onClick={() => act("resume")} disabled={busy}>
            Resume from “{job.stageLabel}”
          </Button>
        )}
      </div>
      <ol className="flex flex-wrap gap-x-5 gap-y-1 text-sm" aria-label="Stages">
        {job.stages.map((s) => (
          <li key={s.key} className={`flex items-center gap-1.5 ${s.done ? "text-ok" : s.current ? "text-ink font-semibold" : "text-muted"}`} aria-current={s.current ? "step" : undefined}>
            <span aria-hidden="true">{s.done ? "✓" : s.current ? "●" : "○"}</span>
            {s.label}
            {s.current && <span className="sr-only"> (in progress)</span>}
          </li>
        ))}
      </ol>
      <p className="text-xs text-muted" aria-live="polite">
        {active ? <span className="cs-pulse">{job.stageLabel}…</span> : <>Status: {job.status.replace("-", " ")}</>} · AI usage so far ${job.actualUsage.costUsd.toFixed(3)} ({job.actualUsage.inputTokens + job.actualUsage.outputTokens} tokens
        {job.actualUsage.searches ? `, ${job.actualUsage.searches} searches` : ""})
      </p>
      {job.status === "failed" && <Notice tone="blocking" title="Stopped">{job.error} Completed stages are saved.</Notice>}
      {job.status === "cancelled" && <Notice>{job.message}</Notice>}
      {job.status === "awaiting-budget" && (
        <Notice tone="warning" title="Spending limit reached">
          <p>{job.message}</p>
          <div className="flex gap-2 items-end mt-2">
            <label className="text-sm flex flex-col">
              Approve an extra (USD)
              <input type="number" min={0.1} max={50} step={0.5} value={extra} onChange={(e) => setExtra(Number(e.target.value))} className="field-input w-28" />
            </label>
            <Button size="sm" variant="primary" onClick={() => act("budget", { extraUsd: extra })} disabled={busy}>
              Approve and continue
            </Button>
          </div>
        </Notice>
      )}
      {job.status === "awaiting-input" && job.clarification && (
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            void act("clarify", { answers: job.clarification!.map((c, i) => ({ question: c.clarifyingQuestion, answer: answers[i] ?? "" })) });
          }}
        >
          <Notice tone="warning" title="Which meaning?">
            {job.message}
          </Notice>
          {job.clarification.map((c, i) => (
            <fieldset key={i} className="flex flex-col gap-1">
              <legend className="font-semibold">{c.clarifyingQuestion}</legend>
              {c.meanings.map((m) => (
                <label key={m} className="flex gap-2 items-center text-sm">
                  <input type="radio" name={`c${i}`} value={m} checked={answers[i] === m} onChange={() => setAnswers((a) => ({ ...a, [i]: m }))} /> {m}
                </label>
              ))}
              <label className="text-sm flex flex-col mt-1">
                Or describe what you mean
                <input className="field-input" value={c.meanings.includes(answers[i] ?? "") ? "" : (answers[i] ?? "")} onChange={(e) => setAnswers((a) => ({ ...a, [i]: e.target.value }))} />
              </label>
            </fieldset>
          ))}
          <div>
            <Button type="submit" variant="primary" disabled={busy || job.clarification.some((_, i) => !answers[i])}>
              Continue planning
            </Button>
          </div>
        </form>
      )}
      {job.status === "awaiting-input" && !job.clarification && (
        <Notice tone="warning" title="Needs your input">
          <p>{job.message}</p>
          {job.stage === "research" && (
            <div className="flex flex-wrap gap-2 mt-2">
              <Button
                size="sm"
                onClick={async () => {
                  await api(`/api/projects/${job.projectId}`, { method: "PATCH", json: { settings: { contentMode: "unverified-draft" } } });
                  await act("resume");
                }}
                disabled={busy}
              >
                Continue as a labelled unverified draft
              </Button>
              <a className="rounded-md border border-line px-2.5 py-1 text-sm font-semibold" href={`/projects/${job.projectId}?tab=sources`}>
                Add sources instead
              </a>
            </div>
          )}
        </Notice>
      )}
      <ErrorText error={error} />
    </Card>
  );
}
