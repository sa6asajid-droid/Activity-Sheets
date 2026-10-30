"use client";
import { useState } from "react";
import type { useDocument } from "@/lib/client/useDocument";
import type { QualityIssue } from "@/lib/schema/document";
import { api } from "@/lib/client/api";
import { Badge, Button, Card, ErrorText, Notice } from "./ui";

type DocState = ReturnType<typeof useDocument>;

const GROUPS: { key: QualityIssue["category"]; title: string }[] = [
  { key: "content-evidence", title: "Content and evidence" },
  { key: "teaching-assessment", title: "Teaching and assessment" },
  { key: "visual-accuracy", title: "Visual accuracy" },
  { key: "accessibility", title: "Accessibility" },
  { key: "print-pagination", title: "Print and pagination" },
  { key: "rights-sources", title: "Rights and source records" },
  { key: "schema", title: "Document structure" },
];

const CHECK_KIND: Record<string, string> = {
  deterministic: "checked by code",
  "layout-measurement": "measured in the rendered page",
  heuristic: "heuristic estimate",
  "model-critique": "AI critique — a prompt for review, not proof",
};

const STATUS_TONE: Record<string, string> = { supported: "ok", "partially-supported": "warning", unsupported: "blocking", contested: "warning", inference: "info", speculation: "info" };

