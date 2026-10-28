/**
 * The one renderer used for preview and every export.
 *
 * `renderWorksheetHtml` turns a validated WorksheetDocument into a complete
 * HTML document of fixed-size pages. Student variants are built from student
 * fields only: the answer key, teacher notes and claim records are never
 * passed to the student page builders, so they cannot leak into hidden
 * layers or accessible text.
 */
import type { Activity, AnswerKeyEntry, Diagram, Section, WorksheetDocument } from "../schema/document";
import { compileDiagram } from "../diagrams/compile";
import { renderSvg } from "../diagrams/render";
import { escapeHtml, renderBlocks, renderInline } from "../text";
import { fontFaceCss, worksheetCss } from "./styles";
import { STRATEGY_LABELS } from "../pedagogy/strategies";

export type Variant = "student" | "answer-key" | "teacher-notes" | "educator";

export interface RenderOptions {
  variant: Variant;
  /** How fonts are referenced: URL base for the preview, data URIs for export. */
  fontSrc: (file: string) => string;
  /** Adds click-to-select hooks for the editor. */
  interactive?: boolean;
  selectedSectionId?: string;
  /** Printed on educator pages when the revision is not approved. */
  draftLabel?: string;
  revisionLabel?: string;
}

const esc = escapeHtml;

/** Deterministic shuffle so match options do not line up with their prompts. */
function seededOrder<T>(items: T[], seed: string): T[] {
  let h = 2166136261;
  for (const ch of seed) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  const arr = items.map((v, i) => ({ v, k: ((h ^ (i * 2654435761)) >>> 0) % 1000003 }));
  arr.sort((a, b) => a.k - b.k);
  const out = arr.map((a) => a.v);
  // Avoid leaving any item in its original slot when possible.
  if (out.length > 1 && out.every((v, i) => v === items[i])) out.push(out.shift()!);
  return out;
}

/** Right-hand column order for a match activity (shared by student page and answer key). */
export function matchOrder(a: Activity): string[] {
  return seededOrder(
    a.items.map((it) => it.options[0] ?? ""),
    a.id,
  );
}

export function activityNumbers(doc: WorksheetDocument): Map<string, number> {
  const map = new Map<string, number>();
  let k = 1;
  for (const s of doc.sections) {
    if (s.hidden) continue;
    if (s.kind === "activity" && s.activityId && !map.has(s.activityId)) map.set(s.activityId, k++);
  }
  return map;
}

export function figureNumbers(doc: WorksheetDocument): Map<string, number> {
  const map = new Map<string, number>();
  let k = 1;
  for (const s of doc.sections) {
    if (s.hidden) continue;
    if (s.diagramId && !map.has(s.diagramId)) map.set(s.diagramId, k++);
  }
  return map;
}

function lines(count: number): string {
  if (count <= 0) return "";
  return `<div class="lines" aria-hidden="true">${'<div class="ln"></div>'.repeat(count)}</div>`;
}

function drawBox(lineCount: number): string {
  return `<div class="drawbox" style="height:calc(var(--line) * ${Math.max(3, lineCount)})" aria-label="Space to draw"></div>`;
}

export function diagramSvg(doc: WorksheetDocument, d: Diagram, reveal: boolean, prefix: string): string {
  const graph = compileDiagram(d.spec, d.labelOverrides);
  return renderSvg(graph, {
    colourMode: doc.layout.colourMode,
    accentColour: doc.layout.accentColour,
    idPrefix: prefix,
    revealBlanks: reveal,
    title: d.altText,
    description: d.longDescription,
  });
}

function renderFigure(doc: WorksheetDocument, d: Diagram, figNo: number | undefined, reveal: boolean, prefix: string): string {
  return `<figure data-diagram="${esc(d.id)}">
<div class="art" style="width:${d.widthPct}%">${diagramSvg(doc, d, reveal, prefix)}</div>
${d.caption ? `<figcaption>${figNo ? `<b>Figure ${figNo}.</b> ` : ""}${renderInline(d.caption)}</figcaption>` : ""}
</figure>`;
}

// ---------------------------------------------------------------- student blocks

