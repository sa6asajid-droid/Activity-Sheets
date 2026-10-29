"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { useDocument } from "@/lib/client/useDocument";
import type { WorksheetDocument } from "@/lib/schema/document";
import { renderWorksheetHtml, type Variant } from "@/lib/render/worksheet";
import { activityNumbers } from "@/lib/render/worksheet";
import * as ops from "@/lib/client/docOps";
import { api } from "@/lib/client/api";
import { Badge, Button, ErrorText } from "./ui";
import { Inspector } from "./Inspector";
import { RegenerateProposal } from "./RegenerateProposal";
import type { JobSummary } from "./JobProgress";
import type { MeasuredPage } from "@/lib/quality/checks";
import { stripInline } from "@/lib/text";

type DocState = ReturnType<typeof useDocument>;

const KIND_LABEL: Record<string, string> = {
  hook: "Hook",
  prediction: "Predict",
  explanation: "Explanation",
  vocabulary: "Key words",
  diagram: "Figure",
  activity: "Activity",
  investigation: "Investigation",
  discussion: "Discussion",
  recall: "Recall",
  reflection: "Reflection",
  "next-question": "Next question",
  safety: "Safety",
  note: "Note",
};

const SAVE_LABEL: Record<string, string> = { saved: "All changes saved", pending: "Unsaved changes…", saving: "Saving…", error: "Not saved", conflict: "Changed elsewhere" };

function sectionLabel(doc: WorksheetDocument, id: string, nums: Map<string, number>) {
  const s = doc.sections.find((x) => x.id === id)!;
  if (s.activityId) {
    const a = doc.activities.find((x) => x.id === s.activityId);
    return `${nums.get(s.activityId) ?? ""}. ${stripInline(a?.title ?? "Activity")}`;
  }
  if (s.diagramId) return stripInline(doc.diagrams.find((d) => d.id === s.diagramId)?.caption ?? "Figure").slice(0, 60);
  return stripInline(s.heading || s.body).slice(0, 60) || KIND_LABEL[s.kind];
}

