import { getStore } from "@/lib/server/context";
import { guard, handleError, readJson } from "@/lib/server/http";
import { compileWorkbook } from "@/lib/export/exporter";

export const runtime = "nodejs";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = guard(req);
  if (g) return g;
  try {
    const { id } = await params;
    const { allowDraft } = await readJson<{ allowDraft?: boolean }>(req);
    const { bytes, filename, notes } = await compileWorkbook(getStore(), id, { allowDraft });
    return new Response(new Uint8Array(bytes), {
      headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${filename}"`, "X-Workbook-Notes": encodeURIComponent(notes.join(" | ")), "Cache-Control": "no-store" },
    });
  } catch (e) {
    return handleError(e);
  }
}