function renderActivity(doc: WorksheetDocument, a: Activity, num: number | undefined): string {
  const support = doc.audience.supportPreferences;
  const parts: string[] = [];
  parts.push(`<h2>${num ? `<span class="num" aria-label="Activity ${num}">${num}</span>` : ""}${renderInline(a.title)}</h2>`);
  if (a.coverInstruction) parts.push(`<p class="cover">Cover the explanation before you start. Answer from memory, then check.</p>`);
  if (a.instructions) parts.push(renderBlocks(a.instructions));
  if (a.supportOptions.wordBank.length) {
    parts.push(`<div class="wordbank" aria-label="Word bank">${a.supportOptions.wordBank.map((w) => `<span>${esc(w)}</span>`).join("")}</div>`);
  }
  if (a.diagramId) {
    const d = doc.diagrams.find((x) => x.id === a.diagramId);
    if (d) parts.push(renderFigure(doc, d, undefined, false, `act-${a.id}`));
  }
  const draw = a.responseMode === "draw";
  if (a.type === "match") {
    const rights = matchOrder(a);
    const letters = "ABCDEFGHIJKLMNOP";
    parts.push(
      `<div class="match">${a.items
        .map(
          (it, i) =>
            `<div class="l"><b>${i + 1}.</b> <span>${renderInline(it.prompt)}</span> <i aria-label="write a letter"></i></div><div><b>${letters[i]}.</b> ${renderInline(rights[i] ?? "")}</div>`,
        )
        .join("")}</div>`,
    );
  } else {
    const cls = a.type === "sequence" ? "seq" : "";
    parts.push(
      `<div class="${cls}">${a.items
        .map((it, i) => {
          const choiceCls = a.responseMode === "circle" ? "choices circle" : "choices";
          const opts = it.options.length && a.type !== "match" ? `<div class="${choiceCls}">${it.options.map((o) => `<span>${renderInline(o)}</span>`).join("")}</div>` : "";
          const given = it.givenAnswer ? `<div class="given">${renderInline(it.givenAnswer)}</div>` : "";
          const space = it.givenAnswer ? "" : draw ? drawBox(it.answerLines) : lines(opts ? Math.min(it.answerLines, 1) : it.answerLines);
          const label = a.items.length > 1 ? `<b>${String.fromCharCode(97 + i)})</b>` : "";
          return `<div class="item"><div class="prompt">${label}<span>${renderInline(it.prompt)}</span></div>${opts}${given}${space}</div>`;
        })
        .join("")}</div>`,
    );
  }
  const extras: string[] = [];
  if (a.supportOptions.sentenceStarter && (support.sentenceStarters || a.supportLevel === "more-support")) {
    extras.push(`<span class="k">Sentence starter:</span> ${renderInline(a.supportOptions.sentenceStarter)}`);
  }
  if (extras.length) parts.push(`<div class="support">${extras.join("<br>")}</div>`);
  if (a.supportOptions.oralAlternative && support.oralAlternatives) {
    parts.push(`<div class="oral">Or: ${renderInline(a.supportOptions.oralAlternative)}</div>`);
  }
  if (a.supportOptions.drawingAlternative && support.drawingAlternatives) {
    parts.push(`<div class="oral">Or: ${renderInline(a.supportOptions.drawingAlternative)}</div>`);
  }
  return parts.join("\n");
}

function renderSection(doc: WorksheetDocument, s: Section, ctx: { acts: Map<string, number>; figs: Map<string, number>; firstExplanation: boolean }): string {
  const heading = s.heading ? `<h2>${renderInline(s.heading)}</h2>` : "";
  const body = s.body ? renderBlocks(s.body) : "";
  switch (s.kind) {
    case "hook":
      return `${heading}${body}`;
    case "prediction":
      return `<div class="box">${heading || "<h2>Predict</h2>"}${body}${lines(2)}</div>`;
    case "explanation": {
      const answer = ctx.firstExplanation ? `<div class="answerbox"><p class="label">The short answer</p><p>${renderInline(doc.directAnswer)}</p></div>` : "";
      return `${heading}${answer}${body}`;
    }
    case "vocabulary":
      return `${heading || "<h2>Key words</h2>"}<dl class="vocab">${s.terms.map((t) => `<dt>${esc(t.term)}</dt><dd>${renderInline(t.definition)}</dd>`).join("")}</dl>`;
    case "diagram": {
      const d = doc.diagrams.find((x) => x.id === s.diagramId);
      return `${heading}${body}${d ? renderFigure(doc, d, ctx.figs.get(d.id), false, `fig-${d.id}`) : ""}`;
    }
    case "activity": {
      const a = doc.activities.find((x) => x.id === s.activityId);
      return a ? renderActivity(doc, a, ctx.acts.get(a.id)) : "";
    }
    case "investigation":
      return `<div class="box">${heading || "<h2>Try it</h2>"}${body}</div>`;
    case "discussion":
      return `<div class="box dashed">${heading || "<h2>Talk it through</h2>"}${body}</div>`;
    case "recall":
      return `<div class="recall">${heading || "<h2>From memory</h2>"}${body}${lines(3)}</div>`;
    case "reflection":
      return `${heading || "<h2>Think back</h2>"}${body}${lines(2)}`;
    case "next-question":
      return `<div class="nextq"><span class="label">${esc(s.heading || "Wonder next")}</span><p>${renderInline(s.body || doc.nextQuestion)}</p></div>`;
    case "safety":
      return `<div class="safety">${heading}${body}</div>`;
    case "note":
    default:
      return `${heading}${body}`;
  }
}

