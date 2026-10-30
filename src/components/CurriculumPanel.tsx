"use client";
import { useState } from "react";
import { api } from "@/lib/client/api";
import type { useDocument } from "@/lib/client/useDocument";
import type { ProjectRow } from "@/lib/db/store";
import type { WorksheetDocument } from "@/lib/schema/document";
import { Badge, Button, Card, ErrorText, Notice } from "./ui";

type DocState = ReturnType<typeof useDocument>;
type Item = WorksheetDocument["teacherNotes"]["curriculum"]["items"][number] & { problem?: string };

function statusOf(items: Item[]): WorksheetDocument["teacherNotes"]["curriculum"]["status"] {
  if (!items.length) return "none";
  return items.every((i) => i.verifiedInDocument) ? "verified-from-document" : "suggested-unverified";
}

const STATUS_TEXT = {
  none: "No curriculum mapping.",
  "suggested-unverified": "Suggested topic alignment—not verified curriculum alignment.",
  "verified-from-document": "Every expectation below was found word for word in the curriculum document. Whether the worksheet really teaches it is still your judgement.",
} as const;

/**
 * Curriculum alignment against documents the editor supplies. Wording and
 * codes are verified by exact match on the server; editing an item clears
 * its verification until it is checked again.
 */
export function CurriculumPanel({ projectId, project, state, onChange, canGenerate }: { projectId: string; project: ProjectRow; state: DocState; onChange: () => Promise<void>; canGenerate: boolean }) {
  const doc = state.doc!;
  const cur = doc.teacherNotes.curriculum;
  const docs = project.settings.curriculumDocs ?? [];
  const [items, setItems] = useState<Item[]>(cur.items);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [form, setForm] = useState({ title: "", jurisdiction: "", version: "", text: "" });
  const [file, setFile] = useState<File | null>(null);
  const [suggested, setSuggested] = useState<{ items: Item[]; discarded: number } | null>(null);

  function commit(next: Item[], docId?: string) {
    setItems(next);
    const ref = docs.find((d) => d.id === (docId ?? next.find((i) => i.documentId)?.documentId));
    state.setDoc((d) => ({
      ...d,
      teacherNotes: {
        ...d.teacherNotes,
        curriculum: {
          ...d.teacherNotes.curriculum,
          items: next.map(({ problem: _p, ...i }) => (void _p, i)),
          status: statusOf(next),
          documentTitle: ref?.title ?? d.teacherNotes.curriculum.documentTitle,
          documentVersion: ref?.version || d.teacherNotes.curriculum.documentVersion,
          jurisdiction: ref?.jurisdiction || d.teacherNotes.curriculum.jurisdiction,
        },
      },
    }));
  }

  const edit = (i: number, patch: Partial<Item>) => commit(items.map((it, j) => (j === i ? { ...it, ...patch, verifiedInDocument: false, problem: "Edited — check against the document again." } : it)));

  async function addDoc(e: React.FormEvent) {
    e.preventDefault();
    setBusy("add");
    setError(null);
    try {
      if (file) {
        const fd = new FormData();
        fd.set("file", file);
        Object.entries(form).forEach(([k, v]) => k !== "text" && fd.set(k, v));
        const res = await fetch(`/api/projects/${projectId}/curriculum`, { method: "POST", body: fd });
        if (!res.ok) throw new Error((await res.json()).error ?? "Upload failed");
      } else {
        await api(`/api/projects/${projectId}/curriculum`, { method: "POST", json: form });
      }
      setForm({ title: "", jurisdiction: "", version: "", text: "" });
      setFile(null);
      await onChange();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function verify() {
    setBusy("verify");
    setError(null);
    try {
      const r = await api<{ items: Item[] }>(`/api/projects/${projectId}/curriculum/verify`, { method: "POST", json: { items: items.map(({ problem: _p, ...i }) => (void _p, i)) } });
      commit(r.items);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function suggest(docId: string) {
    setBusy("suggest");
    setError(null);
    setSuggested(null);
    try {
      await state.flush();
      const { jobId } = await api<{ jobId: string }>(`/api/projects/${projectId}/curriculum/map`, { method: "POST", json: { docId } });
      for (;;) {
        await new Promise((r) => setTimeout(r, 1500));
        const { job } = await api<{ job: { status: string; error: string | null; message: string | null; result?: { items: Item[]; discarded: number } } }>(`/api/jobs/${jobId}`);
        if (job.status === "running" || job.status === "queued") continue;
        if (job.status === "succeeded" && job.result) setSuggested(job.result);
        else setError(job.error ?? job.message ?? "Mapping stopped.");
        break;
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function removeDoc(id: string) {
    if (!window.confirm("Remove this curriculum document? Mappings that cite it will no longer verify.")) return;
    await api(`/api/projects/${projectId}/curriculum?docId=${encodeURIComponent(id)}`, { method: "DELETE" });
    await onChange();
  }

  const objectives = doc.learningPlan.objectives;
  return (
    <div className="grid lg:grid-cols-[1fr_380px] gap-5 items-start">
      <div className="flex flex-col gap-4">
        <Notice tone={cur.status === "verified-from-document" ? "ok" : cur.status === "suggested-unverified" ? "warning" : "info"} title="Current status">
          {STATUS_TEXT[statusOf(items)]}
        </Notice>
        <Card className="p-4 flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <h2 className="font-display text-lg font-semibold mr-auto">Expectations this worksheet addresses</h2>
            <Button size="sm" onClick={() => commit([...items, { expectation: "", objectiveIds: [objectives[0].id], activityIds: [], coverageLimitations: "", verifiedInDocument: false }])}>
              Add expectation
            </Button>
            <Button size="sm" variant="primary" onClick={() => void verify()} disabled={!items.length || busy !== null || !docs.length}>
              {busy === "verify" ? "Checking…" : "Check against document"}
            </Button>
          </div>
          {!docs.length && <p className="text-sm text-muted">Add the curriculum document first; expectations can only be verified against stored text.</p>}
          {items.length === 0 && <p className="text-sm text-muted">No expectations mapped.</p>}
          {items.map((it, i) => (
            <div key={i} className="border border-line rounded-md p-3 flex flex-col gap-2 text-sm">
              <div className="flex items-center gap-2">
                {it.verifiedInDocument ? <Badge tone="ok">found in document</Badge> : <Badge tone="warning">not verified</Badge>}
                {it.location && <span className="text-xs text-muted">{it.location}</span>}
                <Button size="sm" variant="ghost" className="ml-auto" onClick={() => commit(items.filter((_, j) => j !== i))}>
                  Remove
                </Button>
              </div>
              {it.problem && <p className="text-xs text-warn">{it.problem}</p>}
              <label className="font-semibold flex flex-col gap-1">
                Expectation (copy the exact wording)
                <textarea className="field-input font-normal" rows={2} value={it.expectation} onChange={(e) => edit(i, { expectation: e.target.value })} />
              </label>
              <div className="grid sm:grid-cols-2 gap-2">
                <label className="font-semibold flex flex-col gap-1">
                  Code (only if printed in the document)
                  <input className="field-input font-normal" value={it.code ?? ""} onChange={(e) => edit(i, { code: e.target.value || undefined })} />
                </label>
                <label className="font-semibold flex flex-col gap-1">
                  Location in the document
                  <input className="field-input font-normal" value={it.location ?? ""} onChange={(e) => edit(i, { location: e.target.value || undefined })} placeholder="e.g. Strand B, p. 112" />
                </label>
              </div>
              <fieldset className="flex flex-wrap gap-x-4 gap-y-1">
                <legend className="font-semibold">Objectives</legend>
                {objectives.map((o) => (
                  <label key={o.id} className="flex items-center gap-1.5">
                    <input type="checkbox" checked={it.objectiveIds.includes(o.id)} onChange={(e) => edit(i, { objectiveIds: e.target.checked ? [...it.objectiveIds, o.id] : it.objectiveIds.filter((x) => x !== o.id) })} />
                    {o.text.slice(0, 60)}
                  </label>
                ))}
              </fieldset>
              <fieldset className="flex flex-wrap gap-x-4 gap-y-1">
                <legend className="font-semibold">Activities</legend>
                {doc.activities.map((a) => (
                  <label key={a.id} className="flex items-center gap-1.5">
                    <input type="checkbox" checked={it.activityIds.includes(a.id)} onChange={(e) => edit(i, { activityIds: e.target.checked ? [...it.activityIds, a.id] : it.activityIds.filter((x) => x !== a.id) })} />
                    {a.title.slice(0, 40)}
                  </label>
                ))}
              </fieldset>
              <label className="font-semibold flex flex-col gap-1">
                What it does not cover
                <input className="field-input font-normal" value={it.coverageLimitations} onChange={(e) => edit(i, { coverageLimitations: e.target.value })} />
              </label>
            </div>
          ))}
        </Card>
        {suggested && (
          <Card className="p-4 flex flex-col gap-2">
            <h2 className="font-display text-lg font-semibold">Suggested mappings</h2>
            <p className="text-xs text-muted">
              Each suggestion below was found word for word in the document. {suggested.discarded > 0 && `${suggested.discarded} suggestion(s) were discarded because their wording or code was not in the document.`}
            </p>
            {suggested.items.length === 0 && <p className="text-sm">No verifiable matches were found.</p>}
            {suggested.items.map((s, i) => (
              <div key={i} className="text-sm border border-line rounded-md p-2 flex gap-2 items-start">
                <div className="grow">
                  {s.code && <b>{s.code} </b>}
                  {s.expectation}
                  <p className="text-xs text-muted">{s.coverageLimitations}</p>
                </div>
                <Button size="sm" onClick={() => { commit([...items, s]); setSuggested({ ...suggested, items: suggested.items.filter((_, j) => j !== i) }); }}>
                  Add
                </Button>
              </div>
            ))}
          </Card>
        )}
        <ErrorText error={error} />
      </div>
      <aside className="flex flex-col gap-4">
        <Card className="p-4 flex flex-col gap-2">
          <h2 className="font-display text-lg font-semibold">Curriculum documents</h2>
          {docs.length === 0 && <p className="text-sm text-muted">None added.</p>}
          {docs.map((d) => (
            <div key={d.id} className="text-sm border border-line rounded-md p-2 flex flex-col gap-1">
              <b>{d.title}</b>
              <span className="text-xs text-muted">
                {[d.jurisdiction, d.version].filter(Boolean).join(" · ") || "No jurisdiction or version recorded"} · {d.chars.toLocaleString()} characters
              </span>
              <div className="flex gap-2">
                {canGenerate && (
                  <Button size="sm" onClick={() => void suggest(d.id)} disabled={busy !== null}>
                    {busy === "suggest" ? <span className="cs-pulse">Matching…</span> : "Suggest mappings"}
                  </Button>
                )}
                <Button size="sm" variant="danger" onClick={() => void removeDoc(d.id)}>
                  Remove
                </Button>
              </div>
            </div>
          ))}
        </Card>
        <Card className="p-4">
          <form onSubmit={addDoc} className="flex flex-col gap-2">
            <h2 className="font-display text-lg font-semibold">Add a curriculum document</h2>
            <label className="text-sm font-semibold flex flex-col gap-1">
              Title
              <input className="field-input font-normal" required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
            </label>
            <div className="grid grid-cols-2 gap-2">
              <label className="text-sm font-semibold flex flex-col gap-1">
                Jurisdiction
                <input className="field-input font-normal" value={form.jurisdiction} onChange={(e) => setForm({ ...form, jurisdiction: e.target.value })} />
              </label>
              <label className="text-sm font-semibold flex flex-col gap-1">
                Version or year
                <input className="field-input font-normal" value={form.version} onChange={(e) => setForm({ ...form, version: e.target.value })} />
              </label>
            </div>
            <label className="text-sm font-semibold flex flex-col gap-1">
              Paste the relevant text
              <textarea className="field-input font-normal" rows={6} value={form.text} onChange={(e) => setForm({ ...form, text: e.target.value })} disabled={Boolean(file)} />
            </label>
            <label className="text-sm font-semibold flex flex-col gap-1">
              …or upload a .txt / .md file
              <input type="file" accept=".txt,.md,text/plain,text/markdown" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
            </label>
            <Button type="submit" disabled={busy !== null}>
              Add document
            </Button>
          </form>
        </Card>
      </aside>
    </div>
  );
}
