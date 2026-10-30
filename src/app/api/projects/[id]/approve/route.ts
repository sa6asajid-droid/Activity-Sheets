import { getStore } from "@/lib/server/context";
import { guard, handleError, json, readJson } from "@/lib/server/http";
import { approve } from "@/lib/server/services";

export const runtime = "nodejs";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = guard(req);
  if (g) return g;
  try {
    const { id } = await params;
    const { reviewer, note } = await readJson<{ reviewer: string; note: string }>(req);
    const r = approve(getStore(), id, reviewer ?? "", note ?? "");
    return json({ revision: { id: r.id, number: r.number } });
  } catch (e) {
    return handleError(e);
  }
}