function pageShell(doc: WorksheetDocument, inner: string, opts: RenderOptions, label: string, flow: boolean): string {
  const L = doc.layout;
  const head = `<div class="page-head"><span>${esc(L.brand.name || "")}</span>${
    L.showNameDate && opts.variant === "student" ? `<span class="namedate"><span>Name <i></i></span><span>Date <i class="short"></i></span></span>` : `<span>${esc(label)}</span>`
  }</div>`;
  const footLeft = [L.brand.footer, L.brand.copyright].filter(Boolean).map(esc).join(" · ");
  const foot = `<div class="page-foot"><span>${footLeft}</span><span>${opts.revisionLabel ? esc(opts.revisionLabel) + " · " : ""}${L.showPageNumbers ? `<span class="pno"></span>` : ""}</span></div>`;
  const draft = opts.draftLabel && opts.variant !== "student" ? `<div class="draftmark">${esc(opts.draftLabel)}</div>` : "";
  return `<div class="page" data-kind="${esc(label)}"${flow ? ' data-flow="1"' : ""}>${draft}${head}<div class="page-body">${inner}</div>${foot}</div>`;
}

export function studentPages(doc: WorksheetDocument, opts: RenderOptions): string[] {
  const acts = activityNumbers(doc);
  const figs = figureNumbers(doc);
  const visible = doc.sections.filter((s) => opts.interactive || !s.hidden);
  const pageCount = Math.max(1, ...visible.map((s) => s.page));
  const pages: string[] = [];
  let firstExplanation = true;
  for (let p = 1; p <= pageCount; p++) {
    const blocks: string[] = [];
    if (p === 1) {
      blocks.push(`<header class="titleblock" data-section="__title"><p class="eyebrow">${esc(doc.subject)}</p><h1 class="question">${renderInline(doc.question)}</h1>${
        doc.supportingQuestions.length ? `<p class="subq">${doc.supportingQuestions.map(renderInline).join(" · ")}</p>` : ""
      }</header>`);
    }
    for (const s of visible.filter((x) => x.page === p)) {
      const isFirstExp = s.kind === "explanation" && firstExplanation && !s.hidden;
      if (isFirstExp) firstExplanation = false;
      const inner = renderSection(doc, s, { acts, figs, firstExplanation: isFirstExp });
      const cls = ["blk", `k-${s.kind}`, s.hidden ? "is-hidden" : "", opts.selectedSectionId === s.id ? "selected" : ""].filter(Boolean).join(" ");
      const lock = opts.interactive && s.locked ? `<span class="lock" aria-label="locked">🔒 locked</span>` : "";
      blocks.push(`<section class="${cls}" data-section="${esc(s.id)}"${s.keepWithNext ? ' data-keep-with-next="1"' : ""}>${lock}${inner}</section>`);
    }
    if (p === pageCount && doc.layout.studentReferences !== "none" && doc.sources.length) {
      const refs = doc.sources.slice(0, doc.layout.studentReferences === "short" ? 4 : 40);
      blocks.push(
        `<div class="refs" data-section="__refs"><b>Where these facts come from:</b> ${
          doc.layout.studentReferences === "short"
            ? refs.map((r) => esc(r.authorOrOrganization || r.title)).join("; ")
            : `<ol>${refs.map((r) => `<li>${esc(r.title)}${r.authorOrOrganization ? ` — ${esc(r.authorOrOrganization)}` : ""}</li>`).join("")}</ol>`
        }</div>`,
      );
    }
    pages.push(blocks.join("\n"));
  }
  return pages;
}

