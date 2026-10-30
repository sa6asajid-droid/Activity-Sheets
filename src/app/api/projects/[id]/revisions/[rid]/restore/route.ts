import { getStore } from "@/lib/server/context";
import { guard, handleError, json } from "@/lib/server/http";
import { restoreRevision } from "@/lib/server/services";

export const runtime = "nodejs";

export async function POST(req: Request, { params }: { params: Promise<{ id: string; rid: string }> }) {
  const g = guard(req);
  if (g) return g;
  try {
    const { id, rid } = await params;
    return json({ draft: restoreRevision(getStore(), id, rid) });
  } catch (e) {
    return handleError(e);
  }
}
