import { getStore } from "@/lib/server/context";
import { guard, handleError, json, readJson } from "@/lib/server/http";
import { acceptProposal } from "@/lib/server/services";

export const runtime = "nodejs";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = guard(req);
  if (g) return g;
  try {
    const { id } = await params;
    const { jobId, reject } = await readJson<{ jobId: string; reject?: boolean }>(req);
    const store = getStore();
    if (reject) {
      store.updateJob(jobId, { message: "accepted" });
      return json({ ok: true });
    }
    return json(acceptProposal(store, id, jobId));
  } catch (e) {
    return handleError(e);
  }
}
