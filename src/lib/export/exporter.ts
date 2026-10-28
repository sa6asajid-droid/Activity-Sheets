/**
 * Exports. Every export is made from a stored revision (a draft export first
 * snapshots the working draft), and an export manifest records the revision,
 * settings, file hash and any unresolved issues so it can be reproduced.
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { PDFDocument } from "pdf-lib";
import type { Store, RevisionRow, ExportRow } from "../db/store";
import type { WorksheetDocument } from "../schema/document";
import { validateDocument } from "../schema/document";
import { getConfig } from "../config";
import { exportHtml, renderPdf, renderPng, measureHtml } from "../render/browser";
import { blockingIssues, findAnswerLeaks, runQualityChecks } from "../quality/checks";
import { activityNumbers, diagramSvg, figureNumbers } from "../render/worksheet";
import { stripInline, escapeHtml } from "../text";
import { renderWorksheetHtml } from "../render/worksheet";
import { inlineFontSrc } from "../render/browser";
import { fontFaceCss, worksheetCss } from "../render/styles";

export const EXPORT_KINDS = [
  "student-pdf",
  "answer-key-pdf",
  "teacher-notes-pdf",
  "educator-pdf",
  "project-json",
  "student-html",
  "educator-html",
  "plain-text",
  "diagram-svg",
  "page-png",
] as const;
export type ExportKind = (typeof EXPORT_KINDS)[number];

export class ExportRefusedError extends Error {
  constructor(message: string, readonly issues: { code: string; message: string }[] = []) {
    super(message);
  }
}

const MIME: Record<string, string> = { pdf: "application/pdf", json: "application/json", html: "text/html; charset=utf-8", txt: "text/plain; charset=utf-8", svg: "image/svg+xml", png: "image/png" };
export const mimeFor = (file: string) => MIME[file.split(".").pop() ?? ""] ?? "application/octet-stream";

function slugify(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 50) || "worksheet";
}

export function plainText(doc: WorksheetDocument, includeTeacher: boolean): string {
  const acts = activityNumbers(doc);
  const figs = figureNumbers(doc);
  const out: string[] = [doc.question.toUpperCase(), ""];
  if (doc.supportingQuestions.length) out.push(doc.supportingQuestions.join(" / "), "");
  let firstExp = true;
  for (const s of doc.sections.filter((x) => !x.hidden)) {
    if (s.heading) out.push(stripInline(s.heading), "-".repeat(Math.min(60, s.heading.length)));
    if (s.kind === "explanation" && firstExp) {
      out.push(`The short answer: ${stripInline(doc.directAnswer)}`, "");
      firstExp = false;
    }
    if (s.body) out.push(stripInline(s.body), "");
    for (const t of s.terms) out.push(`${t.term}: ${stripInline(t.definition)}`);
    const d = s.diagramId ? doc.diagrams.find((x) => x.id === s.diagramId) : undefined;
    if (d) out.push(`[Figure ${figs.get(d.id) ?? ""}: ${stripInline(d.caption)}]`, `Description: ${stripInline(d.longDescription)}`, "");
    const a = s.activityId ? doc.activities.find((x) => x.id === s.activityId) : undefined;
    if (a) {
      out.push(`Activity ${acts.get(a.id) ?? ""}: ${stripInline(a.title)}`, stripInline(a.instructions));
      if (a.supportOptions.wordBank.length) out.push(`Word bank: ${a.supportOptions.wordBank.join(", ")}`);
      const ad = a.diagramId ? doc.diagrams.find((x) => x.id === a.diagramId) : undefined;
      if (ad) out.push(`[Diagram for this activity: ${stripInline(ad.longDescription)}]`);
      a.items.forEach((it, i) => {
        out.push(`  ${String.fromCharCode(97 + i)}) ${stripInline(it.prompt)}${it.options.length ? `  Options: ${it.options.map(stripInline).join(" | ")}` : ""}${it.givenAnswer ? `  (Given: ${stripInline(it.givenAnswer)})` : ""}`);
      });
      if (a.supportOptions.oralAlternative) out.push(`  Or: ${stripInline(a.supportOptions.oralAlternative)}`);
      out.push("");
    }
  }
  if (includeTeacher) {
    out.push("", "ANSWER KEY", "==========");
    for (const a of doc.activities.filter((x) => acts.has(x.id))) {
      const k = doc.answerKey.find((x) => x.id === a.answerKeyId);
      out.push(`Activity ${acts.get(a.id)}: ${stripInline(a.title)}`, k ? stripInline(k.answer) : "(missing)");
      for (const ia of k?.itemAnswers ?? []) out.push(`  ${ia.itemId}: ${stripInline(ia.answer)}`);
      if (k?.reasoning) out.push(`  Why: ${stripInline(k.reasoning)}`);
      out.push("");
    }
    out.push("SOURCES", "=======");
    doc.sources.forEach((s, i) => out.push(`${i + 1}. ${s.title}${s.authorOrOrganization ? ` — ${s.authorOrOrganization}` : ""}. ${s.location.kind === "url" ? s.location.value : s.location.kind}. Retrieved ${s.retrievedAt.slice(0, 10)}.`));
  }
  return out.join("\n");
}

export interface ExportOptions {
  kind: ExportKind;
  /** Export a specific stored revision; otherwise the working draft is snapshotted first. */
  revisionId?: string;
  /** Allow export while blocking issues remain (labelled draft). */
  allowDraft?: boolean;
  diagramId?: string;
  pageNumber?: number;
  reviewer?: string;
}