// ---------------------------------------------------------------- answer key

function answerEntry(doc: WorksheetDocument, a: Activity, k: AnswerKeyEntry | undefined, num: number | undefined, page: number | undefined): string {
  if (!k) return `<section class="blk"><h2>Activity ${num ?? "?"}: ${renderInline(a.title)}</h2><p><b>Missing answer-key entry.</b></p></section>`;
  const obj = a.objectiveIds
    .map((id) => doc.learningPlan.objectives.find((o) => o.id === id))
    .filter(Boolean)
    .map((o) => esc(o!.text))
    .join("; ");
  const parts = [`<h2>Activity ${num ?? "–"}: ${renderInline(a.title)}</h2>`];
  parts.push(`<p class="meta">Student page ${page ?? "–"} · ${esc(a.type)} · objective: ${obj}${k.marks !== undefined && a.scored ? ` · ${k.marks} mark${k.marks === 1 ? "" : "s"}` : ""}</p>`);
  if (a.diagramId) {
    const d = doc.diagrams.find((x) => x.id === a.diagramId);
    if (d && d.spec.type === "labelled-scene" && d.spec.callouts.some((c) => c.blank)) parts.push(renderFigure(doc, d, undefined, true, `key-${a.id}`));
  }
  parts.push(`<div class="ans">${renderBlocks(k.answer)}</div>`);
  if (k.itemAnswers.length) {
    parts.push(
      `<table><tbody>${k.itemAnswers
        .map((ia) => {
          const idx = a.items.findIndex((it) => it.id === ia.itemId);
          if (a.type === "match" && idx >= 0) {
            const letter = "ABCDEFGHIJKLMNOP"[matchOrder(a).indexOf(a.items[idx].options[0] ?? "")] ?? "?";
            return `<tr><th scope="row">${idx + 1} → ${letter}</th><td>${renderInline(ia.answer)}</td></tr>`;
          }
          const lbl = idx >= 0 ? String.fromCharCode(97 + idx) + ")" : esc(ia.itemId);
          return `<tr><th scope="row">${lbl}</th><td>${renderInline(ia.answer)}</td></tr>`;
        })
        .join("")}</tbody></table>`,
    );
  }
  if (k.reasoning) parts.push(`<p><b>Why:</b> ${renderInline(k.reasoning)}</p>`);
  if (k.acceptableAlternatives.length) parts.push(`<p><b>Also accept:</b> ${k.acceptableAlternatives.map(renderInline).join("; ")}</p>`);
  if (k.rubric.length) {
    parts.push(`<table><thead><tr><th>Level</th><th>What it looks like</th></tr></thead><tbody>${k.rubric.map((r) => `<tr><td>${esc(r.level)}</td><td>${renderInline(r.descriptor)}</td></tr>`).join("")}</tbody></table>`);
  }
  if (k.commonErrors.length) parts.push(`<p><b>Watch for:</b></p><ul>${k.commonErrors.map((e) => `<li>${renderInline(e)}</li>`).join("")}</ul>`);
  return `<section class="blk">${parts.join("")}</section>`;
}

export function answerKeyBlocks(doc: WorksheetDocument): string[] {
  const acts = activityNumbers(doc);
  const pageOf = new Map(doc.sections.filter((s) => s.activityId).map((s) => [s.activityId!, s.page]));
  const ordered = [...doc.activities].filter((a) => acts.has(a.id)).sort((a, b) => acts.get(a.id)! - acts.get(b.id)!);
  const blocks = [`<header class="titleblock"><p class="eyebrow">Answer key</p><h1 class="question" style="font-size:20pt">${renderInline(doc.question)}</h1></header>`];
  for (const a of ordered) blocks.push(answerEntry(doc, a, doc.answerKey.find((k) => k.id === a.answerKeyId), acts.get(a.id), pageOf.get(a.id)));
  return blocks;
}

// ---------------------------------------------------------------- teacher notes

