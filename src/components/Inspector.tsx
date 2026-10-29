"use client";
import { useId, useMemo, useState } from "react";
import type { Activity, AnswerKeyEntry, Diagram, Section, WorksheetDocument } from "@/lib/schema/document";
import { DiagramSpecSchema } from "@/lib/schema/diagram";
import { compileDiagram } from "@/lib/diagrams/compile";
import * as ops from "@/lib/client/docOps";
import { api } from "@/lib/client/api";
import { Badge, Button, Card, ErrorText, Notice } from "./ui";

type SetDoc = (u: (d: WorksheetDocument) => WorksheetDocument) => void;

const lines = (s: string) => s.split("\n").map((x) => x.trim()).filter(Boolean);

function T({ label, value, onChange, rows = 1, disabled, hint }: { label: string; value: string; onChange: (v: string) => void; rows?: number; disabled?: boolean; hint?: string }) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm font-semibold">
        {label}
      </label>
      {rows > 1 ? (
        <textarea id={id} aria-describedby={hintId} className="field-input" rows={rows} value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)} />
      ) : (
        <input id={id} aria-describedby={hintId} className="field-input" value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)} />
      )}
      {hint && (
        <span id={hintId} className="text-xs text-muted">
          {hint}
        </span>
      )}
    </div>
  );
}

function Check({ label, checked, onChange, disabled }: { label: string; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <label className="flex items-center gap-2 text-sm">
      <input type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} /> {label}
    </label>
  );
}

const MARKUP_HINT = "Markup: **bold**, _italic_, [[key term]]. Blank line = new paragraph; “- ” = bullet.";

export function Inspector(props: { projectId: string; doc: WorksheetDocument; setDoc: SetDoc; selected: string | null; selectedLabel: string | null; onSelect: (id: string | null) => void; canGenerate: boolean; onRegenerated: () => Promise<void> }) {
  const { doc, setDoc, selected } = props;
  const section = doc.sections.find((s) => s.id === selected);
  if (!section) return <DocumentSettings doc={doc} setDoc={setDoc} />;
  const locked = section.locked;
  const upd = (patch: Partial<Section>) => setDoc((d) => ops.updateSection(d, section.id, patch));
  const activity = section.activityId ? doc.activities.find((a) => a.id === section.activityId) : undefined;
  const diagramId = section.diagramId ?? activity?.diagramId;
  const diagram = diagramId ? doc.diagrams.find((d) => d.id === diagramId) : undefined;

  return (
    <div className="flex flex-col gap-3">
      <Card className="p-3 flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <h2 className="font-display text-lg font-semibold mr-auto">Section</h2>
          <Badge tone="draft">{section.kind}</Badge>
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-1">
          <Check label="Locked" checked={section.locked} onChange={(v) => upd({ locked: v })} />
          <Check label="Hidden" checked={section.hidden} disabled={locked} onChange={(v) => upd({ hidden: v })} />
          <Check label="Optional" checked={section.optional} disabled={locked} onChange={(v) => upd({ optional: v })} />
          <Check label="Keep with next" checked={section.keepWithNext} disabled={locked} onChange={(v) => upd({ keepWithNext: v })} />
        </div>
        {locked && <Notice>Locked: content cannot be edited or regenerated until unlocked.</Notice>}
        <div className="flex flex-wrap items-end gap-2">
          <label className="text-sm font-semibold flex flex-col gap-1">
            Page
            <input type="number" min={1} max={40} className="field-input !w-20 font-normal" value={section.page} onChange={(e) => setDoc((d) => ops.setPage(d, section.id, Number(e.target.value)))} />
          </label>
          <Button size="sm" disabled={locked} onClick={() => setDoc((d) => ops.duplicateSection(d, section.id))}>
            Duplicate
          </Button>
          <Button
            size="sm"
            variant="danger"
            disabled={locked}
            onClick={() => {
              if (window.confirm("Delete this section? You can undo.")) {
                setDoc((d) => ops.removeSection(d, section.id));
                props.onSelect(null);
              }
            }}
          >
            Delete
          </Button>
        </div>
        {section.kind !== "activity" && section.kind !== "next-question" && <T label="Heading" value={section.heading} disabled={locked} onChange={(v) => upd({ heading: v })} />}
        {section.kind !== "activity" && <T label="Text" value={section.body} rows={section.kind === "explanation" ? 10 : 4} disabled={locked} onChange={(v) => upd({ body: v })} hint={MARKUP_HINT} />}
        {section.kind === "explanation" && doc.sections.find((s) => s.kind === "explanation")?.id === section.id && (
          <T label="The short answer (shown in the highlighted box)" value={doc.directAnswer} rows={3} disabled={locked} onChange={(v) => setDoc((d) => ({ ...d, directAnswer: v }))} />
        )}
        {section.kind === "vocabulary" && (
          <T
            label="Terms (one per line: term — definition)"
            rows={5}
            disabled={locked}
            value={section.terms.map((t) => `${t.term} — ${t.definition}`).join("\n")}
            onChange={(v) =>
              upd({
                terms: lines(v)
                  .slice(0, 12)
                  .map((l) => {
                    const [term, ...rest] = l.split(/\s+[—-]\s+/);
                    return { term: term.slice(0, 60), definition: rest.join(" — ").slice(0, 400) };
                  }),
              })
            }
          />
        )}
      </Card>
      {activity && <ActivityEditor key={activity.id} doc={doc} setDoc={setDoc} activity={activity} locked={locked} />}
      {diagram && <DiagramEditor key={diagram.id} doc={doc} setDoc={setDoc} diagram={diagram} locked={locked} focusLabel={props.selectedLabel} />}
      <RegenerateBox projectId={props.projectId} section={section} canGenerate={props.canGenerate} onDone={props.onRegenerated} />
    </div>
  );
}

