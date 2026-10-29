import { getDeps, getStore, startJob } from "@/lib/server/context";
import { guard, handleError, json } from "@/lib/server/http";
import { getPlanReview, startPlan } from "@/lib/server/services";

export const runtime = "nodejs";
type P = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: P) {
  try {
    const { id } = await params;
    return json({ review: getPlanReview(getStore(), id) });
  } catch (e) {
    return handleError(e);
  }
}

export async function POST(req: Request, { params }: P) {
  const g = guard(req);
  if (g) return g;
  try {
    const { id } = await params;
    const job = startPlan(getStore(), getDeps(), id, (jid) => startJob(jid));
    return json({ jobId: job.id }, 202);
  } catch (e) {
    return handleError(e);
  }
}
