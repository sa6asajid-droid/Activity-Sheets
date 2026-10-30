"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api, ApiError } from "@/lib/client/api";
import { Button, Card, ErrorText, Field, Notice } from "@/components/ui";
import { defaultSettings, FORMAT_PAGES } from "@/lib/defaults";
import type { ProjectSettings } from "@/lib/db/store";
import { useStatus } from "@/components/ProviderBanner";

const list = (s: string) => s.split(/[\n,;]/).map((x) => x.trim()).filter(Boolean);

const MODES = [
  { v: "research", t: "Research for me", d: "Searches the web for suitable sources and links each claim to them." },
  { v: "user-sources", t: "Use my sources", d: "Writes only from text, files or pages you supply." },
  { v: "mixed", t: "Both", d: "Your sources plus web research, with each claim linked to its source." },
  { v: "unverified-draft", t: "Unverified draft", d: "No research. Clearly labelled; every fact needs checking." },
] as const;

export default function NewWorksheet() {
  const router = useRouter();
  const status = useStatus();
  const [s, setS] = useState<ProjectSettings>(defaultSettings());
  const [supporting, setSupporting] = useState("");
  const [required, setRequired] = useState("");
  const [excluded, setExcluded] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = <K extends keyof ProjectSettings>(k: K, v: ProjectSettings[K]) => setS((p) => ({ ...p, [k]: v }));
  const aud = (patch: Partial<ProjectSettings["audience"]>) => setS((p) => ({ ...p, audience: { ...p.audience, ...patch } }));
  const fmt = (patch: Partial<ProjectSettings["format"]>) => setS((p) => ({ ...p, format: { ...p.format, ...patch } }));
  const lay = (patch: Partial<ProjectSettings["layout"]>) => setS((p) => ({ ...p, layout: { ...p.layout, ...patch } }));
  const opt = (patch: Partial<ProjectSettings["options"]>) => setS((p) => ({ ...p, options: { ...p.options, ...patch } }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const body = { ...s, supportingQuestions: list(supporting).slice(0, 5), requiredConcepts: list(required), excludedConcepts: list(excluded) };
      const { project } = await api<{ project: { id: string } }>("/api/projects", { method: "POST", json: body });
      // With source modes the editor adds sources first; otherwise planning starts now.
      if (s.contentMode === "user-sources" || s.contentMode === "mixed") {
        router.push(`/projects/${project.id}?tab=sources`);
        return;
      }
      if (status?.providers.demoOnly) {
        router.push(`/projects/${project.id}`);
        return;
      }
      await api(`/api/projects/${project.id}/plan`, { method: "POST", json: {} });
      router.push(`/projects/${project.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not create the worksheet.");
      setBusy(false);
    }
  }

  const a = s.audience;
  return (
    <form onSubmit={submit} className="mx-auto max-w-3xl flex flex-col gap-5">
      <div>
        <h1 className="font-display text-3xl font-semibold">New worksheet</h1>
        <p className="text-muted text-sm">Ask the question a curious learner would ask. You will review the interpretation and lesson plan before anything is written.</p>
      </div>
      {status?.providers.demoOnly && (
        <Notice tone="warning" title="Generation is unavailable in demo mode">
          No AI provider is configured on the server, so the project will be saved but not generated. Open a demo sample to try editing and exporting, or add <code>ANTHROPIC_API_KEY</code> to the server environment.
        </Notice>
      )}

      <Card className="p-4 flex flex-col gap-4">
        <Field label="Curiosity question" hint="For example: “Why do shadows change during the day?”">
          {(id) => <input id={id} required minLength={5} maxLength={300} className="field-input text-lg" value={s.question} onChange={(e) => set("question", e.target.value)} />}
        </Field>
        <div className="grid sm:grid-cols-2 gap-4">
          <Field label="Subject">{(id) => <input id={id} className="field-input" value={s.subject} onChange={(e) => set("subject", e.target.value)} placeholder="Science, History…" />}</Field>
          <Field label="Supporting questions" hint="Optional; separate with commas.">{(id) => <input id={id} className="field-input" value={supporting} onChange={(e) => setSupporting(e.target.value)} />}</Field>
        </div>
      </Card>

      <Card className="p-4 flex flex-col gap-4">
        <h2 className="font-display text-xl font-semibold">Learner</h2>
        <div className="grid sm:grid-cols-4 gap-4">
          <Field label="Youngest age">{(id) => <input id={id} type="number" min={3} max={19} className="field-input" value={a.ageMin} onChange={(e) => aud({ ageMin: Number(e.target.value) })} />}</Field>
          <Field label="Oldest age">{(id) => <input id={id} type="number" min={3} max={19} className="field-input" value={a.ageMax} onChange={(e) => aud({ ageMax: Number(e.target.value) })} />}</Field>
          <Field label="Grade or stage" className="sm:col-span-2">{(id) => <input id={id} className="field-input" value={a.grade ?? ""} onChange={(e) => aud({ grade: e.target.value })} placeholder="Optional, e.g. Grade 4" />}</Field>
        </div>
        <div className="grid sm:grid-cols-3 gap-4">
          <Field label="Reading demand" hint="Set separately from age.">
            {(id) => (
              <select id={id} className="field-input" value={a.readingDemand} onChange={(e) => aud({ readingDemand: e.target.value as typeof a.readingDemand })}>
                <option value="early">Early — short, simple sentences</option>
                <option value="developing">Developing</option>
                <option value="fluent">Fluent</option>
                <option value="advanced">Advanced</option>
              </select>
            )}
          </Field>
          <Field label="Prior knowledge">
            {(id) => (
              <select id={id} className="field-input" value={a.priorKnowledge} onChange={(e) => aud({ priorKnowledge: e.target.value as typeof a.priorKnowledge })}>
                <option value="new">New to the topic</option>
                <option value="some">Some familiarity</option>
                <option value="confident">Confident</option>
              </select>
            )}
          </Field>
          <Field label="How it will be used">
            {(id) => (
              <select id={id} className="field-input" value={a.intendedUse} onChange={(e) => aud({ intendedUse: e.target.value as typeof a.intendedUse })}>
                <option value="independent">Independent work</option>
                <option value="adult-supported">With an adult</option>
                <option value="classroom">Classroom</option>
                <option value="homeschool">Homeschool</option>
              </select>
            )}
          </Field>
        </div>
      </Card>

      <Card className="p-4 flex flex-col gap-4">
        <h2 className="font-display text-xl font-semibold">Format and content</h2>
        <div className="grid sm:grid-cols-3 gap-4">
          <Field label="Format">
            {(id) => (
              <select id={id} className="field-input" value={s.format.kind} onChange={(e) => { const k = e.target.value as ProjectSettings["format"]["kind"]; fmt({ kind: k, targetStudentPages: FORMAT_PAGES[k] }); }}>
                <option value="one-page">One-page discovery sheet</option>
                <option value="two-page">Two-page lesson</option>
                <option value="mini-workbook">Mini workbook (3–5 pages)</option>
                <option value="custom">Custom length</option>
              </select>
            )}
          </Field>
          {s.format.kind === "custom" || s.format.kind === "mini-workbook" ? (
            <Field label="Student pages" hint="Answer key and teacher notes are extra.">{(id) => <input id={id} type="number" min={1} max={20} className="field-input" value={s.format.targetStudentPages} onChange={(e) => fmt({ targetStudentPages: Number(e.target.value) })} />}</Field>
          ) : (
            <p className="text-sm text-muted self-end pb-2">{s.format.targetStudentPages} student page{s.format.targetStudentPages > 1 ? "s" : ""}, plus a separate answer key and teacher notes.</p>
          )}
          <Field label="About how many minutes?">{(id) => <input id={id} type="number" min={5} max={240} className="field-input" value={s.format.estimatedMinutes} onChange={(e) => fmt({ estimatedMinutes: Number(e.target.value) })} />}</Field>
        </div>
        <fieldset className="flex flex-col gap-2">
          <legend className="text-sm font-semibold mb-1">Where should the facts come from?</legend>
          <div className="grid sm:grid-cols-2 gap-2">
            {MODES.map((m) => (
              <label key={m.v} className={`flex gap-2 rounded-md border p-2.5 cursor-pointer ${s.contentMode === m.v ? "border-accent bg-[#eef3f7]" : "border-line"}`}>
                <input type="radio" name="mode" value={m.v} checked={s.contentMode === m.v} onChange={() => set("contentMode", m.v)} />
                <span>
                  <span className="font-semibold">{m.t}</span>
                  <span className="block text-xs text-muted">{m.d}</span>
                </span>
              </label>
            ))}
          </div>
          {s.contentMode === "research" && status && status.providers.search === "none" && (
            <Notice tone="warning">Web research is not configured on this server. Planning will stop and ask you to add sources or continue as an unverified draft.</Notice>
          )}
        </fieldset>
      </Card>

      <details className="bg-card border border-line rounded-lg p-4">
        <summary className="font-display text-xl font-semibold cursor-pointer">More settings</summary>
        <div className="flex flex-col gap-4 mt-4">
          <div className="grid sm:grid-cols-2 gap-4">
            <Field label="Scope" hint="What to cover — and what to leave for later.">{(id) => <textarea id={id} rows={2} className="field-input" value={s.scope} onChange={(e) => set("scope", e.target.value)} />}</Field>
            <Field label="Real-world context or learner interests">{(id) => <textarea id={id} rows={2} className="field-input" value={s.realWorldContext} onChange={(e) => set("realWorldContext", e.target.value)} />}</Field>
            <Field label="Concepts to include" hint="Comma-separated.">{(id) => <input id={id} className="field-input" value={required} onChange={(e) => setRequired(e.target.value)} />}</Field>
            <Field label="Concepts to leave out">{(id) => <input id={id} className="field-input" value={excluded} onChange={(e) => setExcluded(e.target.value)} />}</Field>
          </div>
          <div className="grid sm:grid-cols-3 gap-4">
            <Field label="Page size">
              {(id) => (
                <select id={id} className="field-input" value={s.layout.pageSize} onChange={(e) => lay({ pageSize: e.target.value as "letter" | "a4" })}>
                  <option value="letter">US Letter</option>
                  <option value="a4">A4</option>
                </select>
              )}
            </Field>
            <Field label="Colour">
              {(id) => (
                <select id={id} className="field-input" value={s.layout.colourMode} onChange={(e) => lay({ colourMode: e.target.value as ProjectSettings["layout"]["colourMode"] })}>
                  <option value="bw">Black-and-white line art</option>
                  <option value="grayscale">Grayscale</option>
                  <option value="accent">Limited accent colour</option>
                  <option value="full">Full colour</option>
                </select>
              )}
            </Field>
            <Field label="Visual style">
              {(id) => (
                <select id={id} className="field-input" value={s.layout.visualFamily} onChange={(e) => lay({ visualFamily: e.target.value as ProjectSettings["layout"]["visualFamily"] })}>
                  <option value="field-notes">Scientific field notes</option>
                  <option value="editorial">Clean nonfiction editorial</option>
                  <option value="technical-cutaway">Technical</option>
                  <option value="archival-notebook">Museum / archival notebook</option>
                  <option value="geometric">Geometric (maths)</option>
                  <option value="early-years">Early years</option>
                </select>
              )}
            </Field>
            <Field label="Type size">
              {(id) => (
                <select id={id} className="field-input" value={s.layout.fontScale} onChange={(e) => lay({ fontScale: e.target.value as ProjectSettings["layout"]["fontScale"] })}>
                  <option value="standard">Standard</option>
                  <option value="large">Large</option>
                  <option value="extra-large">Extra large</option>
                </select>
              )}
            </Field>
            <Field label="Writing space">
              {(id) => (
                <select id={id} className="field-input" value={s.layout.writingSpace} onChange={(e) => lay({ writingSpace: e.target.value as ProjectSettings["layout"]["writingSpace"] })}>
                  <option value="compact">Compact</option>
                  <option value="standard">Standard</option>
                  <option value="generous">Generous</option>
                </select>
              )}
            </Field>
            <Field label="Spelling">
              {(id) => (
                <select id={id} className="field-input" value={a.regionalConventions.spelling} onChange={(e) => aud({ regionalConventions: { ...a.regionalConventions, spelling: e.target.value as "en-CA" } })}>
                  <option value="en-CA">Canadian</option>
                  <option value="en-US">American</option>
                  <option value="en-GB">British</option>
                  <option value="en-AU">Australian</option>
                </select>
              )}
            </Field>
          </div>
          <fieldset className="grid sm:grid-cols-3 gap-2 text-sm">
            <legend className="text-sm font-semibold mb-1">Include when it helps</legend>
            {(
              [
                ["investigation", "A practical investigation"],
                ["discussion", "A discussion activity"],
                ["retrievalCard", "A recall card"],
                ["extension", "An extension challenge"],
                ["vocabulary", "Vocabulary support"],
              ] as const
            ).map(([k, t]) => (
              <label key={k} className="flex items-center gap-2">
                <input type="checkbox" checked={s.options[k]} onChange={(e) => opt({ [k]: e.target.checked })} /> {t}
              </label>
            ))}
            {(
              [
                ["sentenceStarters", "Sentence starters"],
                ["oralAlternatives", "Oral-response options"],
                ["drawingAlternatives", "Drawing options"],
              ] as const
            ).map(([k, t]) => (
              <label key={k} className="flex items-center gap-2">
                <input type="checkbox" checked={a.supportPreferences[k]} onChange={(e) => aud({ supportPreferences: { ...a.supportPreferences, [k]: e.target.checked } })} /> {t}
              </label>
            ))}
          </fieldset>
          <div className="grid sm:grid-cols-3 gap-4">
            <Field label="Support level">
              {(id) => (
                <select id={id} className="field-input" value={s.options.supportLevel} onChange={(e) => opt({ supportLevel: e.target.value as "standard" })}>
                  <option value="more-support">More support</option>
                  <option value="standard">Standard</option>
                  <option value="extension">Extension</option>
                </select>
              )}
            </Field>
            <Field label="Brand name">{(id) => <input id={id} className="field-input" value={s.layout.brand.name} onChange={(e) => lay({ brand: { ...s.layout.brand, name: e.target.value } })} />}</Field>
            <Field label="Copyright line">{(id) => <input id={id} className="field-input" value={s.layout.brand.copyright} onChange={(e) => lay({ brand: { ...s.layout.brand, copyright: e.target.value } })} placeholder="© 2026 Your Press" />}</Field>
            <Field label="Curriculum reference" hint="Used only as a topic suggestion unless you upload the document.">{(id) => <input id={id} className="field-input" value={s.options.curriculumReference} onChange={(e) => opt({ curriculumReference: e.target.value })} />}</Field>
            <Field label="Spending limit for this worksheet (USD)" hint="Generation pauses and asks before going over.">{(id) => <input id={id} type="number" min={0.1} max={50} step={0.1} className="field-input" value={s.budget.maxCostUsd} onChange={(e) => set("budget", { maxCostUsd: Number(e.target.value) })} />}</Field>
          </div>
        </div>
      </details>

      <ErrorText error={error} />
      <div className="flex gap-3 items-center">
        <Button type="submit" variant="primary" disabled={busy}>
          {busy ? "Creating…" : s.contentMode === "user-sources" || s.contentMode === "mixed" ? "Create and add sources" : "Create and plan"}
        </Button>
        <p className="text-xs text-muted">Your inputs are sent to the configured AI provider when planning starts. No student data is collected.</p>
      </div>
    </form>
  );
}
