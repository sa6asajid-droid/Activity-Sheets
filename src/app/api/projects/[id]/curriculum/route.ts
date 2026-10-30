import { getStore } from "@/lib/server/context";
import { guard, handleError, json, readJson } from "@/lib/server/http";
import { ServiceError, updateSettings } from "@/lib/server/services";
import { addCurriculumDoc } from "@/lib/curriculum";
import { getStorage } from "@/lib/storage";

export const runtime = "nodejs";
type P = { params: Promise<{ id: string }> };

/** Add a curriculum document (pasted text or an uploaded .txt/.md file). */
export async function POST(req: Request, { params }: P) {
  const g = guard(req);
  if (g) return g;
  try {
    const { id } = await params;
    const store = getStore();
    const p = store.getProject(id);
    if (!p) throw new ServiceError("Project not found", 404);
    let body: { title: string; jurisdiction?: string; version?: string; text: string };
    if ((req.headers.get("content-type") ?? "").startsWith("multipart/form-data")) {
      if (Number(req.headers.get("content-length") ?? 0) > 3_000_000) throw new ServiceError("File too large.", 413);
      const form = await req.formData();
      const file = form.get("file");
      if (!(file instanceof File) || !/\.(txt|md)$/i.test(file.name)) throw new ServiceError("Upload a .txt or .md file, or paste the text. PDF import is not supported yet.");
      const bytes = Buffer.from(await file.arrayBuffer());
      if (bytes.subarray(0, 4096).includes(0)) throw new ServiceError("That file does not look like text.");
      body = { title: String(form.get("title") || file.name), jurisdiction: String(form.get("jurisdiction") ?? ""), version: String(form.get("version") ?? ""), text: bytes.toString("utf8") };
    } else {
      body = await readJson(req, 3_000_000);
    }
    const ref = await addCurriculumDoc(id, body);
    const updated = updateSettings(store, id, { curriculumDocs: [...(p.settings.curriculumDocs ?? []), ref] });
    return json({ curriculumDocs: updated.settings.curriculumDocs }, 201);
  } catch (e) {
    return handleError(e);
  }
}

export async function DELETE(req: Request, { params }: P) {
  const g = guard(req);
  if (g) return g;
  try {
    const { id } = await params;
    const docId = new URL(req.url).searchParams.get("docId");
    const store = getStore();
    const p = store.getProject(id);
    if (!p) throw new ServiceError("Project not found", 404);
    const ref = (p.settings.curriculumDocs ?? []).find((d) => d.id === docId);
    if (ref) await getStorage().delete(ref.storageKey).catch(() => undefined);
    const updated = updateSettings(store, id, { curriculumDocs: (p.settings.curriculumDocs ?? []).filter((d) => d.id !== docId) });
    return json({ curriculumDocs: updated.settings.curriculumDocs });
  } catch (e) {
    return handleError(e);
  }
}
