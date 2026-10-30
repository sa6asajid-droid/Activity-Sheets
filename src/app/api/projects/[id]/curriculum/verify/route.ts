import { getStore } from "@/lib/server/context";
import { guard, handleError, json, readJson } from "@/lib/server/http";
import { ServiceError } from "@/lib/server/services";
import { curriculumStatus, loadCurriculumTexts, verifyItems } from "@/lib/curriculum";
import type { WorksheetDocument } from "@/lib/schema/document";

export const runtime = "nodejs";

/** Check mappings verbatim against the stored curriculum documents. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = guard(req);
  if (g) return g;
  try {
    const { id } = await params;
    const p = getStore().getProject(id);
    if (!p) throw new ServiceError("Project not found", 404);
    const { items } = await readJson<{ items: WorksheetDocument["teacherNotes"]["curriculum"]["items"] }>(req);
    const verified = verifyItems((items ?? []).slice(0, 40), await loadCurriculumTexts(p.settings));
    return json({ items: verified, status: curriculumStatus(verified) });
  } catch (e) {
    return handleError(e);
  }
}
