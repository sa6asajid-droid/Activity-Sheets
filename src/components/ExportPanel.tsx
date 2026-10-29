"use client";
import { useState } from "react";
import type { useDocument } from "@/lib/client/useDocument";
import { download, ApiError } from "@/lib/client/api";
import type { ProjectData } from "@/app/projects/[id]/page";
import { Badge, Button, Card, ErrorText, Notice } from "./ui";

type DocState = ReturnType<typeof useDocument>;

const KINDS = [
  { kind: "student-pdf", label: "Student PDF", note: "Student pages only — no answers." },
  { kind: "answer-key-pdf", label: "Answer key PDF", note: "Separate answer key." },
  { kind: "teacher-notes-pdf", label: "Teacher notes PDF", note: "Rationale, sources, claims and diagram descriptions." },
  { kind: "educator-pdf", label: "Combined educator PDF", note: "Student pages + answer key + teacher notes." },
  { kind: "student-html", label: "Student HTML", note: "Structured, self-contained HTML." },
  { kind: "educator-html", label: "Educator HTML", note: "Everything, as HTML." },
  { kind: "plain-text", label: "Plain text", note: "Student text with diagram descriptions." },
  { kind: "project-json", label: "Project JSON", note: "Editable structured document (re-importable data)." },
] as const;

export function ExportPanel({ projectId, state, data, reload }: { projectId: string; state: DocState; data: ProjectData; reload: () => Promise<void> }) {
  const doc = state.doc!;
  const approved = data.revisions.filter((r) => r.kind === "approved");
  const [revisionId, setRevisionId] = useState<string>(approved[0]?.id ?? "");
  const [allowDraft, setAllowDraft] = useState(approved.length === 0);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [issues, setIssues] = useState<{ code: string; message: string }[]>([]);
  const [done, setDone] = useState<string | null>(null);
  const open = (doc.qualityReport?.issues ?? []).filter((i) => i.resolutionStatus === "open" && i.severity !== "info");

  async function run(kind: string, extra: Record<string, unknown> = {}) {
    setBusy(kind);
    setError(null);
    setIssues([]);
    setDone(null);
    await state.flush();
    try {
      const r = await download(`/api/projects/${projectId}/export`, { kind, revisionId: revisionId || undefined, allowDraft, ...extra });
      setDone(`${kind} downloaded${r.draft ? " (labelled draft)" : ""}.`);
      await reload();
    } catch (e) {
      setError((e as Error).message);
      if (e instanceof ApiError && e.issues) setIssues(e.issues);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="grid lg:grid-cols-[1fr_360px] gap-5 items-start">
      <div className="flex flex-col gap-4">
        <Card className="p-4 flex flex-col gap-3">
          <h2 className="font-display text-lg font-semibold">What to export</h2>
          <label className="text-sm font-semibold flex flex-col gap-1 max-w-md">
            Revision
            <select className="field-input font-normal" value={revisionId} onChange={(e) => setRevisionId(e.target.value)}>
              <option value="">Current working draft (saved as a snapshot first)</option>
              {data.revisions.map((r) => (
                <option key={r.id} value={r.id}>
                  r{r.number} · {r.label} {r.kind === "approved" ? "✓ approved" : ""}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={allowDraft} onChange={(e) => setAllowDraft(e.target.checked)} /> Allow a labelled draft export even if blocking issues remain
          </label>
          <p className="text-xs text-muted">Unapproved exports carry a “Draft” label. A student export that would contain answers is always refused. Exports are not certified for any publishing platform: check its current requirements.</p>
          <ul className="grid sm:grid-cols-2 gap-2">
            {KINDS.map((k) => (
              <li key={k.kind} className="border border-line rounded-md p-2 flex flex-col gap-1">
                <Button onClick={() => run(k.kind)} disabled={busy !== null} variant={k.kind === "student-pdf" ? "primary" : "secondary"}>
                  {busy === k.kind ? <span className="cs-pulse">Exporting…</span> : k.label}
                </Button>
                <span className="text-xs text-muted">{k.note}</span>
              </li>
            ))}
          </ul>
          {doc.diagrams.length > 0 && (
            <div className="flex flex-wrap gap-2 items-center text-sm">
              Diagram SVGs:
              {doc.diagrams.map((d) => (
                <Button key={d.id} size="sm" onClick={() => run("diagram-svg", { diagramId: d.id })} disabled={busy !== null}>
                  {d.id}
                </Button>
              ))}
            </div>
          )}
          <div className="flex gap-2 items-center text-sm">
            Page preview PNG:
            <Button size="sm" onClick={() => run("page-png", { pageNumber: 1 })} disabled={busy !== null}>
              Page 1
            </Button>
          </div>
          {done && <Notice tone="ok">{done}</Notice>}
          <ErrorText error={error} />
          {issues.length > 0 && (
            <ul className="text-sm list-disc pl-5">
              {issues.map((i, k) => (
                <li key={k}>{i.message}</li>
              ))}
            </ul>
          )}
        </Card>
        <Card className="p-4">
          <h2 className="font-display text-lg font-semibold mb-2">Export history</h2>
          {data.exports.length === 0 && <p className="text-sm text-muted">No exports yet.</p>}
          <ul className="text-sm flex flex-col gap-1">
            {data.exports.map((e) => (
              <li key={e.id} className="flex flex-wrap gap-2 items-center">
                <a className="underline text-accent" href={`/api/exports/${e.id}`}>
                  {e.kind}
                </a>
                {e.draft ? <Badge tone="warning">draft</Badge> : <Badge tone="ok">approved</Badge>}
                <span className="text-xs text-muted">
                  {new Date(e.createdAt).toLocaleString()} · rev {data.revisions.find((r) => r.id === e.revisionId)?.number ?? "?"} · {e.unresolved.length} unresolved · sha256 {e.sha256.slice(0, 10)}…
                </span>
              </li>
            ))}
          </ul>
        </Card>
      </div>
      <aside className="flex flex-col gap-4">
        <Card className="p-4">
          <h2 className="font-display text-lg font-semibold mb-2">Still unresolved ({open.length})</h2>
          {open.length === 0 ? (
            <p className="text-sm text-ok">No open warnings or blocking issues.</p>
          ) : (
            <ul className="text-sm flex flex-col gap-1">
              {open.slice(0, 30).map((i) => (
                <li key={i.id} className="flex gap-2">
                  <Badge tone={i.severity}>{i.severity}</Badge> <span>{i.message}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Notice>
          The PDF is tagged by the browser engine, but reading order and tagging are not verified to PDF/UA. Provide the HTML or plain-text export (with diagram descriptions) to learners who need an accessible version.
        </Notice>
      </aside>
    </div>
  );
}
