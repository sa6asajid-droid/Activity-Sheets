import { getDeps, getStore, startJob } from "@/lib/server/context";
import { guard, handleError, json, readJson } from "@/lib/server/http";
import { startBuild } from "@/lib/server/services";
import type { PlanOutT } from "@/lib/pipeline/llm-schemas";
import type { Claim, Source } from "@/lib/schema/document";

export const runtime = "nodejs";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = guard(req);
  if (g) return g;
  try {
    const { id } = await params;
    const body = await readJson<{ plan: PlanOutT; claims: Claim[]; sources?: Source[] }>(req);
    const job = startBuild(getStore(), getDeps(), id, body, (jid) => startJob(jid));
    return json({ jobId: job.id }, 202);
  } catch (e) {
    return handleError(e);
  }
}