export function ReviewPanel({ projectId, state, decisions, onApproved }: { projectId: string; state: DocState; decisions: { id: string; action: string; subject: string; reason: string; reviewer: string; createdAt: string }[]; onApproved: () => void }) {
  const doc = state.doc!;
  const report = doc.qualityReport;
  const [reviewer, setReviewer] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const issues = report?.issues ?? [];
  const open = issues.filter((i) => i.resolutionStatus === "open");
  const blocking = open.filter((i) => i.severity === "blocking");

  async function override(issue: QualityIssue) {
    const reason = window.prompt(`Why is it acceptable to publish with this warning?\n\n${issue.message}`);
    if (!reason) return;
    const who = reviewer || window.prompt("Your name (recorded with the decision):") || "";
    if (!who) return;
    await state.flush();
    try {
      await api(`/api/projects/${projectId}/issues/${issue.id}/override`, { method: "POST", json: { reason, reviewer: who } });
      onApproved();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function approve(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    await state.flush();
    try {
      await api(`/api/projects/${projectId}/approve`, { method: "POST", json: { reviewer, note } });
      onApproved();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid lg:grid-cols-[1fr_360px] gap-5 items-start">
      <div className="flex flex-col gap-4">
        {!report && <Notice>Checks have not run yet. Open the Edit tab once so the pages are measured.</Notice>}
        {report && !report.layoutMeasured && <Notice tone="warning">Page overflow has not been measured for this version yet. Open the Edit tab with “Student pages” shown to measure it.</Notice>}
        {report?.readability && (
          <p className="text-sm text-muted">
            Reading level: {report.readability.method} ≈ grade {report.readability.estimatedGrade}. {report.readability.note}
          </p>
        )}
        {GROUPS.map((g) => {
          const list = issues.filter((i) => i.category === g.key);
          if (!list.length) return null;
          return (
            <Card key={g.key} className="p-4">
              <h2 className="font-display text-lg font-semibold mb-2">
                {g.title} <span className="text-sm font-sans text-muted">({list.filter((i) => i.resolutionStatus === "open").length} open)</span>
              </h2>
              <ul className="flex flex-col gap-2">
                {list.map((i) => (
                  <li key={i.id} className={`text-sm border border-line rounded-md p-2 ${i.resolutionStatus !== "open" ? "opacity-60" : ""}`}>
                    <div className="flex flex-wrap gap-2 items-start">
                      <Badge tone={i.severity}>{i.severity}</Badge>
                      <span className="grow min-w-[200px]">{i.message}</span>
                      {i.severity === "warning" && i.resolutionStatus === "open" && (
                        <Button size="sm" variant="ghost" onClick={() => void override(i)}>
                          Accept with reason
                        </Button>
                      )}
                    </div>
                    {i.suggestedFix && <p className="text-xs mt-1">Fix: {i.suggestedFix}</p>}
                    <p className="text-xs text-muted mt-0.5">
                      {CHECK_KIND[i.checkKind]}
                      {i.resolutionStatus === "overridden" && ` · accepted by ${i.reviewer}: “${i.overrideReason}”`}
                    </p>
                  </li>
                ))}
              </ul>
            </Card>
          );
        })}

        <Card className="p-4">
          <h2 className="font-display text-lg font-semibold mb-2">Claims</h2>
          <ul className="flex flex-col gap-2">
            {doc.claims.map((c) => (
              <li key={c.id} className="text-sm border border-line rounded-md p-2 flex flex-col gap-1">
                <div className="flex flex-wrap gap-2 items-start">
                  <Badge tone={STATUS_TONE[c.evidenceStatus] ?? "draft"}>{c.evidenceStatus}</Badge>
                  <span className="grow">{c.text}</span>
                  <select
                    aria-label={`Review status for claim ${c.id}`}
                    className="field-input !w-auto !py-0.5 text-xs"
                    value={c.reviewStatus}
                    onChange={(e) => state.setDoc((d) => ({ ...d, claims: d.claims.map((x) => (x.id === c.id ? { ...x, reviewStatus: e.target.value as typeof c.reviewStatus, ...(e.target.value === "accepted" && x.sourceIds.length ? { evidenceStatus: "supported" as const, statusAssignedBy: "human-reviewer" as const } : {}) } : x)) }))}
                  >
                    <option value="unreviewed">Unreviewed</option>
                    <option value="accepted">Checked — OK</option>
                    <option value="needs-change">Needs change</option>
                    <option value="rejected">Rejected</option>
                  </select>
                </div>
                <p className="text-xs text-muted">
                  {c.sourceIds.length ? `Sources: ${c.sourceIds.join(", ")}` : "No source"} · {c.statusAssignedBy}
                  {c.uncertainty ? ` · ${c.uncertainty}` : ""}
                </p>
                {c.excerpts.length > 0 && (
                  <details>
                    <summary className="text-xs cursor-pointer">Supporting excerpt</summary>
                    {c.excerpts.map((e, k) => (
                      <blockquote key={k} className="text-xs border-l-2 border-line pl-2 my-1 whitespace-pre-wrap">
                        {e}
                      </blockquote>
                    ))}
                  </details>
                )}
              </li>
            ))}
          </ul>
          <p className="text-xs text-muted mt-2">“Checked — OK” on a claim with sources records that a person read the excerpt and agrees. Claims without sources stay unsupported until a source is added.</p>
        </Card>
      </div>

      <aside className="flex flex-col gap-4 lg:sticky lg:top-4">
        <Card className="p-4">
          <form onSubmit={approve} className="flex flex-col gap-2">
            <h2 className="font-display text-lg font-semibold">Approve this revision</h2>
            <p className="text-sm text-muted">Approval is your decision, recorded with your name. It is not an accuracy score.</p>
            {blocking.length > 0 && <Notice tone="blocking">{blocking.length} blocking issue(s) must be fixed first.</Notice>}
            <label className="text-sm font-semibold flex flex-col gap-1">
              Reviewer name
              <input className="field-input font-normal" value={reviewer} onChange={(e) => setReviewer(e.target.value)} required />
            </label>
            <label className="text-sm font-semibold flex flex-col gap-1">
              Note
              <textarea className="field-input font-normal" rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
            </label>
            <ErrorText error={error} />
            <Button type="submit" variant="primary" disabled={busy || blocking.length > 0 || !reviewer.trim()}>
              Approve revision
            </Button>
          </form>
        </Card>
        <Card className="p-4">
          <h2 className="font-display text-lg font-semibold mb-2">Summary</h2>
          <ul className="text-sm">
            <li>Blocking: {blocking.length}</li>
            <li>Warnings open: {open.filter((i) => i.severity === "warning").length}</li>
            <li>Notes: {open.filter((i) => i.severity === "info").length}</li>
            <li>Overridden: {issues.filter((i) => i.resolutionStatus === "overridden").length}</li>
          </ul>
          {report && <p className="text-xs text-muted mt-2">Last checked {new Date(report.checkedAt).toLocaleString()}</p>}
        </Card>
        {decisions.length > 0 && (
          <Card className="p-4">
            <h2 className="font-display text-lg font-semibold mb-2">Decision log</h2>
            <ul className="text-xs flex flex-col gap-1">
              {decisions.map((d) => (
                <li key={d.id}>
                  <b>{d.action}</b> — {d.subject} · {d.reviewer} · {new Date(d.createdAt).toLocaleString()}
                  {d.reason ? ` · “${d.reason}”` : ""}
                </li>
              ))}
            </ul>
          </Card>
        )}
      </aside>
    </div>
  );
}