export function Editor({ projectId, state, regenerate, reload, canGenerate }: { projectId: string; state: DocState; regenerate: (JobSummary & { proposal: unknown }) | null; reload: () => Promise<void>; canGenerate: boolean }) {
  const doc = state.doc!;
  const { setDoc, setMeasured } = state;
  const [selected, setSelected] = useState<string | null>(null);
  const [selectedLabel, setSelectedLabel] = useState<string | null>(null);
  const [variant, setVariant] = useState<Variant>("student");
  const [zoom, setZoom] = useState(0.8);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [html, setHtml] = useState("");
  const scrollY = useRef(0);
  const [measured, setLocalMeasured] = useState<MeasuredPage[]>([]);
  const nums = useMemo(() => activityNumbers(doc), [doc]);

  // Re-render the preview shortly after edits stop, keeping the scroll position.
  useEffect(() => {
    const t = setTimeout(() => {
      setHtml(
        renderWorksheetHtml(doc, {
          variant,
          fontSrc: (f) => `${window.location.origin}/fonts/${f}`,
          interactive: true,
          selectedSectionId: selected ?? undefined,
          initialScroll: scrollY.current,
          zoom,
          draftLabel: variant === "student" ? undefined : "DRAFT",
        }),
      );
    }, 250);
    return () => clearTimeout(t);
  }, [doc, variant, selected, zoom]);

  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      const d = e.data as { type?: string; section?: string | null; element?: string | null; pages?: MeasuredPage[]; y?: number };
      if (!d || typeof d !== "object") return;
      if (d.type === "cs-select" && d.section && d.section !== "__title" && d.section !== "__refs") {
        setSelected(d.section);
        setSelectedLabel(d.element ?? null);
      }
      if (d.type === "cs-select" && d.section === "__title") setSelected(null);
      if (d.type === "cs-scroll" && typeof d.y === "number") scrollY.current = d.y;
      if (d.type === "cs-measure" && Array.isArray(d.pages)) {
        setLocalMeasured(d.pages);
        // Only full-document student measurements feed the checks.
        if (variant === "student") setMeasured(d.pages);
      }
    };
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, [variant, setMeasured]);

  // Keyboard shortcuts for undo/redo.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT")) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) state.redo();
        else state.undo();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [state]);

  const reflow = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await api<{ sections: { id: string; page: number }[] }>(`/api/projects/${projectId}/relayout`, { method: "POST", json: { doc } });
      setDoc((d) => ops.applyPages(d, r.sections));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }, [doc, projectId, setDoc]);

  async function snapshot() {
    const label = window.prompt("Name this revision:", "Saved revision");
    if (label === null) return;
    await state.flush();
    try {
      await api(`/api/projects/${projectId}/revisions`, { method: "POST", json: { label } });
      await reload();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  const pages = ops.studentPageCount(doc);
  const overflow = measured.filter((p) => p.overflowPx > 1 && p.kind === "Student");
  const proposal = regenerate?.proposal ?? null;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2 bg-card border border-line rounded-lg px-3 py-2" role="toolbar" aria-label="Editor">
        <Button size="sm" onClick={state.undo} disabled={!state.canUndo} title="Undo (Ctrl+Z)">
          Undo
        </Button>
        <Button size="sm" onClick={state.redo} disabled={!state.canRedo} title="Redo (Ctrl+Shift+Z)">
          Redo
        </Button>
        <span className={`text-sm ${state.saveState === "error" || state.saveState === "conflict" ? "text-bad font-semibold" : "text-muted"}`} aria-live="polite">
          {SAVE_LABEL[state.saveState]}
        </span>
        <Button size="sm" onClick={snapshot}>
          Save revision
        </Button>
        <span className="mx-1 h-5 w-px bg-line" aria-hidden="true" />
        <label className="text-sm flex items-center gap-1">
          Show
          <select className="field-input !w-auto !py-1" value={variant} onChange={(e) => setVariant(e.target.value as Variant)}>
            <option value="student">Student pages</option>
            <option value="answer-key">Answer key</option>
            <option value="teacher-notes">Teacher notes</option>
          </select>
        </label>
        <label className="text-sm flex items-center gap-1">
          Zoom
          <select className="field-input !w-auto !py-1" value={zoom} onChange={(e) => setZoom(Number(e.target.value))}>
            <option value={0.6}>60%</option>
            <option value={0.8}>80%</option>
            <option value={1}>100%</option>
            <option value={1.25}>125%</option>
          </select>
        </label>
        <Button size="sm" onClick={reflow} disabled={busy} title="Measure every section and place sections on pages again">
          Reflow pages
        </Button>
        <span className="ml-auto text-sm text-muted">
          {pages} student page{pages > 1 ? "s" : ""} (target {doc.format.targetStudentPages})
        </span>
        {overflow.length > 0 && <Badge tone="blocking">Overflow on page {overflow.map((o) => o.page).join(", ")}</Badge>}
      </div>
      {state.saveError && <ErrorText error={state.saveError} />}
      <ErrorText error={error} />
      {pages > doc.format.targetStudentPages && (
        <p className="text-sm text-warn" role="status">
          The content uses more pages than the format allows. Options: add a page (change the format in Document settings), shorten selected text, hide an optional section, or regenerate a section shorter. Text is never shrunk below the minimum size.
        </p>
      )}
      {proposal ? <RegenerateProposal projectId={projectId} jobId={regenerate!.id} proposal={proposal as never} onDone={reload} /> : null}

      <div className="grid gap-3 xl:grid-cols-[260px_minmax(0,1fr)_380px] lg:grid-cols-[240px_minmax(0,1fr)]">
        <nav aria-label="Document structure" className="bg-card border border-line rounded-lg p-2 max-h-[78vh] overflow-auto text-sm">
          <button className={`w-full text-left px-2 py-1 rounded font-semibold ${selected === null ? "bg-[#eef3f7]" : "hover:bg-[#f0ece2]"}`} onClick={() => setSelected(null)}>
            Document settings
          </button>
          {Array.from({ length: pages }, (_, i) => i + 1).map((p) => {
            const m = measured.find((x) => x.page === p && x.kind === "Student");
            return (
              <div key={p} className="mt-2">
                <div className="flex items-center gap-1 px-2 text-xs uppercase tracking-wide text-muted">
                  Page {p}
                  {m && m.overflowPx > 1 && <Badge tone="blocking">overflow</Badge>}
                  <button className="ml-auto normal-case tracking-normal underline" onClick={() => setDoc((d) => ops.duplicatePage(d, p))} title={`Duplicate page ${p}`}>
                    duplicate
                  </button>
                </div>
                <ul>
                  {doc.sections
                    .filter((s) => s.page === p)
                    .map((s) => (
                      <li key={s.id} className="group flex items-center">
                        <button
                          onClick={() => setSelected(s.id)}
                          aria-current={selected === s.id ? "true" : undefined}
                          className={`grow min-w-0 text-left px-2 py-1 rounded truncate ${selected === s.id ? "bg-[#eef3f7] font-semibold" : "hover:bg-[#f0ece2]"} ${s.hidden ? "line-through text-muted" : ""}`}
                        >
                          <span className="text-xs text-muted mr-1">{KIND_LABEL[s.kind]}</span>
                          {sectionLabel(doc, s.id, nums)}
                          {s.locked && <span aria-label="locked"> 🔒</span>}
                        </button>
                        <button className="px-1 text-muted hover:text-ink" aria-label="Move up" onClick={() => setDoc((d) => ops.moveSection(d, s.id, -1))}>
                          ↑
                        </button>
                        <button className="px-1 text-muted hover:text-ink" aria-label="Move down" onClick={() => setDoc((d) => ops.moveSection(d, s.id, 1))}>
                          ↓
                        </button>
                      </li>
                    ))}
                </ul>
              </div>
            );
          })}
          <label className="mt-3 flex flex-col gap-1 px-2 text-xs">
            Add a section
            <select
              className="field-input !py-1"
              value=""
              onChange={(e) => {
                if (!e.target.value) return;
                setDoc((d) => ops.addSection(d, e.target.value as never, selected ?? undefined));
              }}
            >
              <option value="">Choose…</option>
              {Object.entries(KIND_LABEL)
                .filter(([k]) => k !== "diagram")
                .map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
            </select>
          </label>
        </nav>

        <div className="bg-[#e9e7e2] border border-line rounded-lg overflow-hidden min-h-[78vh]">
          <iframe title="Worksheet preview" className="w-full h-[78vh] bg-[#e9e7e2]" sandbox="allow-scripts" srcDoc={html} />
        </div>

        <div className="lg:col-span-2 xl:col-span-1 max-h-[78vh] overflow-auto">
          <Inspector projectId={projectId} doc={doc} setDoc={setDoc} selected={selected} selectedLabel={selectedLabel} onSelect={setSelected} canGenerate={canGenerate} onRegenerated={reload} />
        </div>
      </div>
    </div>
  );
}