// ---------------------------------------------------------------- activity

function ActivityEditor({ doc, setDoc, activity: a, locked }: { doc: WorksheetDocument; setDoc: SetDoc; activity: Activity; locked: boolean }) {
  const key = doc.answerKey.find((k) => k.id === a.answerKeyId);
  const ua = (patch: Partial<Activity>) => setDoc((d) => ops.updateActivity(d, a.id, patch));
  const uk = (patch: Partial<AnswerKeyEntry>) => key && setDoc((d) => ops.updateAnswer(d, key.id, patch));
  const item = (i: number, patch: Partial<Activity["items"][number]>) => ua({ items: a.items.map((it, j) => (j === i ? { ...it, ...patch } : it)) });
  return (
    <>
      <Card className="p-3 flex flex-col gap-2">
        <h2 className="font-display text-lg font-semibold">Activity</h2>
        <p className="text-xs text-muted">
          {a.type} · objective: {a.objectiveIds.map((o) => doc.learningPlan.objectives.find((x) => x.id === o)?.text ?? o).join("; ")}
        </p>
        <T label="Title" value={a.title} disabled={locked} onChange={(v) => ua({ title: v })} />
        <T label="Instructions" rows={3} value={a.instructions} disabled={locked} onChange={(v) => ua({ instructions: v })} hint={MARKUP_HINT} />
        <div className="grid gap-2">
          <label className="text-sm font-semibold flex flex-col gap-1">
            Support level
            <select className="field-input font-normal" disabled={locked} value={a.supportLevel} onChange={(e) => ua({ supportLevel: e.target.value as Activity["supportLevel"] })}>
              <option value="more-support">More support</option>
              <option value="standard">Standard</option>
              <option value="extension">Extension</option>
            </select>
          </label>
          <fieldset className="text-sm flex flex-col gap-1">
            <legend className="font-semibold">Objectives assessed</legend>
            {doc.learningPlan.objectives.map((o) => (
              <label key={o.id} className="flex items-start gap-1.5">
                <input
                  type="checkbox"
                  disabled={locked || (a.objectiveIds.length === 1 && a.objectiveIds[0] === o.id)}
                  checked={a.objectiveIds.includes(o.id)}
                  onChange={(e) => ua({ objectiveIds: e.target.checked ? [...a.objectiveIds, o.id] : a.objectiveIds.filter((x) => x !== o.id) })}
                />
                <span>{o.text}</span>
              </label>
            ))}
          </fieldset>
        </div>
        <fieldset className="flex flex-col gap-2">
          <legend className="text-sm font-semibold">Items</legend>
          {a.items.map((it, i) => (
            <div key={it.id} className="border border-line rounded-md p-2 flex flex-col gap-1.5">
              <T label={`Item ${String.fromCharCode(97 + i)}`} value={it.prompt} disabled={locked} onChange={(v) => item(i, { prompt: v })} />
              <T label={a.type === "match" ? "Correct match" : "Options (one per line)"} rows={a.type === "match" ? 1 : 2} value={it.options.join("\n")} disabled={locked} onChange={(v) => item(i, { options: lines(v).slice(0, 8) })} />
              {it.givenAnswer !== undefined && <T label="Given (worked) step" value={it.givenAnswer} disabled={locked} onChange={(v) => item(i, { givenAnswer: v || undefined })} />}
              <div className="flex items-end gap-2">
                <label className="text-sm font-semibold flex flex-col gap-1">
                  Answer lines
                  <input type="number" min={0} max={20} className="field-input !w-20 font-normal" disabled={locked} value={it.answerLines} onChange={(e) => item(i, { answerLines: Number(e.target.value) })} />
                </label>
                <Button size="sm" variant="ghost" disabled={locked || a.items.length <= 1} onClick={() => ua({ items: a.items.filter((_, j) => j !== i) })}>
                  Remove item
                </Button>
              </div>
            </div>
          ))}
          <div>
            <Button size="sm" disabled={locked || a.items.length >= 16} onClick={() => ua({ items: [...a.items, { id: `i-${Date.now() % 1e6}`, prompt: "New item", options: [], answerLines: 2 }] })}>
              Add item
            </Button>
          </div>
        </fieldset>
        <T label="Word bank (comma-separated)" value={a.supportOptions.wordBank.join(", ")} disabled={locked} onChange={(v) => ua({ supportOptions: { ...a.supportOptions, wordBank: v.split(",").map((x) => x.trim()).filter(Boolean).slice(0, 16) } })} />
        <T label="Sentence starter" value={a.supportOptions.sentenceStarter ?? ""} disabled={locked} onChange={(v) => ua({ supportOptions: { ...a.supportOptions, sentenceStarter: v || undefined } })} />
        <T label="Oral alternative" value={a.supportOptions.oralAlternative ?? ""} disabled={locked} onChange={(v) => ua({ supportOptions: { ...a.supportOptions, oralAlternative: v || undefined } })} />
        <Check label="Ask learners to cover the explanation first" checked={a.coverInstruction} disabled={locked} onChange={(v) => ua({ coverInstruction: v })} />
        <Check label="Scored" checked={a.scored} disabled={locked} onChange={(v) => ua({ scored: v })} />
        {a.computations.length > 0 && <p className="text-xs text-muted">{a.computations.length} answer(s) here are checked by code on every save.</p>}
      </Card>
      {key && (
        <Card className="p-3 flex flex-col gap-2">
          <h2 className="font-display text-lg font-semibold">Answer key</h2>
          <T label="Answer or sample response" rows={3} value={key.answer} disabled={locked} onChange={(v) => uk({ answer: v })} />
          {a.items.length > 0 && (
            <fieldset className="flex flex-col gap-1">
              <legend className="text-sm font-semibold">Item answers</legend>
              {a.items.map((it, i) => {
                const cur = key.itemAnswers.find((x) => x.itemId === it.id)?.answer ?? "";
                return (
                  <label key={it.id} className="text-sm flex items-center gap-2">
                    <span className="w-6">{String.fromCharCode(97 + i)})</span>
                    <input
                      className="field-input"
                      value={cur}
                      disabled={locked}
                      onChange={(e) => uk({ itemAnswers: [...key.itemAnswers.filter((x) => x.itemId !== it.id), ...(e.target.value ? [{ itemId: it.id, answer: e.target.value }] : [])] })}
                    />
                  </label>
                );
              })}
            </fieldset>
          )}
          <T label="Why (short explanation)" rows={2} value={key.reasoning} disabled={locked} onChange={(v) => uk({ reasoning: v })} />
          <T label="Also accept (one per line)" rows={2} value={key.acceptableAlternatives.join("\n")} disabled={locked} onChange={(v) => uk({ acceptableAlternatives: lines(v) })} />
          <T
            label="Rubric (one per line: level: descriptor)"
            rows={3}
            value={key.rubric.map((r) => `${r.level}: ${r.descriptor}`).join("\n")}
            disabled={locked}
            onChange={(v) =>
              uk({
                rubric: lines(v).map((l) => {
                  const [level, ...rest] = l.split(":");
                  return { level: level.trim().slice(0, 40), descriptor: rest.join(":").trim().slice(0, 400) };
                }),
              })
            }
          />
          <T label="Common errors (one per line)" rows={2} value={key.commonErrors.join("\n")} disabled={locked} onChange={(v) => uk({ commonErrors: lines(v) })} />
        </Card>
      )}
    </>
  );
}

