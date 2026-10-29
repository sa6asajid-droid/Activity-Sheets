"use client";
import { useState } from "react";
import { api } from "@/lib/client/api";
import type { ProjectRow } from "@/lib/db/store";
import { Button, Card, ErrorText, Notice } from "./ui";

/** Add and manage the editor's own sources (pasted text, text files, web pages). */
export function SourcesPanel({ project, onChange, onStartPlan, demoOnly }: { project: ProjectRow; onChange: () => void; onStartPlan: () => Promise<void>; demoOnly: boolean }) {
  const [mode, setMode] = useState<"pasted" | "url" | "upload">("pasted");
  const [title, setTitle] = useState("");
  const [author, setAuthor] = useState("");
  const [text, setText] = useState("");
  const [url, setUrl] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sources = project.settings.userSources ?? [];

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (mode === "upload") {
        if (!file) throw new Error("Choose a file.");
        const fd = new FormData();
        fd.set("file", file);
        fd.set("title", title);
        fd.set("author", author);
        const res = await fetch(`/api/projects/${project.id}/sources`, { method: "POST", body: fd });
        if (!res.ok) throw new Error((await res.json()).error ?? "Upload failed");
      } else {
        await api(`/api/projects/${project.id}/sources`, { method: "POST", json: mode === "url" ? { kind: "url", url, title, author } : { kind: "pasted", title, author, text } });
      }
      setTitle("");
      setAuthor("");
      setText("");
      setUrl("");
      setFile(null);
      onChange();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    await api(`/api/projects/${project.id}/sources/${id}`, { method: "DELETE" });
    onChange();
  }

  async function setContentMode(m: string) {
    await api(`/api/projects/${project.id}`, { method: "PATCH", json: { settings: { contentMode: m } } });
    onChange();
  }

  return (
    <div className="grid lg:grid-cols-[1fr_380px] gap-5 items-start">
      <div className="flex flex-col gap-4">
        <Card className="p-4 flex flex-col gap-2">
          <label className="text-sm font-semibold flex flex-col gap-1 max-w-sm">
            Where facts come from
            <select className="field-input font-normal" value={project.settings.contentMode} onChange={(e) => void setContentMode(e.target.value)}>
              <option value="research">Web research</option>
              <option value="user-sources">Only my sources</option>
              <option value="mixed">My sources plus web research</option>
              <option value="unverified-draft">Unverified draft (no sources)</option>
            </select>
          </label>
          <p className="text-xs text-muted">
            Sources are treated as data, never as instructions. Only plain text is kept. Being able to read a source does not mean you may reproduce its images or long passages — record the licence below.
          </p>
        </Card>
        <Card className="p-4">
          <h2 className="font-display text-xl font-semibold mb-2">Your sources ({sources.length})</h2>
          {sources.length === 0 && <p className="text-sm text-muted">None yet.</p>}
          <ul className="flex flex-col gap-2">
            {sources.map((s) => (
              <li key={s.id} className="flex gap-2 items-start text-sm border border-line rounded-md p-2">
                <div className="grow">
                  <b>{s.title}</b> {s.authorOrOrganization && <span className="text-muted">— {s.authorOrOrganization}</span>}
                  <p className="text-xs text-muted">
                    {s.kind === "url" ? s.url : s.kind} · {s.chars.toLocaleString()} characters · licence: {s.licenceStatus} · added {new Date(s.addedAt).toLocaleDateString()}
                  </p>
                </div>
                <Button size="sm" variant="danger" onClick={() => void remove(s.id)} aria-label={`Delete source ${s.title}`}>
                  Delete
                </Button>
              </li>
            ))}
          </ul>
        </Card>
      </div>
      <Card className="p-4">
        <form onSubmit={add} className="flex flex-col gap-3">
          <h2 className="font-display text-lg font-semibold">Add a source</h2>
          <div role="radiogroup" aria-label="Source type" className="flex gap-1">
            {(["pasted", "url", "upload"] as const).map((m) => (
              <button type="button" key={m} role="radio" aria-checked={mode === m} onClick={() => setMode(m)} className={`px-2.5 py-1 rounded-md text-sm font-semibold border ${mode === m ? "border-accent bg-[#eef3f7]" : "border-line"}`}>
                {m === "pasted" ? "Paste text" : m === "url" ? "Web page" : "Text file"}
              </button>
            ))}
          </div>
          <label className="text-sm font-semibold flex flex-col gap-1">
            Title
            <input className="field-input font-normal" value={title} onChange={(e) => setTitle(e.target.value)} required={mode === "pasted"} />
          </label>
          <label className="text-sm font-semibold flex flex-col gap-1">
            Author or organization
            <input className="field-input font-normal" value={author} onChange={(e) => setAuthor(e.target.value)} />
          </label>
          {mode === "pasted" && (
            <label className="text-sm font-semibold flex flex-col gap-1">
              Text
              <textarea className="field-input font-normal" rows={8} value={text} onChange={(e) => setText(e.target.value)} required />
            </label>
          )}
          {mode === "url" && (
            <div className="flex flex-col gap-1">
              <label className="text-sm font-semibold flex flex-col gap-1">
                URL
                <input className="field-input font-normal" type="url" value={url} onChange={(e) => setUrl(e.target.value)} required placeholder="https://" aria-describedby="url-hint" />
              </label>
              <span id="url-hint" className="text-xs text-muted">Only public http(s) pages; private and local addresses are blocked.</span>
            </div>
          )}
          {mode === "upload" && (
            <label className="text-sm font-semibold flex flex-col gap-1">
              File (.txt, .md, .html — up to 2 MB)
              <input type="file" accept=".txt,.md,.html,.htm,text/plain,text/markdown,text/html" onChange={(e) => setFile(e.target.files?.[0] ?? null)} required />
            </label>
          )}
          <ErrorText error={error} />
          <Button type="submit" disabled={busy}>
            {busy ? "Adding…" : "Add source"}
          </Button>
        </form>
        <hr className="my-4 border-line" />
        {demoOnly ? (
          <Notice tone="warning">Demo mode: planning needs an AI provider.</Notice>
        ) : (
          <Button variant="primary" onClick={() => void onStartPlan()} disabled={(project.settings.contentMode === "user-sources" && sources.length === 0) || busy}>
            Plan with these sources
          </Button>
        )}
      </Card>
    </div>
  );
}
