/**
 * Pure editing operations on the structured document. Every editor action is
 * one of these, so edits stay inside the schema and are easy to test.
 * Locked sections are never changed by these operations.
 */
import type { Activity, AnswerKeyEntry, Diagram, Section, WorksheetDocument } from "../schema/document";

const uid = (prefix: string, taken: Set<string>) => {
  let i = 2;
  let id = `${prefix}-${Math.random().toString(36).slice(2, 7)}`;
  while (taken.has(id)) id = `${prefix}-${Math.random().toString(36).slice(2, 7)}${i++}`;
  return id;
};

function allIds(doc: WorksheetDocument) {
  return new Set([...doc.sections.map((s) => s.id), ...doc.activities.map((a) => a.id), ...doc.answerKey.map((k) => k.id), ...doc.diagrams.map((d) => d.id)]);
}

export function isLocked(doc: WorksheetDocument, sectionId: string) {
  return doc.sections.find((s) => s.id === sectionId)?.locked ?? false;
}

export function updateSection(doc: WorksheetDocument, id: string, patch: Partial<Section>): WorksheetDocument {
  const s = doc.sections.find((x) => x.id === id);
  if (!s) return doc;
  // Only the lock itself (and page placement) may change on a locked section.
  if (s.locked && Object.keys(patch).some((k) => !["locked", "page"].includes(k))) return doc;
  return { ...doc, sections: doc.sections.map((x) => (x.id === id ? { ...x, ...patch } : x)) };
}

function sectionForActivity(doc: WorksheetDocument, activityId: string) {
  return doc.sections.find((s) => s.activityId === activityId);
}

export function updateActivity(doc: WorksheetDocument, id: string, patch: Partial<Activity>): WorksheetDocument {
  if (sectionForActivity(doc, id)?.locked) return doc;
  return { ...doc, activities: doc.activities.map((a) => (a.id === id ? { ...a, ...patch } : a)) };
}

export function updateAnswer(doc: WorksheetDocument, id: string, patch: Partial<AnswerKeyEntry>): WorksheetDocument {
  const k = doc.answerKey.find((x) => x.id === id);
  if (k && sectionForActivity(doc, k.activityId)?.locked) return doc;
  return { ...doc, answerKey: doc.answerKey.map((x) => (x.id === id ? { ...x, ...patch } : x)) };
}

export function updateDiagram(doc: WorksheetDocument, id: string, patch: Partial<Diagram>): WorksheetDocument {
  const owner = doc.sections.find((s) => s.diagramId === id);
  if (owner?.locked) return doc;
  return { ...doc, diagrams: doc.diagrams.map((d) => (d.id === id ? { ...d, ...patch } : d)) };
}

export function moveSection(doc: WorksheetDocument, id: string, dir: -1 | 1): WorksheetDocument {
  const i = doc.sections.findIndex((s) => s.id === id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= doc.sections.length) return doc;
  const sections = [...doc.sections];
  [sections[i], sections[j]] = [sections[j], sections[i]];
  // Keep the moved section on the page of its new neighbour.
  sections[j] = { ...sections[j], page: sections[i].page };
  return { ...doc, sections };
}

export function setPage(doc: WorksheetDocument, id: string, page: number): WorksheetDocument {
  return updateSection(doc, id, { page: Math.max(1, Math.min(40, page)) });
}

export function applyPages(doc: WorksheetDocument, pages: { id: string; page: number }[]): WorksheetDocument {
  const m = new Map(pages.map((p) => [p.id, p.page]));
  return { ...doc, sections: doc.sections.map((s) => (m.has(s.id) ? { ...s, page: m.get(s.id)! } : s)) };
}

/** Deep-copy a section, including its activity and answer-key entry, with fresh IDs. */
export function duplicateSection(doc: WorksheetDocument, id: string, targetPage?: number): WorksheetDocument {
  const i = doc.sections.findIndex((s) => s.id === id);
  if (i < 0) return doc;
  const taken = allIds(doc);
  const src = doc.sections[i];
  const copy: Section = { ...structuredClone(src), id: uid("sec", taken), locked: false, page: targetPage ?? src.page };
  let activities = doc.activities;
  let answerKey = doc.answerKey;
  if (src.activityId) {
    const a = doc.activities.find((x) => x.id === src.activityId);
    if (a) {
      const newId = uid("act", taken);
      const keyId = `key-${newId}`;
      activities = [...activities, { ...structuredClone(a), id: newId, answerKeyId: keyId }];
      const k = doc.answerKey.find((x) => x.id === a.answerKeyId);
      if (k) answerKey = [...answerKey, { ...structuredClone(k), id: keyId, activityId: newId }];
      copy.activityId = newId;
    }
  }
  const sections = [...doc.sections];
  sections.splice(i + 1, 0, copy);
  return { ...doc, sections, activities, answerKey };
}

