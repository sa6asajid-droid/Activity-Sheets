import { getStore } from "@/lib/server/context";
import { guard, handleError, json, readJson } from "@/lib/server/http";
import { duplicateProject } from "@/lib/server/services";

export const runtime = "nodejs";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = guard(req);
  if (g) return g;
  try {
    const { id } = await params;
    const body = await readJson<{ title?: string; differentiation?: "more-support" | "standard" | "extension" }>(req);
    return json({ project: duplicateProject(getStore(), id, body) }, 201);
  } catch (e) {
    return handleError(e);
  }
}
