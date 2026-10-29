import { getDeps, getStore } from "@/lib/server/context";
import { guard, handleError, json, readJson } from "@/lib/server/http";
import { createProject } from "@/lib/server/services";
import { seedSamples } from "@/lib/samples";
import type { ProjectSettings } from "@/lib/db/store";

export const runtime = "nodejs";

let seeding: Promise<unknown> | null = null;

export async function GET(req: Request) {
  try {
    const store = getStore();
    if (!process.env.CS_NO_SAMPLES) {
      seeding ??= seedSamples(store, getDeps().layout).catch((e) => console.error("[seed]", e));
      await seeding;
    }
    const url = new URL(req.url);
    const projects = store.listProjects({
      search: url.searchParams.get("search") ?? undefined,
      status: url.searchParams.get("status") ?? undefined,
      folder: url.searchParams.get("folder") ?? undefined,
      includeArchived: url.searchParams.get("archived") === "1",
    });
    return json({ projects: projects.map(({ settings, ...p }) => ({ ...p, audience: settings.audience, format: settings.format })), folders: store.folders() });
  } catch (e) {
    return handleError(e);
  }
}

export async function POST(req: Request) {
  const g = guard(req);
  if (g) return g;
  try {
    const body = await readJson<Partial<ProjectSettings> & { question: string; title?: string; folder?: string }>(req);
    const p = createProject(getStore(), body);
    return json({ project: p }, 201);
  } catch (e) {
    return handleError(e);
  }
}
