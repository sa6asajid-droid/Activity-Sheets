"use client";
import { useCallback, useEffect, useState } from "react";
import { api, download } from "@/lib/client/api";
import { Button, Card, ErrorText, Notice } from "@/components/ui";

interface Workbook {
  id: string;
  title: string;
  projectIds: string[];
  settings: { cumulativeReview: boolean; includeAnswerKey: boolean };
}
interface ProjectLite {
  id: string;
  title: string;
  status: string;
}

export default function Workbooks() {
  const [books, setBooks] = useState<Workbook[]>([]);
  const [projects, setProjects] = useState<ProjectLite[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [w, p] = await Promise.all([api<{ workbooks: Workbook[] }>("/api/workbooks"), api<{ projects: ProjectLite[] }>("/api/projects")]);
      setBooks(w.workbooks);
      setProjects(p.projects);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  const title = (id: string) => projects.find((p) => p.id === id)?.title ?? "(deleted worksheet)";
  const status = (id: string) => projects.find((p) => p.id === id)?.status ?? "";

  async function patch(w: Workbook, change: Partial<Workbook>) {
    await api(`/api/workbooks/${w.id}`, { method: "PATCH", json: change });
    await load();
  }
  async function create() {
    const t = window.prompt("Workbook title:", "New workbook");
    if (!t) return;
    await api("/api/workbooks", { method: "POST", json: { title: t, projectIds: [] } });
    await load();
  }
  async function compile(w: Workbook, allowDraft: boolean) {
    setBusy(w.id);
    setError(null);
    setMsg(null);
    try {
      const r = await download(`/api/workbooks/${w.id}/compile`, { allowDraft });
      setMsg(r.notes ? `Compiled. ${r.notes}` : "Compiled.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-col gap-5 max-w-4xl">
      <div className="flex items-end gap-3">
        <div className="mr-auto">
          <h1 className="font-display text-3xl font-semibold">Workbooks</h1>
          <p className="text-sm text-muted">Combine worksheets into one PDF, with an optional cumulative review section and answer keys.</p>
        </div>
        <Button variant="primary" onClick={create}>
          New workbook
        </Button>
      </div>
      <ErrorText error={error} />
      {msg && <Notice tone="ok">{msg}</Notice>}
      {books.length === 0 && <p className="text-muted">No workbooks yet. Select worksheets on the Worksheets page and choose “Make workbook”, or create one here.</p>}
      {books.map((w) => (
        <Card key={w.id} className="p-4 flex flex-col gap-3">
          <div className="flex flex-wrap gap-2 items-center">
            <input className="field-input font-display text-lg !w-auto grow" aria-label="Workbook title" defaultValue={w.title} onBlur={(e) => e.target.value !== w.title && void patch(w, { title: e.target.value })} />
            <Button size="sm" variant="danger" onClick={async () => { if (window.confirm("Delete this workbook? The worksheets are not deleted.")) { await api(`/api/workbooks/${w.id}`, { method: "DELETE" }); await load(); } }}>
              Delete
            </Button>
          </div>
          <ol className="flex flex-col gap-1 text-sm">
            {w.projectIds.map((pid, i) => (
              <li key={pid + i} className="flex items-center gap-2">
                <span className="w-6 text-muted">{i + 1}.</span>
                <span className="grow">{title(pid)}</span>
                <span className="text-xs text-muted">{status(pid)}</span>
                <Button size="sm" variant="ghost" aria-label="Move up" disabled={i === 0} onClick={() => { const ids = [...w.projectIds]; [ids[i - 1], ids[i]] = [ids[i], ids[i - 1]]; void patch(w, { projectIds: ids }); }}>
                  ↑
                </Button>
                <Button size="sm" variant="ghost" aria-label="Move down" disabled={i === w.projectIds.length - 1} onClick={() => { const ids = [...w.projectIds]; [ids[i + 1], ids[i]] = [ids[i], ids[i + 1]]; void patch(w, { projectIds: ids }); }}>
                  ↓
                </Button>
                <Button size="sm" variant="ghost" onClick={() => void patch(w, { projectIds: w.projectIds.filter((_, j) => j !== i) })}>
                  Remove
                </Button>
              </li>
            ))}
          </ol>
          <label className="text-sm flex items-center gap-2">
            Add worksheet
            <select className="field-input !w-auto" value="" onChange={(e) => e.target.value && void patch(w, { projectIds: [...w.projectIds, e.target.value] })}>
              <option value="">Choose…</option>
              {projects.filter((p) => !w.projectIds.includes(p.id)).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.title}
                </option>
              ))}
            </select>
          </label>
          <div className="flex flex-wrap gap-4 text-sm">
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={w.settings.cumulativeReview} onChange={(e) => void patch(w, { settings: { ...w.settings, cumulativeReview: e.target.checked } })} /> Cumulative review pages (revisit earlier worksheets)
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={w.settings.includeAnswerKey} onChange={(e) => void patch(w, { settings: { ...w.settings, includeAnswerKey: e.target.checked } })} /> Include answer keys at the back
            </label>
          </div>
          <div className="flex gap-2">
            <Button variant="primary" disabled={busy !== null || !w.projectIds.length} onClick={() => void compile(w, false)}>
              {busy === w.id ? <span className="cs-pulse">Compiling…</span> : "Compile approved worksheets"}
            </Button>
            <Button disabled={busy !== null || !w.projectIds.length} onClick={() => void compile(w, true)}>
              Compile including drafts
            </Button>
          </div>
        </Card>
      ))}
    </div>
  );
}
