import fs from "node:fs";
import path from "node:path";
import { getStore } from "@/lib/server/context";
import { handleError, json } from "@/lib/server/http";
import { mimeFor } from "@/lib/export/exporter";
import { getConfig } from "@/lib/config";

export const runtime = "nodejs";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const row = getStore().getExport(id);
    if (!row) return json({ error: "Not found" }, 404);
    const root = path.resolve(getConfig().exportDir);
    const full = path.resolve(row.filePath);
    if (!full.startsWith(root + path.sep)) return json({ error: "Not found" }, 404);
    const bytes = await fs.promises.readFile(full);
    const name = path.basename(full).replace(/^[0-9TZ-]+-/, "");
    return new Response(new Uint8Array(bytes), { headers: { "Content-Type": mimeFor(name), "Content-Disposition": `attachment; filename="${name}"`, "Cache-Control": "no-store" } });
  } catch (e) {
    return handleError(e);
  }
}
