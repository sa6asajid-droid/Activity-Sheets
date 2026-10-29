import { getDeps } from "@/lib/server/context";
import { guard, handleError, json, readJson } from "@/lib/server/http";
import { relayout } from "@/lib/server/services";
import { validateDocument, type WorksheetDocument } from "@/lib/schema/document";

export const runtime = "nodejs";

/** Re-flow student pages by measuring sections in the browser engine (falls back to estimates). */
export async function POST(req: Request) {
  const g = guard(req);
  if (g) return g;
  try {
    const { doc } = await readJson<{ doc: WorksheetDocument }>(req, 6_000_000);
    const v = validateDocument(doc);
    if (!v.ok) return json({ error: v.errors[0] }, 422);
    const layout = getDeps().layout;
    const out = layout ? await layout.autoPaginate(v.doc).catch(() => relayout(v.doc)) : relayout(v.doc);
    return json({ sections: out.sections.map((s) => ({ id: s.id, page: s.page })), measured: Boolean(layout) });
  } catch (e) {
    return handleError(e);
  }
}
