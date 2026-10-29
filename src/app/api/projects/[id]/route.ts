import { getStore } from "@/lib/server/context";
import { guard, handleError, json, readJson } from "@/lib/server/http";
import { ServiceError, updateSettings } from "@/lib/server/services";
import { STAGE_LABELS } from "@/lib/pipeline/pipeline";
import type { ProjectRow, ProjectSettings } from "@/lib/db/store";

export const runtime = "nodejs";
type P = { params: Promise<{ id: string }> };

function jobView(j: ReturnType<ReturnType<typeof getStore>["getJob"]>) {
  if (!j) return null;
  const { stages, input, ...rest } = j;
  void input;
  return { ...rest, stageLabel: STAGE_LABELS[j.stage] ?? j.stage, completedStages: Object.keys(stages) };
}

export async function GET(_req: Request, { params }: P) {
  try {
    const { id } = await params;
    const store = getStore();
    const project = store.getProject(id);
    if (!project) throw new ServiceError("Project not found", 404);
    const draft = store.getDraft(id);
    const latestRegen = store.latestJob(id, "regenerate-section");
    return json({
      project,
      draft,
      jobs: {
        active: jobView(store.activeJob(id)),
        plan: jobView(store.latestJob(id, "plan")),
        build: jobView(store.latestJob(id, "build")),
        regenerate: latestRegen ? { ...jobView(latestRegen), proposal: latestRegen.status === "succeeded" && latestRegen.message !== "accepted" ? (latestRegen.stages.regenerate as { proposal: unknown } | undefined)?.proposal ?? null : null } : null,
      },
      usage: store.projectUsage(id),
      revisions: store.listRevisions(id),
      exports: store.listExports(id).map(({ filePath, ...e }) => (void filePath, e)),
      decisions: store.listDecisions(id),
    });
  } catch (e) {
    return handleError(e);
  }
}

export async function PATCH(req: Request, { params }: P) {
  const g = guard(req);
  if (g) return g;
  try {
    const { id } = await params;
    const store = getStore();
    const body = await readJson<Partial<Pick<ProjectRow, "title" | "folder" | "archived">> & { settings?: Partial<ProjectSettings> }>(req);
    if (body.settings) updateSettings(store, id, body.settings);
    const patch: Partial<ProjectRow> = {};
    if (typeof body.title === "string") patch.title = body.title.slice(0, 200);
    if (typeof body.folder === "string") patch.folder = body.folder.slice(0, 80);
    if (typeof body.archived === "boolean") patch.archived = body.archived;
    const p = Object.keys(patch).length ? store.updateProject(id, patch) : store.getProject(id);
    return json({ project: p });
  } catch (e) {
    return handleError(e);
  }
}

export async function DELETE(req: Request, { params }: P) {
  const g = guard(req);
  if (g) return g;
  try {
    const { id } = await params;
    getStore().deleteProject(id);
    return json({ ok: true });
  } catch (e) {
    return handleError(e);
  }
}
