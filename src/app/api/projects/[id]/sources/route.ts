import { getStore } from "@/lib/server/context";
import { guard, handleError, json, readJson } from "@/lib/server/http";
import { ServiceError, updateSettings } from "@/lib/server/services";
import { addPastedSource, addUploadedSource, addUrlSource } from "@/lib/sources/user-sources";
import { getConfig } from "@/lib/config";

export const runtime = "nodejs";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = guard(req);
  if (g) return g;
  try {
    const { id } = await params;
    const store = getStore();
    const p = store.getProject(id);
    if (!p) throw new ServiceError("Project not found", 404);
    if ((p.settings.userSources ?? []).length >= 20) throw new ServiceError("A project can hold up to 20 supplied sources.");
    let ref;
    const type = req.headers.get("content-type") ?? "";
    if (type.startsWith("multipart/form-data")) {
      const max = getConfig().upload.maxBytes;
      if (Number(req.headers.get("content-length") ?? 0) > max + 64_000) throw new ServiceError("File too large.", 413);
      const form = await req.formData();
      const file = form.get("file");
      if (!(file instanceof File)) throw new ServiceError("Choose a file.");
      ref = await addUploadedSource(id, { name: file.name, bytes: Buffer.from(await file.arrayBuffer()) }, { title: String(form.get("title") ?? ""), author: String(form.get("author") ?? "") });
    } else {
      const body = await readJson<{ kind: "pasted" | "url"; title?: string; author?: string; text?: string; url?: string; publicationDate?: string }>(req);
      ref = body.kind === "url" ? await addUrlSource(id, body.url ?? "", body) : await addPastedSource(id, { title: body.title ?? "", author: body.author, text: body.text ?? "", publicationDate: body.publicationDate });
    }
    const updated = updateSettings(store, id, { userSources: [...(p.settings.userSources ?? []), ref] });
    return json({ source: ref, userSources: updated.settings.userSources }, 201);
  } catch (e) {
    return handleError(e);
  }
}
