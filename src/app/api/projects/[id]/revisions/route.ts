import { getStore } from "@/lib/server/context";
import { guard, handleError, json, readJson } from "@/lib/server/http";
import { snapshot } from "@/lib/server/services";

export const runtime = "nodejs";
type P = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: P) {
  const { id } = await params;
  return json({ revisions: getStore().listRevisions(id) });
}

export async function POST(req: Request, { params }: P) {
  const g = guard(req);
  if (g) return g;
  try {
    const { id } = await params;
    const { label } = await readJson<{ label: string }>(req);
    const r = snapshot(getStore(), id, label ?? "");
    return json({ revision: { id: r.id, number: r.number, label: r.label } }, 201);
  } catch (e) {
    return handleError(e);
  }
}
