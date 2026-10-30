import { getDeps, getStore, startJob } from "@/lib/server/context";
import { guard, handleError, json, readJson } from "@/lib/server/http";
import { ServiceError } from "@/lib/server/services";

export const runtime = "nodejs";

/** Ask the model to propose mappings; only verbatim-verified ones come back. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = guard(req);
  if (g) return g;
  try {
    const { id } = await params;
    const store = getStore();
    const deps = getDeps();
    if (!deps.text) throw new ServiceError("No AI provider is configured. You can still enter mappings by hand and verify them.", 409);
    const draft = store.getDraft(id);
    if (!draft) throw new ServiceError("There is no worksheet to map yet.");
    const { docId } = await readJson<{ docId: string }>(req);
    const active = store.activeJob(id);
    if (active) return json({ jobId: active.id }, 202);
    const job = store.createJob(id, "curriculum-map", { docId, doc: draft.doc });
    void startJob(job.id);
    return json({ jobId: job.id }, 202);
  } catch (e) {
    return handleError(e);
  }
}