export function teacherNoteBlocks(doc: WorksheetDocument): string[] {
  const tn = doc.teacherNotes;
  const lp = doc.learningPlan;
  const b: string[] = [];
  b.push(`<header class="titleblock"><p class="eyebrow">Teacher notes</p><h1 class="question" style="font-size:20pt">${renderInline(doc.question)}</h1>
<p class="meta">Ages ${doc.audience.ageMin}–${doc.audience.ageMax}${doc.audience.grade ? ` · ${esc(doc.audience.grade)}` : ""} · reading demand: ${esc(doc.audience.readingDemand)} · prior knowledge: ${esc(doc.audience.priorKnowledge)} · about ${doc.format.estimatedMinutes} minutes</p></header>`);
  b.push(`<section class="blk"><h2>Overview</h2>${renderBlocks(tn.overview)}</section>`);
  b.push(`<section class="blk"><h2>Learning objectives</h2><ol>${lp.objectives.map((o) => `<li>${renderInline(o.text)} <span class="meta">— evidence: ${renderInline(o.evidence)}</span></li>`).join("")}</ol></section>`);
  b.push(`<section class="blk"><h2>Why this lesson is structured this way</h2>${renderBlocks(lp.rationale)}<ul>${lp.selectedStrategies
    .map((s) => `<li><b>${esc(STRATEGY_LABELS[s.id] ?? s.id)}:</b> ${renderInline(s.rationale)}</li>`)
    .join("")}</ul></section>`);
  if (lp.prerequisites.length) b.push(`<section class="blk"><h2>Assumed prior knowledge</h2><ul>${lp.prerequisites.map((p) => `<li>${renderInline(p)}</li>`).join("")}</ul></section>`);
  if (lp.misconceptions.length) {
    b.push(`<section class="blk"><h2>Ideas learners may bring</h2><table><thead><tr><th>Idea</th><th>More accurate idea</th><th>Basis</th></tr></thead><tbody>${lp.misconceptions
      .map((m) => `<tr><td>${renderInline(m.text)}</td><td>${renderInline(m.correction)}</td><td>${esc(m.basis === "plausible-not-verified" ? "plausible, not verified" : m.basis)}</td></tr>`)
      .join("")}</tbody></table>${tn.misconceptionNotes ? renderBlocks(tn.misconceptionNotes) : ""}</section>`);
  }
  if (tn.materials.length) b.push(`<section class="blk"><h2>Materials</h2><ul>${tn.materials.map((m) => `<li>${renderInline(m)}</li>`).join("")}</ul></section>`);
  if (tn.safety.length || tn.sensitivity.adultSupervision) {
    b.push(`<section class="blk safety"><ul>${tn.sensitivity.adultSupervision ? "<li>Adult supervision is required for the practical task.</li>" : ""}${tn.safety.map((m) => `<li>${renderInline(m)}</li>`).join("")}</ul></section>`);
  }
  if (tn.sensitivity.level !== "none") b.push(`<section class="blk"><h2>Sensitivity</h2><p>${esc(tn.sensitivity.level === "specialist-review" ? "Specialist review recommended." : "Handle with care.")} ${renderInline(tn.sensitivity.notes)}</p></section>`);
  b.push(`<section class="blk"><h2>Differentiation</h2><p><b>More support:</b> ${renderInline(tn.differentiation.moreSupport || lp.supportOptions.join("; "))}</p><p><b>Extension:</b> ${renderInline(tn.differentiation.extension || lp.extensionOptions.join("; "))}</p></section>`);
  if (tn.reviewSuggestions || lp.reviewPlan.suggestedReviewDays.length) {
    b.push(`<section class="blk"><h2>Review later</h2>${tn.reviewSuggestions ? renderBlocks(tn.reviewSuggestions) : ""}${
      lp.reviewPlan.suggestedReviewDays.length ? `<p>Suggested follow-up: day ${lp.reviewPlan.suggestedReviewDays.join(", day ")} (editable; one worksheet alone does not provide spaced practice).</p>` : ""
    }</section>`);
  }
  // curriculum
  const cur = tn.curriculum;
  b.push(`<section class="blk"><h2>Curriculum</h2>${
    cur.status === "verified-from-document"
      ? `<p>Mapped against <i>${esc(cur.documentTitle ?? "")}</i>${cur.documentVersion ? ` (${esc(cur.documentVersion)})` : ""}.</p><table><thead><tr><th>Expectation</th><th>Where</th><th>Limits</th></tr></thead><tbody>${cur.items
          .map((i) => `<tr><td>${i.code ? `<b>${esc(i.code)}</b> ` : ""}${esc(i.expectation)}</td><td>${esc(i.location ?? "")}</td><td>${esc(i.coverageLimitations)}</td></tr>`)
          .join("")}</tbody></table>`
      : cur.status === "suggested-unverified"
        ? `<p><b>Suggested topic alignment—not verified curriculum alignment.</b></p>${cur.items.length ? `<ul>${cur.items.map((i) => `<li>${esc(i.expectation)} — ${esc(i.coverageLimitations)}</li>`).join("")}</ul>` : ""}`
        : `<p>No curriculum mapping has been made.</p>`
  }</section>`);
  // diagrams
  const visibleDiagrams = doc.diagrams.filter((d) => doc.sections.some((s) => !s.hidden && s.diagramId === d.id) || doc.activities.some((a) => a.diagramId === d.id));
  if (visibleDiagrams.length) {
    b.push(`<section class="blk"><h2>Diagram descriptions</h2>${visibleDiagrams
      .map((d) => `<p><b>${esc(d.caption || d.id)}</b> <span class="status">${esc(d.reviewStatus)}</span><br>${renderInline(d.longDescription)}<br><span class="meta">Purpose: ${esc(d.teachingPurpose)} · ${esc(d.provenance.note)}</span></p>`)
      .join("")}</section>`);
  }
  // sources and claims
  const srcItem = (s: WorksheetDocument["sources"][number]) =>
    `<li id="src-${esc(s.id)}">${esc(s.title)}${s.authorOrOrganization ? `. ${esc(s.authorOrOrganization)}` : ""}${s.publicationDate ? ` (${esc(s.publicationDate)})` : ""}. ${
      s.location.kind === "url" ? esc(s.location.value) : esc(s.location.kind)
    }. Retrieved ${esc(s.retrievedAt.slice(0, 10))}.${s.locator ? ` ${esc(s.locator)}.` : ""} <span class="meta">[${esc(s.id)} · licence: ${esc(s.licenceStatus)}]</span></li>`;
  if (!doc.sources.length) {
    b.push(`<section class="blk"><h2>Sources</h2><p><b>No sources are attached.</b> Every factual statement in this worksheet is unverified.</p></section>`);
  }
  for (let i = 0; i < doc.sources.length; i += 6) {
    b.push(`<section class="blk">${i === 0 ? "<h2>Sources</h2>" : ""}<ol start="${i + 1}">${doc.sources.slice(i, i + 6).map(srcItem).join("")}</ol></section>`);
  }
  const claimRow = (c: WorksheetDocument["claims"][number]) =>
    `<tr><td>${renderInline(c.text)}${c.uncertainty ? `<br><span class="meta">${esc(c.uncertainty)}</span>` : ""}</td><td>${c.sourceIds.map(esc).join(", ") || "—"}</td><td>${esc(c.evidenceStatus)}<br><span class="meta">${esc(
      c.statusAssignedBy,
    )} · ${esc(c.reviewStatus)}</span></td></tr>`;
  // Chunked so the paginator can break between groups of rows.
  for (let i = 0; i < Math.max(1, doc.claims.length); i += 8) {
    const rows = doc.claims.slice(i, i + 8);
    b.push(
      `<section class="blk">${i === 0 ? "<h2>Claims and evidence</h2>" : ""}<table><thead><tr><th>Claim</th><th>Sources</th><th>Status</th></tr></thead><tbody>${rows.map(claimRow).join("")}</tbody></table></section>`,
    );
  }
  b.push(`<p class="meta">“Model assessment” means a language model compared the claim with the stored excerpt. It is a prompt for review, not verification.</p>`);
  return b;
}

