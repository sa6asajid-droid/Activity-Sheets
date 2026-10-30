import { getStore } from "@/lib/server/context";
import { json } from "@/lib/server/http";
import { getStorage } from "@/lib/storage";

export const runtime = "nodejs";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const a = getStore().getAsset(id);
  if (!a || a.kind !== "image" || !["image/png", "image/jpeg"].includes(a.mime)) return json({ error: "Not found" }, 404);
  try {
    const bytes = await getStorage().get(a.storageKey);
    return new Response(new Uint8Array(bytes), {
      headers: { "Content-Type": a.mime, "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "default-src 'none'", "Cache-Control": "private, max-age=3600" },
    });
  } catch {
    return json({ error: "Not found" }, 404);
  }
}
