import { getStore } from "@/lib/server/context";
import { guard, handleError, json, readJson } from "@/lib/server/http";
import type { WorkbookRow } from "@/lib/db/store";

export const runtime = "nodejs";
type P = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, { params }: P) {
  const g = guard(req);
  if (g) return g;
  try {
    const { id } = await params;
    const body = await readJson<Partial<Pick<WorkbookRow, "title" | "projectIds" | "settings">>>(req);
    return json({ workbook: getStore().updateWorkbook(id, body) });
  } catch (e) {
    return handleError(e);
  }
}

export async function DELETE(req: Request, { params }: P) {
  const g = guard(req);
  if (g) return g;
  const { id } = await params;
  getStore().deleteWorkbook(id);
  return json({ ok: true });
}
