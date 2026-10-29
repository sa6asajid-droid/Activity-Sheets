import { getStore } from "@/lib/server/context";
import { guard, handleError, json, readJson } from "@/lib/server/http";
import { ServiceError } from "@/lib/server/services";

export const runtime = "nodejs";

export async function GET() {
  return json({ workbooks: getStore().listWorkbooks() });
}

export async function POST(req: Request) {
  const g = guard(req);
  if (g) return g;
  try {
    const body = await readJson<{ title: string; projectIds: string[]; cumulativeReview?: boolean; includeAnswerKey?: boolean }>(req);
    if (!body.title?.trim()) throw new ServiceError("Give the workbook a title.");
    const wb = getStore().createWorkbook(body.title.slice(0, 200), (body.projectIds ?? []).slice(0, 60), { cumulativeReview: body.cumulativeReview ?? true, includeAnswerKey: body.includeAnswerKey ?? true });
    return json({ workbook: wb }, 201);
  } catch (e) {
    return handleError(e);
  }
}
