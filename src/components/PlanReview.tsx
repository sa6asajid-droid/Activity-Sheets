"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/client/api";
import type { PlanOutT, InterpretOutT } from "@/lib/pipeline/llm-schemas";
import type { Claim, Source } from "@/lib/schema/document";
import { STRATEGY_LABELS } from "@/lib/pedagogy/strategies";
import { Badge, Button, Card, ErrorText, Notice } from "./ui";

interface Review {
  job: { id: string; status: string };
  interpret: InterpretOutT | null;
  research: { sources: Source[]; note: string } | null;
  plan: { plan: PlanOutT; claims: Claim[]; questionType: string } | null;
}

const STATUS_TONE: Record<string, string> = { supported: "ok", "partially-supported": "warning", unsupported: "blocking", contested: "warning", inference: "info", speculation: "info" };

export function PlanReview({ projectId, hasDraft, onBuilt }: { projectId: string; hasDraft: boolean; onBuilt: () => void }) {
  const [review, setReview] = useState<Review | null>(null);
  const [plan, setPlan] = useState<PlanOutT | null>(null);
  const [claims, setClaims] = useState<Claim[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<{ review: Review }>(`/api/projects/${projectId}/plan`)
      .then((r) => {
        setReview(r.review);
        if (r.review?.plan) {
          setPlan(r.review.plan.plan);
          setClaims(r.review.plan.claims);
        }
      })
      .catch((e) => setError((e as Error).message));
  }, [projectId]);

  if (error) return <ErrorText error={error} />;
  if (!review || !plan) return <p className="text-muted cs-pulse">Loading plan…</p>;
  const P = (patch: Partial<PlanOutT>) => setPlan({ ...plan, ...patch });
  const sources = review.research?.sources ?? [];
  const interp = review.interpret;

  async function build() {
    if (hasDraft && !window.confirm("Building replaces the current working draft with a new generated revision. Earlier revisions stay in History. Continue?")) return;
    setBusy(true);
    setError(null);
    try {
      await api(`/api/projects/${projectId}/build`, { method: "POST", json: { plan, claims, sources } });
      onBuilt();
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <div className="grid lg:grid-cols-[1fr_380px] gap-5 items-start">
      <div className="flex flex-col gap-4">
        <Card className="p-4 flex flex-col gap-3">
          <h2 className="font-display text-xl font-semibold">How the question was read</h2>
          {interp && (
            <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1 text-sm">
              <dt className="font-semibold">Interpreted as</dt>
              <dd>{interp.interpretedQuestion}</dd>
              <dt className="font-semibold">Question type</dt>
              <dd>{interp.questionType}</dd>
              {interp.sensitivity.level !== "none" && (
                <>
                  <dt className="font-semibold">Sensitivity</dt>
                  <dd>
                    <Badge tone="warning">{interp.sensitivity.level}</Badge> {interp.sensitivity.reasons.join("; ")}
                  </dd>
                </>
              )}
            </dl>
          )}
          <label className="text-sm font-semibold flex flex-col gap-1">
            Scope
            <textarea className="field-input font-normal" rows={2} value={plan.scope} onChange={(e) => P({ scope: e.target.value })} />
          </label>
          <label className="text-sm font-semibold flex flex-col gap-1">
            Assumed prior knowledge (one per line)
            <textarea className="field-input font-normal" rows={2} value={plan.prerequisites.join("\n")} onChange={(e) => P({ prerequisites: e.target.value.split("\n").filter(Boolean) })} />
          </label>
        </Card>

        <Card className="p-4 flex flex-col gap-3">
          <h2 className="font-display text-xl font-semibold">Objectives</h2>
          {plan.objectives.map((o, i) => (
            <div key={o.id} className="grid sm:grid-cols-[1fr_1fr_auto] gap-2 items-end">
              <label className="text-sm font-semibold flex flex-col gap-1">
                Learners will be able to…
                <input className="field-input font-normal" value={o.text} onChange={(e) => P({ objectives: plan.objectives.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)) })} />
              </label>
              <label className="text-sm font-semibold flex flex-col gap-1">
                Evidence of it
                <input className="field-input font-normal" value={o.evidence} onChange={(e) => P({ objectives: plan.objectives.map((x, j) => (j === i ? { ...x, evidence: e.target.value } : x)) })} />
              </label>
              <Button size="sm" variant="ghost" disabled={plan.objectives.length <= 1} onClick={() => P({ objectives: plan.objectives.filter((_, j) => j !== i) })} aria-label={`Remove objective ${i + 1}`}>
                Remove
              </Button>
            </div>
          ))}
          {plan.objectives.length < 3 && (
            <div>
              <Button size="sm" onClick={() => P({ objectives: [...plan.objectives, { id: `obj-${Date.now() % 100000}`, text: "", evidence: "" }] })}>
                Add objective
              </Button>
            </div>
          )}
        </Card>

        <Card className="p-4 flex flex-col gap-3">
          <h2 className="font-display text-xl font-semibold">Proposed explanation</h2>
          <label className="text-sm font-semibold flex flex-col gap-1">
            Direct answer
            <textarea className="field-input font-normal" rows={3} value={plan.directAnswerDraft} onChange={(e) => P({ directAnswerDraft: e.target.value })} />
          </label>
          <label className="text-sm font-semibold flex flex-col gap-1">
            Explanation sequence (one step per line)
            <textarea className="field-input font-normal" rows={4} value={plan.explanationSequence.join("\n")} onChange={(e) => P({ explanationSequence: e.target.value.split("\n").filter(Boolean) })} />
          </label>
          {plan.misconceptions.length > 0 && (
            <div>
              <h3 className="font-semibold text-sm mb-1">Ideas learners may bring</h3>
              <ul className="text-sm flex flex-col gap-1">
                {plan.misconceptions.map((m, i) => (
                  <li key={i} className="flex gap-2 items-start">
                    <span className="grow">
                      “{m.text}” → {m.correction} <span className="text-muted">({m.basis === "source" ? "from a source" : "plausible, not verified"})</span>
                    </span>
                    <Button size="sm" variant="ghost" onClick={() => P({ misconceptions: plan.misconceptions.filter((_, j) => j !== i) })}>
                      Remove
                    </Button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Card>

        <Card className="p-4 flex flex-col gap-3">
          <h2 className="font-display text-xl font-semibold">Activities and visuals</h2>
          <ul className="text-sm flex flex-col gap-1.5">
            {plan.proposedActivities.map((a, i) => (
              <li key={i} className="flex gap-2 items-start">
                <Badge tone="draft">{a.type}</Badge>
                <span className="grow">{a.purpose}</span>
                <Button size="sm" variant="ghost" onClick={() => P({ proposedActivities: plan.proposedActivities.filter((_, j) => j !== i) })}>
                  Remove
                </Button>
              </li>
            ))}
          </ul>
          <ul className="text-sm flex flex-col gap-1.5">
            {plan.proposedVisuals.map((v, i) => (
              <li key={i} className="flex gap-2 items-start">
                <Badge tone="info">{v.diagramType}</Badge>
                <span className="grow">
                  {v.purpose} <span className="text-muted">Without it: {v.lossIfRemoved}</span>
                </span>
                <Button size="sm" variant="ghost" onClick={() => P({ proposedVisuals: plan.proposedVisuals.filter((_, j) => j !== i) })}>
                  Remove
                </Button>
              </li>
            ))}
          </ul>
        </Card>

        <Card className="p-4 flex flex-col gap-3">
          <h2 className="font-display text-xl font-semibold">Claims the worksheet will rely on</h2>
          <p className="text-xs text-muted">Status is assigned by the source match (deterministic quote check) or by a model assessment. Neither is verification: review before publishing.</p>
          <ul className="flex flex-col gap-2">
            {claims.map((c, i) => (
              <li key={c.id} className="text-sm border border-line rounded-md p-2 flex flex-col gap-1">
                <div className="flex gap-2 items-start">
                  <Badge tone={STATUS_TONE[c.evidenceStatus] ?? "draft"}>{c.evidenceStatus}</Badge>
                  <input className="field-input grow" aria-label={`Claim ${i + 1}`} value={c.text} onChange={(e) => setClaims(claims.map((x, j) => (j === i ? { ...x, text: e.target.value, evidenceStatus: x.evidenceStatus === "supported" ? "partially-supported" : x.evidenceStatus, uncertainty: "Edited by the editor after the source match; recheck." } : x)))} />
                  <Button size="sm" variant="ghost" onClick={() => setClaims(claims.filter((_, j) => j !== i))}>
                    Remove
                  </Button>
                </div>
                <p className="text-xs text-muted">
                  Sources: {c.sourceIds.join(", ") || "none"} · {c.statusAssignedBy}
                  {c.uncertainty ? ` · ${c.uncertainty}` : ""}
                </p>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <aside className="flex flex-col gap-4 lg:sticky lg:top-4">
        <Card className="p-4 flex flex-col gap-3">
          <Button variant="primary" onClick={build} disabled={busy || plan.objectives.some((o) => !o.text.trim())}>
            {busy ? "Starting…" : hasDraft ? "Rebuild worksheet from this plan" : "Approve plan and write worksheet"}
          </Button>
          <ErrorText error={error} />
          {plan.warnings.length > 0 && (
            <Notice tone="warning" title="For the editor">
              <ul className="list-disc pl-4">
                {plan.warnings.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            </Notice>
          )}
          {review.research?.note && <p className="text-xs text-muted">{review.research.note}</p>}
        </Card>
        <details className="bg-card border border-line rounded-lg p-4" open>
          <summary className="font-display text-lg font-semibold cursor-pointer">Why this lesson is structured this way</summary>
          <p className="text-sm mt-2">{plan.rationale}</p>
          <ul className="text-sm mt-2 flex flex-col gap-1">
            {plan.selectedStrategies.map((s) => (
              <li key={s.id}>
                <b>{STRATEGY_LABELS[s.id]}</b> — {s.rationale}
              </li>
            ))}
          </ul>
        </details>
        <Card className="p-4">
          <h2 className="font-display text-lg font-semibold mb-2">Evidence sources ({sources.length})</h2>
          {sources.length === 0 && <Notice tone="warning">No sources. The worksheet will be labelled an unverified draft.</Notice>}
          <ol className="text-sm flex flex-col gap-2">
            {sources.map((s) => (
              <li key={s.id}>
                <b>{s.id}</b> {s.title} <span className="text-muted">{s.authorOrOrganization}</span>
                {s.location.kind === "url" && (
                  <a className="block text-xs text-accent underline break-all" href={s.location.value} target="_blank" rel="noopener noreferrer nofollow">
                    {s.location.value}
                  </a>
                )}
                <details>
                  <summary className="text-xs cursor-pointer text-muted">Excerpt</summary>
                  <p className="text-xs whitespace-pre-wrap">{s.excerpt.slice(0, 1200)}</p>
                </details>
              </li>
            ))}
          </ol>
        </Card>
      </aside>
    </div>
  );
}
