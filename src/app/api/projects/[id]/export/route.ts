import { getStore } from "@/lib/server/context";
import { guard, handleError, readJson } from "@/lib/server/http";
import { EXPORT_KINDS, exportProject, mimeFor, type ExportKind } from "@/lib/export/exporter";
import { ServiceError } from "@/lib/server/services";

export const runtime = "nodejs";

// One export at a time per project: repeated clicks wait for the first.
const inflight = new Map<string, Promise<unknown>>();

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = guard(req);
  if (g) return g;
  try {
    const { id } = await params;
    const body = await readJson<{ kind: ExportKind; revisionId?: string; allowDraft?: boolean; diagramId?: string; pageNumber?: number }>(req);
    if (!EXPORT_KINDS.includes(body.kind)) throw new ServiceError("Unknown export type.");
    const prev = inflight.get(id);
    if (prev) await prev.catch(() => undefined);
    const p = exportProject(getStore(), id, body);
    inflight.set(id, p);
    try {
      const { row, bytes, filename } = await p;
      return new Response(new Uint8Array(bytes), {
        headers: {
          "Content-Type": mimeFor(filename),
          "Content-Disposition": `attachment; filename="${filename.replace(/[^a-zA-Z0-9._-]/g, "_")}"`,
          "X-Export-Id": row.id,
          "X-Export-Draft": row.draft ? "1" : "0",
          "Cache-Control": "no-store",
        },
      });
    } finally {
      if (inflight.get(id) === p) inflight.delete(id);
    }
  } catch (e) {
    return handleError(e);
  }
}
