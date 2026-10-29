/** Small helpers shared by API route handlers. */
import { NextResponse } from "next/server";
import { ServiceError } from "./services";
import { ExportRefusedError } from "../export/exporter";
import { SourceInputError } from "../sources/user-sources";
import { FetchBlockedError } from "../security/safe-fetch";

export function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status, headers: { "Cache-Control": "no-store" } });
}

/**
 * Reject cross-site state-changing requests. The app has no login (single
 * local publisher), so this keeps other websites from driving it through the
 * user's browser.
 */
export function guard(req: Request): Response | null {
  if (req.method === "GET" || req.method === "HEAD") return null;
  const origin = req.headers.get("origin");
  const host = req.headers.get("host");
  if (origin) {
    try {
      if (new URL(origin).host !== host) return json({ error: "Cross-site request refused." }, 403);
    } catch {
      return json({ error: "Bad origin." }, 403);
    }
  } else if (req.headers.get("sec-fetch-site") === "cross-site") {
    return json({ error: "Cross-site request refused." }, 403);
  }
  return null;
}

export function handleError(e: unknown) {
  if (e instanceof ServiceError) return json({ error: e.message }, e.status);
  if (e instanceof ExportRefusedError) return json({ error: e.message, issues: e.issues }, 409);
  if (e instanceof SourceInputError || e instanceof FetchBlockedError) return json({ error: e.message }, 400);
  // Never echo internals (paths, keys) to the client.
  console.error("[curiosity-studio]", e instanceof Error ? e.message : e);
  return json({ error: "Something went wrong on the server. Your saved work is unaffected." }, 500);
}

export async function readJson<T>(req: Request, maxBytes = 2_000_000): Promise<T> {
  const len = Number(req.headers.get("content-length") ?? 0);
  if (len > maxBytes) throw new ServiceError("Request too large.", 413);
  const text = await req.text();
  if (text.length > maxBytes) throw new ServiceError("Request too large.", 413);
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new ServiceError("Invalid JSON.");
  }
}

export type Ctx<P extends Record<string, string>> = { params: Promise<P> };