/** Copy every section on a page onto a new page placed after the last page. */
export function duplicatePage(doc: WorksheetDocument, page: number): WorksheetDocument {
  const last = Math.max(...doc.sections.map((s) => s.page));
  let out = doc;
  for (const s of doc.sections.filter((x) => x.page === page)) {
    const before = new Set(out.sections.map((x) => x.id));
    out = duplicateSection(out, s.id, last + 1);
    const added = out.sections.find((x) => !before.has(x.id))!;
    // Move duplicates to the end, in order.
    out = { ...out, sections: [...out.sections.filter((x) => x.id !== added.id), added] };
  }
  return out;
}

export function addSection(doc: WorksheetDocument, kind: Section["kind"], afterId?: string): WorksheetDocument {
  const taken = allIds(doc);
  const i = afterId ? doc.sections.findIndex((s) => s.id === afterId) : doc.sections.length - 1;
  const page = doc.sections[i]?.page ?? 1;
  const s: Section = { id: uid("sec", taken), kind, heading: kind === "note" ? "" : "New section", body: "", terms: [], page, optional: true, hidden: false, locked: false, keepWithNext: false, claimIds: [] };
  if (kind === "activity") {
    const actId = uid("act", taken);
    const keyId = `key-${actId}`;
    const obj = doc.learningPlan.objectives[0].id;
    const sections = [...doc.sections];
    sections.splice(i + 1, 0, { ...s, heading: "", activityId: actId });
    return {
      ...doc,
      sections,
      activities: [...doc.activities, { id: actId, objectiveIds: [obj], type: "short-answer", title: "New activity", instructions: "", responseMode: "write", supportLevel: "standard", supportOptions: { wordBank: [] }, items: [{ id: "a", prompt: "Question", options: [], answerLines: 2 }], required: false, scored: false, answerKeyId: keyId, computations: [], coverInstruction: false }],
      answerKey: [...doc.answerKey, { id: keyId, activityId: actId, answer: "Write the answer here.", itemAnswers: [], reasoning: "", acceptableAlternatives: [], rubric: [], commonErrors: [] }],
    };
  }
  const sections = [...doc.sections];
  sections.splice(i + 1, 0, s);
  return { ...doc, sections };
}

export function removeSection(doc: WorksheetDocument, id: string): WorksheetDocument {
  const s = doc.sections.find((x) => x.id === id);
  if (!s || s.locked) return doc;
  const sections = doc.sections.filter((x) => x.id !== id);
  let { activities, answerKey } = doc;
  if (s.activityId && !sections.some((x) => x.activityId === s.activityId)) {
    const a = doc.activities.find((x) => x.id === s.activityId);
    activities = activities.filter((x) => x.id !== s.activityId);
    answerKey = answerKey.filter((k) => k.id !== a?.answerKeyId);
  }
  return { ...doc, sections, activities, answerKey, learningPlan: { ...doc.learningPlan, assessmentMap: doc.learningPlan.assessmentMap.map((m) => ({ ...m, activityIds: m.activityIds.filter((x) => activities.some((a) => a.id === x)) })) } };
}

export function studentPageCount(doc: WorksheetDocument) {
  return Math.max(1, ...doc.sections.filter((s) => !s.hidden).map((s) => s.page));
}

/** Add an empty figure section to be filled with an uploaded, reviewed image. */
export function addImageFigure(doc: WorksheetDocument, afterId?: string): { doc: WorksheetDocument; sectionId: string; diagramId: string } {
  const taken = allIds(doc);
  const i = afterId ? doc.sections.findIndex((s) => s.id === afterId) : doc.sections.length - 1;
  const page = doc.sections[i]?.page ?? 1;
  const diagramId = uid("fig", taken);
  const sectionId = uid("sec", taken);
  const diagram: Diagram = {
    id: diagramId,
    teachingPurpose: "Uploaded figure",
    lossIfRemoved: "",
    // Placeholder frame shown until an image is uploaded; never presented as content.
    spec: { type: "labelled-scene", width: 600, height: 300, primitives: [{ shape: "rect", x: 2, y: 2, w: 596, h: 296, rx: 6, fill: "none" }], callouts: [], legend: [] },
    caption: "",
    altText: "Image to be uploaded",
    longDescription: "",
    provenance: { kind: "uploaded-image", note: "Uploaded by the editor.", rights: "unknown" },
    reviewStatus: "unreviewed",
    decorative: false,
    labelOverrides: {},
    widthPct: 80,
  };
  const sections = [...doc.sections];
  sections.splice(i + 1, 0, { id: sectionId, kind: "diagram", heading: "", body: "", terms: [], diagramId, page, optional: true, hidden: false, locked: false, keepWithNext: false, claimIds: [] });
  return { doc: { ...doc, sections, diagrams: [...doc.diagrams, diagram] }, sectionId, diagramId };
}
