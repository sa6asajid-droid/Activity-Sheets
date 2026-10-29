import { getStore } from "@/lib/server/context";
import { guard, handleError, json, readJson } from "@/lib/server/http";
import { recheck, saveDraft } from "@/lib/server/services";
import { validateDocument, type WorksheetDocument } from "@/lib/schema/document";
import type { MeasuredPage } from "@/lib/quality/checks";
import { renderWorksheetHtml } from "@/lib/render/worksheet";

export const runtime = "nodejs";

/** Autosave: validate, re-run deterministic checks with the browser's measurements, save with version check. */
export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = guard(req);
  if (g) return g;
  try {
    const { id } = await params;
    const body = await readJson<{ doc: WorksheetDocument; baseVersion: number; measuredPages?: MeasuredPage[] }>(req, 6_000_000);
    const v = validateDocument(body.doc);
    const doc = v.ok ? recheck(v.doc, body.measuredPages, renderWorksheetHtml(v.doc, { variant: "student", fontSrc: () => "" })) : body.doc;
    const { version } = saveDraft(getStore(), id, doc, body.baseVersion);
    return json({ version, qualityReport: doc.qualityReport });
  } catch (e) {
    return handleError(e);
  }
}
