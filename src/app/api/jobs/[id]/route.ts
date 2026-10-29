import { cancelJob, getStore, isJobRunning, startJob } from "@/lib/server/context";
import { guard, handleError, json, readJson } from "@/lib/server/http";
import { answerClarification, approveBudget, resumeJob, ServiceError } from "@/lib/server/services";
import { STAGE_LABELS, stagesFor } from "@/lib/pipeline/pipeline";

export const runtime = "nodejs";
type P = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: P) {
  try {
    const { id } = await params;
    const store = getStore();
    const j = store.getJob(id);
    if (!j) throw new ServiceError("Job not found", 404);
    const interp = j.stages.interpret as { ambiguities?: unknown[]; needsClarification?: boolean } | undefined;
    return json({
      job: {
        id: j.id,
        projectId: j.projectId,
        kind: j.kind,
        stage: j.stage,
        stageLabel: STAGE_LABELS[j.stage] ?? j.stage,
        status: j.status,
        error: j.error,
        message: j.message,
        attempts: j.attempts,
        actualUsage: j.actualUsage,
        costEstimateUsd: j.costEstimateUsd,
        stages: stagesFor(j.kind).map((s) => ({ key: s, label: STAGE_LABELS[s], done: s in j.stages, current: j.stage === s && (j.status === "running" || j.status === "queued") })),
        clarification: j.status === "awaiting-input" && interp?.needsClarification ? interp.ambiguities : null,
        running: isJobRunning(j.id),
        providerMetadata: j.providerMetadata,
      },
    });
  } catch (e) {
    return handleError(e);
  }
}

export async function POST(req: Request, { params }: P) {
  const g = guard(req);
  if (g) return g;
  try {
    const { id } = await params;
    const store = getStore();
    const body = await readJson<{ action: "cancel" | "resume" | "clarify" | "budget"; answers?: { question: string; answer: string }[]; extraUsd?: number }>(req);
    const j = store.getJob(id);
    if (!j) throw new ServiceError("Job not found", 404);
    const start = (jid: string) => startJob(jid);
    switch (body.action) {
      case "cancel":
        cancelJob(id);
        break;
      case "resume":
        resumeJob(store, id, start);
        break;
      case "clarify":
        answerClarification(store, j.projectId, id, body.answers ?? [], start);
        break;
      case "budget":
        approveBudget(store, j.projectId, id, Number(body.extraUsd ?? 0), start);
        break;
      default:
        throw new ServiceError("Unknown action");
    }
    return json({ ok: true });
  } catch (e) {
    return handleError(e);
  }
}