export function renderWorksheetHtml(doc: WorksheetDocument, opts: RenderOptions): string {
  const css = fontFaceCss(opts.fontSrc) + worksheetCss(doc.layout);
  // Student pages are fixed (sections are pinned to pages and overflow is
  // reported). Answer keys and notes are "flow" pages that the in-page
  // paginator splits at block boundaries, identically in preview and export.
  const pages: string[] = [];
  if (opts.variant === "student" || opts.variant === "educator") {
    for (const inner of studentPages(doc, opts)) pages.push(pageShell(doc, inner, opts, "Student", false));
  }
  if (opts.variant === "answer-key" || opts.variant === "educator") {
    pages.push(pageShell(doc, `<div class="key flow">${answerKeyBlocks(doc).join("\n")}</div>`, opts, "Answer key", true));
  }
  if (opts.variant === "teacher-notes" || opts.variant === "educator") {
    pages.push(pageShell(doc, `<div class="key flow">${teacherNoteBlocks(doc).join("\n")}</div>`, opts, "Teacher notes", true));
  }
  const pagesHtml = pages.join("\n");
  const lang = esc(doc.audience.regionalConventions.spelling || "en");
  const bodyCls = [`fam-${doc.layout.visualFamily}`, opts.interactive ? "interactive" : ""].join(" ");
  return `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><title>${esc(doc.title || doc.question)}</title><meta name="generator" content="Curiosity Studio">
<style>${css}</style></head><body class="${bodyCls}"><div class="doc" data-variant="${opts.variant}">${pagesHtml}</div><script>${PAGINATE_SCRIPT}</script>${opts.interactive ? INTERACTIVE_SCRIPT : ""}</body></html>`;
}

