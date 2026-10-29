import { getStore } from "@/lib/server/context";
import { guard, handleError, json } from "@/lib/server/http";
import { ServiceError, updateSettings } from "@/lib/server/services";
import { getStorage } from "@/lib/storage";

export const runtime = "nodejs";

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string; sid: string }> }) {
  const g = guard(req);
  if (g) return g;
  try {
    const { id, sid } = await params;
    const store = getStore();
    const p = store.getProject(id);
    if (!p) throw new ServiceError("Project not found", 404);
    const ref = p.settings.userSources.find((s) => s.id === sid);
    if (ref) await getStorage().delete(ref.storageKey).catch(() => undefined);
    const updated = updateSettings(store, id, { userSources: p.settings.userSources.filter((s) => s.id !== sid) });
    return json({ userSources: updated.settings.userSources });
  } catch (e) {
    return handleError(e);
  }
}
