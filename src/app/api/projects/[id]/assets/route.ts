import { getStore } from "@/lib/server/context";
import { guard, handleError, json } from "@/lib/server/http";
import { ServiceError } from "@/lib/server/services";
import { addImageAsset, MAX_IMAGE_BYTES } from "@/lib/assets";
import type { AssetRow } from "@/lib/db/store";

export const runtime = "nodejs";

/** Upload a reviewed PNG/JPEG to use in place of a drawn figure. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = guard(req);
  if (g) return g;
  try {
    const { id } = await params;
    const store = getStore();
    if (!store.getProject(id)) throw new ServiceError("Project not found", 404);
    if (Number(req.headers.get("content-length") ?? 0) > MAX_IMAGE_BYTES + 64_000) throw new ServiceError("File too large.", 413);
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) throw new ServiceError("Choose an image.");
    const rights = String(form.get("rights") ?? "unknown");
    if (!["owned", "licensed", "unknown"].includes(rights)) throw new ServiceError("Unknown rights value.");
    const a = await addImageAsset(store, id, { name: file.name, bytes: Buffer.from(await file.arrayBuffer()) }, rights as AssetRow["rights"]);
    return json({ asset: { id: a.id, mime: a.mime, width: a.width, height: a.height, rights: a.rights, filename: a.filename } }, 201);
  } catch (e) {
    return handleError(e);
  }
}