/**
 * In-page layout engine: splits flow pages at block boundaries, numbers the
 * pages, and records measured overflow in window.__csLayout. The export path
 * waits for window.__csReady, so PDFs use exactly what the preview shows.
 */
export const PAGINATE_SCRIPT = `(function(){
function inkBottom(body){var max=0;var els=body.querySelectorAll('*');for(var i=0;i<els.length;i++){var r=els[i].getBoundingClientRect();if(r.height>0&&r.bottom>max)max=r.bottom;}return max;}
function limitOf(body){return body.getBoundingClientRect().top+body.clientHeight;}
function split(){document.querySelectorAll('.page[data-flow="1"]').forEach(function(page){var cur=page,guard=0;
while(guard++<60){var body=cur.querySelector('.page-body');var wrap=body.firstElementChild;var limit=limitOf(body);if(!wrap||inkBottom(body)<=limit+0.5)break;
var kids=Array.prototype.slice.call(wrap.children);var idx=-1;
for(var i=0;i<kids.length;i++){if(kids[i].getBoundingClientRect().bottom>limit+0.5){idx=i;break;}}
if(idx<=0)break;var next=cur.cloneNode(true);var nwrap=next.querySelector('.page-body').firstElementChild;nwrap.innerHTML='';
kids.slice(idx).forEach(function(k){nwrap.appendChild(k);});cur.parentNode.insertBefore(next,cur.nextSibling);cur=next;}});}
function number(){var pages=document.querySelectorAll('.page');var out=[];pages.forEach(function(p,i){p.setAttribute('data-page',String(i+1));
if((i+1)%2===0)p.classList.add('even');else p.classList.remove('even');var n=p.querySelector('.pno');if(n)n.textContent=(i+1)+' / '+pages.length;
var b=p.querySelector('.page-body');var limit=limitOf(b);var secs=[];b.querySelectorAll('[data-section]').forEach(function(s){
if(s.getBoundingClientRect().bottom>limit+0.5)secs.push(s.getAttribute('data-section'));});
out.push({page:i+1,kind:p.getAttribute('data-kind'),overflowPx:Math.max(0,Math.round((inkBottom(b)-limit)*10)/10),clippedSections:secs});});
window.__csLayout=out;window.__csReady=true;if(window.parent!==window)parent.postMessage({type:'cs-measure',pages:out},'*');}
function run(){split();number();}
if(document.fonts&&document.fonts.ready){document.fonts.ready.then(run);}else{window.addEventListener('load',run);}
})();`;

/** Click-to-select bridge for the sandboxed preview iframe. */
const INTERACTIVE_SCRIPT = `<script>
document.addEventListener('click',function(e){var t=e.target.closest('[data-section]');var el=e.target.closest('[data-el][data-editable]');var d=e.target.closest('[data-diagram]');
parent.postMessage({type:'cs-select',section:t?t.getAttribute('data-section'):null,element:el?el.getAttribute('data-el'):null,diagram:d?d.getAttribute('data-diagram'):null},'*');});
</script>`;
