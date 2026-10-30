/**
 * Curriculum alignment against a document the editor supplies.
 *
 * An expectation counts as "verified" only when its wording (and its code,
 * if one is given) is found verbatim — ignoring whitespace and case — in the
 * stored curriculum text. Nothing else (a model's confidence, a topic
 * overlap) can mark an alignment verified, and codes are never generated.
 */
import { randomUUID } from "node:crypto";
import type { CurriculumDocRef, ProjectSettings } from "./db/store";
import type { WorksheetDocument } from "./schema/document";
import { getStorage } from "./storage";

type CurriculumItem = WorksheetDocument["teacherNotes"]["curriculum"]["items"][number];
type Curriculum = WorksheetDocument["teacherNotes"]["curriculum"];

export class CurriculumInputError extends Error {}

const MAX_CHARS = 400_000;

export async function addCurriculumDoc(projectId: string, input: { title: string; jurisdiction?: string; version?: string; text: string }): Promise<CurriculumDocRef> {
  const text = input.text.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").trim().slice(0, MAX_CHARS);
  if (text.length < 80) throw new CurriculumInputError("Paste or upload the curriculum text (at least a few lines).");
  if (!input.title.trim()) throw new CurriculumInputError("Give the curriculum document a title.");
  const key = `curriculum/${projectId}/${randomUUID()}.txt`;
  await getStorage().put(key, text);
  return {
    id: `cur-${randomUUID().slice(0, 8)}`,
    title: input.title.trim().slice(0, 200),
    jurisdiction: (input.jurisdiction ?? "").trim().slice(0, 120),
    version: (input.version ?? "").trim().slice(0, 80),
    storageKey: key,
    addedAt: new Date().toISOString(),
    chars: text.length,
  };
}

export async function loadCurriculumTexts(settings: ProjectSettings): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const d of settings.curriculumDocs ?? []) {
    try {
      out[d.id] = (await getStorage().get(d.storageKey)).toString("utf8");
    } catch {
      /* missing file: treated as unavailable */
    }
  }
  return out;
}

const norm = (s: string) => s.toLowerCase().replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/\s+/g, " ").trim();

/**
 * Where in the document a passage sits: its line number and the nearest
 * heading-like line above it (short, no closing punctuation, not itself an
 * expectation starting with a code).
 */
function locate(text: string, quote: string): string | undefined {
  const lines = text.split("\n");
  const probe = norm(quote).slice(0, 40);
  const at = lines.findIndex((l) => norm(l).includes(probe));
  if (at < 0) return undefined;
  for (let i = at - 1; i >= 0; i--) {
    const l = lines[i].trim();
    if (!l || l.length > 90 || /[.;:,]$/.test(l)) continue;
    if (/^[A-Z]{0,3}\d+(\.\d+)*[a-z]?\b/.test(l)) continue;
    return `line ${at + 1}, under “${l.slice(0, 80)}”`;
  }
  return `line ${at + 1}`;
}

export interface VerifiedItem extends CurriculumItem {
  problem?: string;
}

/** Check each mapping against the stored documents; never upgrades wording or invents a code. */
export function verifyItems(items: CurriculumItem[], texts: Record<string, string>): VerifiedItem[] {
  return items.map((it) => {
    const candidates = it.documentId && texts[it.documentId] ? [[it.documentId, texts[it.documentId]] as const] : Object.entries(texts);
    if (!candidates.length) return { ...it, verifiedInDocument: false, problem: "No curriculum document is stored for this project." };
    const q = norm(it.expectation);
    if (q.length < 12) return { ...it, verifiedInDocument: false, problem: "Quote the expectation's full wording." };
    for (const [docId, text] of candidates) {
      const t = norm(text);
      if (!t.includes(q)) continue;
      if (it.code && !t.includes(norm(it.code))) {
        return { ...it, documentId: docId, verifiedInDocument: false, problem: `The code “${it.code}” does not appear in the document.` };
      }
      return { ...it, documentId: docId, location: it.location || locate(text, it.expectation), verifiedInDocument: true, problem: undefined };
    }
    return { ...it, verifiedInDocument: false, problem: "This wording was not found in the curriculum document. Copy it exactly." };
  });
}

export function curriculumStatus(items: CurriculumItem[]): Curriculum["status"] {
  if (!items.length) return "none";
  return items.every((i) => i.verifiedInDocument) ? "verified-from-document" : "suggested-unverified";
}

export function applyVerified(curriculum: Curriculum, items: VerifiedItem[], doc?: CurriculumDocRef): Curriculum {
  const clean = items.map(({ problem: _p, ...i }) => (void _p, i));
  return {
    ...curriculum,
    items: clean,
    status: curriculumStatus(clean),
    documentTitle: doc?.title ?? curriculum.documentTitle,
    documentVersion: doc?.version || curriculum.documentVersion,
    jurisdiction: doc?.jurisdiction || curriculum.jurisdiction,
  };
}