// ---------------------------------------------------------------- diagram

function DiagramEditor({ doc, setDoc, diagram: d, locked, focusLabel }: { doc: WorksheetDocument; setDoc: SetDoc; diagram: Diagram; locked: boolean; focusLabel: string | null }) {
  const ud = (patch: Partial<Diagram>) => setDoc((x) => ops.updateDiagram(x, d.id, patch));
  const labels = useMemo(() => {
    const g = compileDiagram(d.spec, {});
    return g.elements.filter((e): e is Extract<typeof e, { kind: "text" | "callout" }> => (e.kind === "text" || e.kind === "callout") && e.editable).map((e) => ({ id: e.id, original: e.text }));
  }, [d.spec]);
  const [specText, setSpecText] = useState(() => JSON.stringify(d.spec, null, 1));
  const [specError, setSpecError] = useState<string | null>(null);
  void doc;
  return (
    <Card className="p-3 flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <h2 className="font-display text-lg font-semibold mr-auto">Figure</h2>
        <Badge tone={d.reviewStatus === "accepted" ? "ok" : "warning"}>{d.reviewStatus}</Badge>
      </div>
      <p className="text-xs text-muted">
        {d.spec.type} · {d.provenance.note}
      </p>
      <T label="Caption" value={d.caption} disabled={locked} onChange={(v) => ud({ caption: v })} />
      <T label="Alternative text (one sentence)" value={d.altText} disabled={locked} onChange={(v) => ud({ altText: v })} />
      <T label="Long description" rows={4} value={d.longDescription} disabled={locked} onChange={(v) => ud({ longDescription: v })} hint="Conveys the same information for learners who cannot see the figure." />
      <T label="What understanding would be lost without it?" value={d.lossIfRemoved} disabled={locked} onChange={(v) => ud({ lossIfRemoved: v })} />
      <label className="text-sm font-semibold flex flex-col gap-1">
        Width: {d.widthPct}%
        <input type="range" min={30} max={100} step={5} value={d.widthPct} disabled={locked} onChange={(e) => ud({ widthPct: Number(e.target.value) })} />
      </label>
      <Check label="Decorative only (optional, carries no information)" checked={d.decorative} disabled={locked} onChange={(v) => ud({ decorative: v })} />
      {labels.length > 0 && (
        <fieldset className="flex flex-col gap-1">
          <legend className="text-sm font-semibold">Labels</legend>
          {labels.map((l) => (
            <label key={l.id} className={`text-xs flex flex-col ${focusLabel === l.id ? "bg-[#fff6d6] rounded p-1" : ""}`}>
              {l.id}
              <input
                className="field-input"
                disabled={locked}
                value={d.labelOverrides[l.id] ?? l.original}
                autoFocus={focusLabel === l.id}
                onChange={(e) => {
                  const next = { ...d.labelOverrides };
                  if (e.target.value === l.original) delete next[l.id];
                  else next[l.id] = e.target.value.slice(0, 200);
                  ud({ labelOverrides: next });
                }}
              />
            </label>
          ))}
        </fieldset>
      )}
      <details>
        <summary className="text-sm font-semibold cursor-pointer">Edit the diagram data</summary>
        <p className="text-xs text-muted my-1">The drawing is computed from this data, so changing a value (an elevation, a bar value, a coordinate) redraws it accurately. Invalid data is rejected, never guessed.</p>
        <textarea className="field-input font-mono text-xs" rows={12} value={specText} disabled={locked} onChange={(e) => setSpecText(e.target.value)} />
        <ErrorText error={specError} />
        <Button
          size="sm"
          disabled={locked}
          onClick={() => {
            try {
              const parsed = DiagramSpecSchema.parse(JSON.parse(specText));
              if (parsed.type !== d.spec.type && !window.confirm("Change the diagram type? Labels will be reset.")) return;
              ud({ spec: parsed, labelOverrides: parsed.type === d.spec.type ? d.labelOverrides : {}, reviewStatus: "unreviewed" });
              setSpecError(null);
            } catch (e) {
              setSpecError(e instanceof SyntaxError ? "Not valid JSON." : (e as Error).message.slice(0, 400));
            }
          }}
        >
          Apply data
        </Button>
      </details>
      <div className="flex gap-2">
        <Button size="sm" onClick={() => ud({ reviewStatus: "accepted" })} disabled={d.reviewStatus === "accepted"}>
          Mark reviewed
        </Button>
        <Button size="sm" variant="ghost" onClick={() => ud({ reviewStatus: "needs-change" })}>
          Needs change
        </Button>
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------- regenerate

const PRESETS = ["Simplify the language", "Make it shorter", "Add more support", "Make it an extension task", "Make it more concrete with an everyday example"];

function RegenerateBox({ projectId, section, canGenerate, onDone }: { projectId: string; section: Section; canGenerate: boolean; onDone: () => Promise<void> }) {
  const [instruction, setInstruction] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function go() {
    setBusy(true);
    setError(null);
    try {
      const { jobId } = await api<{ jobId: string }>(`/api/projects/${projectId}/regenerate`, { method: "POST", json: { sectionId: section.id, instruction } });
      for (;;) {
        await new Promise((r) => setTimeout(r, 1500));
        const { job } = await api<{ job: { status: string; error: string | null; message: string | null } }>(`/api/jobs/${jobId}`);
        if (job.status === "running" || job.status === "queued") continue;
        if (job.status !== "succeeded") setError(job.error ?? job.message ?? "Regeneration stopped.");
        break;
      }
      await onDone();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Card className="p-3 flex flex-col gap-2">
      <h2 className="font-display text-lg font-semibold">Regenerate this section</h2>
      {!canGenerate ? (
        <p className="text-sm text-muted">Unavailable in demo mode. You can still edit by hand.</p>
      ) : (
        <>
          <div className="flex flex-wrap gap-1">
            {PRESETS.map((p) => (
              <button key={p} type="button" className="text-xs border border-line rounded px-1.5 py-0.5 hover:bg-[#f0ece2]" onClick={() => setInstruction(p)}>
                {p}
              </button>
            ))}
          </div>
          <T label="What should change?" rows={2} value={instruction} onChange={setInstruction} />
          <Button onClick={go} disabled={busy || section.locked}>
            {busy ? <span className="cs-pulse">Rewriting…</span> : "Propose a new version"}
          </Button>
          <p className="text-xs text-muted">Only this section (and its answer key) changes. You will see the proposal before anything is replaced.</p>
        </>
      )}
      <ErrorText error={error} />
    </Card>
  );
}

// ---------------------------------------------------------------- document

function DocumentSettings({ doc, setDoc }: { doc: WorksheetDocument; setDoc: SetDoc }) {
  const L = doc.layout;
  const ul = (patch: Partial<WorksheetDocument["layout"]>) => setDoc((d) => ({ ...d, layout: { ...d.layout, ...patch } }));
  const sel = (label: string, value: string, onChange: (v: string) => void, options: [string, string][]) => (
    <label className="text-sm font-semibold flex flex-col gap-1">
      {label}
      <select className="field-input font-normal" value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map(([v, t]) => (
          <option key={v} value={v}>
            {t}
          </option>
        ))}
      </select>
    </label>
  );
  return (
    <div className="flex flex-col gap-3">
      <Card className="p-3 flex flex-col gap-2">
        <h2 className="font-display text-lg font-semibold">Document</h2>
        <T label="Title (for files and lists)" value={doc.title} onChange={(v) => setDoc((d) => ({ ...d, title: v }))} />
        <T label="Main question (printed as the page title)" value={doc.question} onChange={(v) => setDoc((d) => ({ ...d, question: v }))} />
        <T label="Subject line" value={doc.subject} onChange={(v) => setDoc((d) => ({ ...d, subject: v }))} />
        <label className="text-sm font-semibold flex flex-col gap-1">
          Target student pages
          <input type="number" min={1} max={20} className="field-input !w-24 font-normal" value={doc.format.targetStudentPages} onChange={(e) => setDoc((d) => ({ ...d, format: { ...d.format, kind: "custom", targetStudentPages: Math.max(1, Number(e.target.value)) } }))} />
        </label>
      </Card>
      <Card className="p-3 grid grid-cols-2 gap-2">
        <h2 className="col-span-2 font-display text-lg font-semibold">Page and print</h2>
        {sel("Page size", L.pageSize, (v) => ul({ pageSize: v as "letter" }), [["letter", "US Letter"], ["a4", "A4"]])}
        {sel("Type size", L.fontScale, (v) => ul({ fontScale: v as "standard" }), [["standard", "Standard"], ["large", "Large"], ["extra-large", "Extra large"]])}
        {sel("Writing space", L.writingSpace, (v) => ul({ writingSpace: v as "standard" }), [["compact", "Compact"], ["standard", "Standard"], ["generous", "Generous"]])}
        {sel("Colour", L.colourMode, (v) => ul({ colourMode: v as "bw" }), [["bw", "Black and white"], ["grayscale", "Grayscale"], ["accent", "Accent colour"], ["full", "Full colour"]])}
        {sel("Visual style", L.visualFamily, (v) => ul({ visualFamily: v as "editorial" }), [["field-notes", "Field notes"], ["editorial", "Editorial"], ["technical-cutaway", "Technical"], ["archival-notebook", "Archival notebook"], ["geometric", "Geometric"], ["early-years", "Early years"]])}
        {sel("References on student page", L.studentReferences, (v) => ul({ studentReferences: v as "short" }), [["none", "None"], ["short", "Short line"], ["full", "Full list"]])}
        <label className="text-sm font-semibold flex flex-col gap-1">
          Accent colour
          <input type="color" value={L.accentColour} onChange={(e) => ul({ accentColour: e.target.value })} className="h-9 w-full" />
        </label>
        <label className="text-sm font-semibold flex flex-col gap-1">
          Binding allowance (mm)
          <input type="number" min={0} max={25} className="field-input font-normal" value={L.bindingMm} onChange={(e) => ul({ bindingMm: Number(e.target.value) })} />
        </label>
        {(["top", "bottom", "inner", "outer"] as const).map((k) => (
          <label key={k} className="text-sm font-semibold flex flex-col gap-1">
            Margin {k} (mm)
            <input type="number" min={6} max={40} className="field-input font-normal" value={L.marginsMm[k]} onChange={(e) => ul({ marginsMm: { ...L.marginsMm, [k]: Math.max(6, Math.min(40, Number(e.target.value))) } })} />
          </label>
        ))}
        <Check label="Name and date fields" checked={L.showNameDate} onChange={(v) => ul({ showNameDate: v })} />
        <Check label="Page numbers" checked={L.showPageNumbers} onChange={(v) => ul({ showPageNumbers: v })} />
        <p className="col-span-2 text-xs text-muted">After changing page size, type size or margins, use “Reflow pages”.</p>
      </Card>
      <Card className="p-3 flex flex-col gap-2">
        <h2 className="font-display text-lg font-semibold">Branding</h2>
        <T label="Brand name (page header)" value={L.brand.name} onChange={(v) => ul({ brand: { ...L.brand, name: v } })} />
        <T label="Footer" value={L.brand.footer} onChange={(v) => ul({ brand: { ...L.brand, footer: v } })} />
        <T label="Copyright" value={L.brand.copyright} onChange={(v) => ul({ brand: { ...L.brand, copyright: v } })} />
      </Card>
    </div>
  );
}
