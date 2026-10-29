import { getDeps, getStore, startJob } from "@/lib/server/context";
import { guard, handleError, json, readJson } from "@/lib/server/http";
import { startRegenerate } from "@/lib/server/services";

export const runtime = "nodejs";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = guard(req);
  if (g) return g;
  try {
    const { id } = await params;
    const { sectionId, instruction } = await readJson<{ sectionId: string; instruction: string }>(req);
    const job = startRegenerate(getStore(), getDeps(), id, sectionId, instruction ?? "", (jid) => startJob(jid));
    return json({ jobId: job.id }, 202);
  } catch (e) {
    return handleError(e);
  }
}