export async function exportProject(store: Store, projectId: string, opts: ExportOptions): Promise<{ row: ExportRow; bytes: Buffer; filename: string }> {
  const project = store.getProject(projectId);
  if (!project) throw new ExportRefusedError("Project not found.");
  let revision: RevisionRow | null;
  if (opts.revisionId) {
    revision = store.getRevision(opts.revisionId);
    if (!revision || revision.projectId !== projectId) throw new ExportRefusedError("Revision not found.");
  } else {
    const draft = store.getDraft(projectId);
    if (!draft) throw new ExportRefusedError("There is no document to export yet.");
    const latest = store.listRevisions(projectId)[0];
    const latestDoc = latest ? store.getRevision(latest.id)!.doc : null;
    revision = latest && latestDoc && JSON.stringify(latestDoc) === JSON.stringify(draft.doc) ? store.getRevision(latest.id) : store.createRevision(projectId, draft.doc, "snapshot", "Snapshot for export");
  }
  const doc = revision!.doc;
  const v = validateDocument(doc);
  if (!v.ok) throw new ExportRefusedError(`The document is invalid and cannot be exported: ${v.errors.slice(0, 3).join("; ")}`);
  const approved = revision!.kind === "approved";
  const studentHtml = exportHtml(doc, "student");
  const measured = opts.kind.endsWith("pdf") || opts.kind === "page-png" ? await measureHtml(exportHtml(doc, "educator")) : undefined;
  const report = runQualityChecks(doc, { measuredPages: measured, studentHtml, previous: doc.qualityReport?.issues });
  const blocking = blockingIssues(report);
  // A student export that contains teacher answers is never allowed, draft or not.
  const studentKinds: ExportKind[] = ["student-pdf", "student-html", "plain-text", "page-png"];
  if (studentKinds.includes(opts.kind) && findAnswerLeaks(doc, studentHtml).length) {
    throw new ExportRefusedError("Student output would contain answer-key or teacher text. Export blocked.", blocking);
  }
  if (blocking.length && !opts.allowDraft && !["project-json"].includes(opts.kind)) {
    throw new ExportRefusedError(`${blocking.length} blocking issue(s) must be resolved first, or export a labelled draft.`, blocking.map((b) => ({ code: b.code, message: b.message })));
  }
  const draft = !approved;
  const revisionLabel = `${draft ? "Draft" : "Approved"} r${revision!.number}`;
  const draftLabel = draft ? "DRAFT — NOT APPROVED" : undefined;
  const base = `${slugify(doc.title || doc.question)}-r${revision!.number}`;
  let bytes: Buffer;
  let filename: string;
  switch (opts.kind) {
    case "student-pdf":
    case "answer-key-pdf":
    case "teacher-notes-pdf":
    case "educator-pdf": {
      const variant = opts.kind === "student-pdf" ? "student" : opts.kind === "answer-key-pdf" ? "answer-key" : opts.kind === "teacher-notes-pdf" ? "teacher-notes" : "educator";
      const html = exportHtml(doc, variant, { draftLabel, revisionLabel });
      const { pdf, pages } = await renderPdf(html, doc);
      const clipped = pages.filter((p) => p.overflowPx > 1);
      if (clipped.length && !opts.allowDraft) throw new ExportRefusedError(`Content is clipped on page(s) ${clipped.map((p) => p.page).join(", ")}.`);
      bytes = await stampPdfMetadata(pdf, doc, revisionLabel);
      filename = `${base}-${variant}.pdf`;
      break;
    }
    case "project-json":
      bytes = Buffer.from(JSON.stringify({ format: "curiosity-studio-project", exportedAt: new Date().toISOString(), revision: { id: revision!.id, number: revision!.number, kind: revision!.kind }, document: doc }, null, 2));
      filename = `${base}.json`;
      break;
    case "student-html":
    case "educator-html":
      bytes = Buffer.from(exportHtml(doc, opts.kind === "student-html" ? "student" : "educator", { draftLabel, revisionLabel }));
      filename = `${base}-${opts.kind === "student-html" ? "student" : "educator"}.html`;
      break;
    case "plain-text":
      bytes = Buffer.from(plainText(doc, false));
      filename = `${base}-student.txt`;
      break;
    case "diagram-svg": {
      const d = doc.diagrams.find((x) => x.id === opts.diagramId);
      if (!d) throw new ExportRefusedError("Diagram not found.");
      bytes = Buffer.from(diagramSvg(doc, d, false, `svg-${d.id}`));
      filename = `${base}-${d.id}.svg`;
      break;
    }
    case "page-png":
      bytes = await renderPng(exportHtml(doc, "educator", { draftLabel, revisionLabel }), opts.pageNumber ?? 1);
      filename = `${base}-page-${opts.pageNumber ?? 1}.png`;
      break;
  }
  const cfg = getConfig();
  const dir = path.join(cfg.exportDir, projectId);
  await fs.promises.mkdir(dir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const filePath = path.join(dir, `${stamp}-${filename}`);
  await fs.promises.writeFile(filePath, bytes);
  const row = store.createExport({
    projectId,
    revisionId: revision!.id,
    kind: opts.kind,
    settings: { layout: doc.layout, format: doc.format, allowDraft: Boolean(opts.allowDraft), diagramId: opts.diagramId, pageNumber: opts.pageNumber, generatedAt: new Date().toISOString(), schemaVersion: doc.schemaVersion },
    filePath,
    sha256: crypto.createHash("sha256").update(bytes).digest("hex"),
    draft,
    unresolved: report.issues.filter((i) => i.resolutionStatus === "open" && i.severity !== "info").map((i) => ({ code: i.code, severity: i.severity, message: i.message })),
  });
  if (approved && opts.kind.endsWith("pdf")) store.updateProject(projectId, { status: "exported" });
  return { row, bytes, filename };
}

async function stampPdfMetadata(pdf: Buffer, doc: WorksheetDocument, revisionLabel: string): Promise<Buffer> {
  const p = await PDFDocument.load(pdf);
  p.setTitle(doc.title || doc.question);
  p.setSubject(`${doc.subject} — ${revisionLabel}`);
  p.setProducer("Curiosity Studio");
  p.setCreator("Curiosity Studio");
  p.setKeywords([revisionLabel, `schema ${doc.schemaVersion}`]);
  p.setCreationDate(new Date());
  p.setLanguage(doc.audience.regionalConventions.spelling);
  return Buffer.from(await p.save());
}

// ---------------------------------------------------------------- workbooks

function workbookFrontMatter(title: string, docs: WorksheetDocument[], cumulative: boolean): string {
  const layout = docs[0].layout;
  const review = cumulative
    ? docs
        .slice(0, -1)
        .map((d, i) => {
          const ideas = d.learningPlan.objectives.map((o) => `<li>${escapeHtml(o.text)}</li>`).join("");
          return `<section class="blk"><h2>${i + 1}. ${escapeHtml(d.question)}</h2><p>Without looking back: what do you remember?</p><ul>${ideas}</ul><div class="lines">${'<div class="ln"></div>'.repeat(3)}</div></section>`;
        })
        .join("")
    : "";
  const css = fontFaceCss(inlineFontSrc()) + worksheetCss(layout);
  const page = (inner: string, flow: boolean) => `<div class="page"${flow ? ' data-flow="1"' : ""} data-kind="Workbook"><div class="page-head"><span>${escapeHtml(layout.brand.name)}</span><span></span></div><div class="page-body">${inner}</div><div class="page-foot"><span>${escapeHtml(layout.brand.copyright)}</span><span></span></div></div>`;
  const toc = `<header class="titleblock"><p class="eyebrow">Workbook</p><h1 class="question">${escapeHtml(title)}</h1></header><ol>${docs.map((d) => `<li>${escapeHtml(d.question)}</li>`).join("")}</ol>`;
  const pages = [page(toc, false)];
  if (review) pages.push(page(`<div class="flow"><header class="titleblock"><p class="eyebrow">Cumulative review</p><h1 class="question" style="font-size:20pt">Looking back</h1></header>${review}</div>`, true));
  // Reuse the paginator from the worksheet renderer.
  const script = renderWorksheetHtml(docs[0], { variant: "student", fontSrc: () => "" }).match(/<script>([\s\S]*?)<\/script>/)?.[1] ?? "";
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${escapeHtml(title)}</title><style>${css}</style></head><body><div class="doc">${pages.join("")}</div><script>${script}</script></body></html>`;
}

export async function compileWorkbook(store: Store, workbookId: string, opts: { allowDraft?: boolean } = {}): Promise<{ bytes: Buffer; filename: string; notes: string[] }> {
  const wb = store.getWorkbook(workbookId);
  if (!wb) throw new ExportRefusedError("Workbook not found.");
  const notes: string[] = [];
  const docs: { doc: WorksheetDocument; approved: boolean }[] = [];
  for (const pid of wb.projectIds) {
    const approved = store.latestApproved(pid);
    const draft = store.getDraft(pid);
    const doc = approved?.doc ?? draft?.doc;
    if (!doc) {
      notes.push(`Skipped ${pid}: no document.`);
      continue;
    }
    if (!approved) {
      if (!opts.allowDraft) throw new ExportRefusedError(`"${doc.question}" has no approved revision.`);
      notes.push(`"${doc.question}" is included as an unapproved draft.`);
    }
    docs.push({ doc, approved: Boolean(approved) });
  }
  if (!docs.length) throw new ExportRefusedError("The workbook has no worksheets.");
  const out = await PDFDocument.create();
  const append = async (pdf: Buffer) => {
    const src = await PDFDocument.load(pdf);
    const pages = await out.copyPages(src, src.getPageIndices());
    pages.forEach((p) => out.addPage(p));
  };
  await append((await renderPdf(workbookFrontMatter(wb.title, docs.map((d) => d.doc), wb.settings.cumulativeReview), docs[0].doc)).pdf);
  for (const { doc, approved } of docs) {
    await append((await renderPdf(exportHtml(doc, "student", { revisionLabel: approved ? "Approved" : "Draft" }), doc)).pdf);
  }
  if (wb.settings.includeAnswerKey) {
    for (const { doc, approved } of docs) await append((await renderPdf(exportHtml(doc, "answer-key", { draftLabel: approved ? undefined : "DRAFT — NOT APPROVED" }), doc)).pdf);
  }
  out.setTitle(wb.title);
  out.setProducer("Curiosity Studio");
  if (new Set(docs.map((d) => d.doc.layout.pageSize)).size > 1) notes.push("Worksheets use different page sizes; each keeps its own size.");
  return { bytes: Buffer.from(await out.save()), filename: `${slugify(wb.title)}-workbook.pdf`, notes };
}
