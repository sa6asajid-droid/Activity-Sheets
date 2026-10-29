"use client";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "@/lib/client/api";
import { Badge, Button, Card, ErrorText } from "@/components/ui";

interface Row {
  id: string;
  title: string;
  question: string;
  status: string;
  folder: string;
  archived: boolean;
  isSample: boolean;
  updatedAt: string;
  hasDraft: boolean;
  audience: { ageMin: number; ageMax: number; readingDemand: string };
  format: { kind: string; targetStudentPages: number };
}

const STATUS_LABEL: Record<string, string> = { draft: "Draft", "needs-review": "Needs review", approved: "Approved", exported: "Exported" };

export default function Dashboard() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [folders, setFolders] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [folder, setFolder] = useState("");
  const [archived, setArchived] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string[]>([]);

  const load = useCallback(async () => {
    const q = new URLSearchParams();
    if (search) q.set("search", search);
    if (status) q.set("status", status);
    if (folder) q.set("folder", folder);
    if (archived) q.set("archived", "1");
    try {
      const r = await api<{ projects: Row[]; folders: string[] }>(`/api/projects?${q}`);
      setRows(r.projects);
      setFolders(r.folders);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [search, status, folder, archived]);

  useEffect(() => {
    const t = setTimeout(load, 200);
    return () => clearTimeout(t);
  }, [load]);

  const grouped = useMemo(() => {
    const g = new Map<string, Row[]>();
    for (const r of rows ?? []) {
      const k = r.folder || "Unfiled";
      g.set(k, [...(g.get(k) ?? []), r]);
    }
    return [...g.entries()].sort((a, b) => (a[0] === "Demo samples" ? 1 : b[0] === "Demo samples" ? -1 : a[0].localeCompare(b[0])));
  }, [rows]);

  async function act(id: string, action: "duplicate" | "archive" | "unarchive" | "folder") {
    try {
      if (action === "duplicate") await api(`/api/projects/${id}/duplicate`, { method: "POST", json: {} });
      if (action === "archive" || action === "unarchive") await api(`/api/projects/${id}`, { method: "PATCH", json: { archived: action === "archive" } });
      if (action === "folder") {
        const name = window.prompt("Move to folder (leave empty for Unfiled):", "");
        if (name === null) return;
        await api(`/api/projects/${id}`, { method: "PATCH", json: { folder: name.trim() } });
      }
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function makeWorkbook() {
    const title = window.prompt("Workbook title:", "My workbook");
    if (!title) return;
    try {
      await api("/api/workbooks", { method: "POST", json: { title, projectIds: selected } });
      window.location.href = "/workbooks";
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end gap-3">
        <div className="mr-auto">
          <h1 className="font-display text-3xl font-semibold">Worksheets</h1>
          <p className="text-muted text-sm">Start from a question. Review the plan, edit the pages, check, then export.</p>
        </div>
        <Link href="/new" className="inline-flex items-center rounded-md bg-accent px-4 py-2 font-semibold text-accent-ink hover:bg-[#174a6c]">
          New worksheet
        </Link>
      </div>

      <Card className="p-3 flex flex-wrap gap-3 items-end" as="div">
        <label className="flex flex-col text-sm font-semibold gap-1 grow min-w-[220px]">
          Search
          <input className="field-input font-normal" type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Title or question" />
        </label>
        <label className="flex flex-col text-sm font-semibold gap-1">
          Status
          <select className="field-input font-normal" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">All</option>
            {Object.entries(STATUS_LABEL).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col text-sm font-semibold gap-1">
          Folder
          <select className="field-input font-normal" value={folder} onChange={(e) => setFolder(e.target.value)}>
            <option value="">All</option>
            {folders.map((f) => (
              <option key={f}>{f}</option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2 text-sm pb-2">
          <input type="checkbox" checked={archived} onChange={(e) => setArchived(e.target.checked)} /> Show archived
        </label>
        <Button disabled={selected.length === 0} onClick={makeWorkbook} title="Combine the selected worksheets into a workbook">
          Make workbook ({selected.length})
        </Button>
      </Card>

      <ErrorText error={error} />
      {rows === null && <p className="text-muted cs-pulse">Loading worksheets…</p>}
      {rows?.length === 0 && <p className="text-muted">No worksheets match. Try clearing the filters, or start a new worksheet.</p>}

      {grouped.map(([name, list]) => (
        <section key={name} aria-labelledby={`f-${name}`}>
          <h2 id={`f-${name}`} className="font-display text-xl font-semibold mb-2">
            {name}
            {name === "Demo samples" && <span className="ml-2 font-sans text-sm font-normal text-muted">Drafted examples — not reviewed or source-checked</span>}
          </h2>
          <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {list.map((r) => (
              <li key={r.id}>
                <Card className={`p-4 h-full flex flex-col gap-2 ${r.archived ? "opacity-60" : ""}`} as="article">
                  <div className="flex items-start gap-2">
                    <input
                      type="checkbox"
                      aria-label={`Select ${r.title} for a workbook`}
                      className="mt-1.5"
                      checked={selected.includes(r.id)}
                      onChange={(e) => setSelected((s) => (e.target.checked ? [...s, r.id] : s.filter((x) => x !== r.id)))}
                    />
                    <div className="min-w-0">
                      <Link href={`/projects/${r.id}`} className="font-display text-lg font-semibold leading-snug hover:underline">
                        {r.title}
                      </Link>
                      {r.title !== r.question && <p className="text-sm text-muted">{r.question}</p>}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1.5 items-center text-xs text-muted">
                    <Badge tone={r.status}>{STATUS_LABEL[r.status] ?? r.status}</Badge>
                    {r.isSample && <Badge tone="info">Sample</Badge>}
                    {r.archived && <Badge tone="draft">Archived</Badge>}
                    <span>
                      Ages {r.audience.ageMin}–{r.audience.ageMax} · {r.audience.readingDemand} reading · {r.format.targetStudentPages} p
                    </span>
                  </div>
                  <p className="text-xs text-muted">Updated {new Date(r.updatedAt).toLocaleString()}</p>
                  <div className="mt-auto flex flex-wrap gap-1.5 pt-1">
                    <Link href={`/projects/${r.id}`} className="rounded-md border border-line px-2.5 py-1 text-sm font-semibold hover:bg-[#f0ece2]">
                      Open
                    </Link>
                    <Button size="sm" onClick={() => act(r.id, "duplicate")}>
                      Duplicate
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => act(r.id, "folder")}>
                      Move
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => act(r.id, r.archived ? "unarchive" : "archive")}>
                      {r.archived ? "Restore" : "Archive"}
                    </Button>
                  </div>
                </Card>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
