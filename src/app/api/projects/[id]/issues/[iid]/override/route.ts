import { getStore } from "@/lib/server/context";
import { guard, handleError, json, readJson } from "@/lib/server/http";
import { overrideIssue } from "@/lib/server/services";

export const runtime = "nodejs";

export async function POST(req: Request, { params }: { params: Promise<{ id: string; iid: string }> }) {
  const g = guard(req);
  if (g) return g;
  try {
    const { id, iid } = await params;
    const { reason, reviewer } = await readJson<{ reason: string; reviewer: string }>(req);
    const doc = overrideIssue(getStore(), id, iid, reason ?? "", reviewer ?? "");
    return json({ qualityReport: doc.qualityReport, version: getStore().getDraft(id)!.version });
  } catch (e) {
    return handleError(e);
  }
}
