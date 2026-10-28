/**
 * Process-wide singletons: the store, providers, and the in-process job runner.
 *
 * The runner is deliberately simple for a single-publisher local install: jobs
 * run in this Node process with an AbortController each, and their state lives
 * in the database. For hosted deployment, replace `startJob` with a queue
 * (the job row already holds everything a worker needs to resume).
 */
import { getConfig } from "../config";
import { SqliteStore, type Store } from "../db/store";
import { AnthropicTextProvider, AnthropicWebSearchProvider } from "../providers/anthropic";
import { MockSearchProvider, MockTextProvider } from "../providers/mock";
import { runJob, type PipelineDeps } from "../pipeline/pipeline";
import type { SearchProvider, TextProvider } from "../providers/types";
import { browserLayoutEngine } from "../render/browser";

interface Globals {
  store?: Store;
  deps?: PipelineDeps;
  controllers?: Map<string, AbortController>;
  recovered?: boolean;
}
const g = globalThis as unknown as { __cs?: Globals };
g.__cs ??= {};
const G = g.__cs;

export function getStore(): Store {
  if (!G.store) {
    G.store = new SqliteStore(getConfig().dbFile);
  }
  if (!G.recovered) {
    G.recovered = true;
    // Jobs marked running by a previous process cannot still be running.
    for (const j of G.store.staleRunningJobs()) {
      if (!G.controllers?.has(j.id)) {
        G.store.updateJob(j.id, { status: "failed", error: "Interrupted when the server stopped. Completed stages are saved — resume to continue." });
      }
    }
  }
  return G.store;
}

export function providerStatus() {
  const cfg = getConfig();
  return {
    text: cfg.textProvider,
    search: cfg.searchProvider,
    live: cfg.textProvider === "anthropic",
    mock: cfg.textProvider === "mock",
    demoOnly: cfg.textProvider === "none",
  };
}

export function getDeps(): PipelineDeps {
  if (!G.deps) {
    const cfg = getConfig();
    let text: TextProvider | null = null;
    let search: SearchProvider | null = null;
    if (cfg.textProvider === "anthropic") text = new AnthropicTextProvider();
    if (cfg.textProvider === "mock") text = new MockTextProvider();
    if (cfg.searchProvider === "anthropic-web-search" && cfg.textProvider === "anthropic") search = new AnthropicWebSearchProvider();
    if (cfg.searchProvider === "mock") search = new MockSearchProvider();
    G.deps = { store: getStore(), text, search, layout: process.env.CS_DISABLE_BROWSER_LAYOUT ? null : browserLayoutEngine };
  }
  return G.deps;
}

/** Test hook: replace providers. */
export function setDeps(deps: PipelineDeps) {
  G.deps = deps;
  G.store = deps.store;
}

export function isJobRunning(jobId: string) {
  return G.controllers?.has(jobId) ?? false;
}

export function startJob(jobId: string, deps: PipelineDeps = getDeps()): Promise<unknown> {
  G.controllers ??= new Map();
  const existing = G.controllers.get(jobId);
  if (existing) return Promise.resolve();
  const ac = new AbortController();
  G.controllers.set(jobId, ac);
  const p = runJob(deps, jobId, ac.signal)
    .catch((e) => {
      deps.store.updateJob(jobId, { status: "failed", error: e instanceof Error ? e.message : String(e) });
    })
    .finally(() => G.controllers?.delete(jobId));
  return p;
}

export function cancelJob(jobId: string, deps: PipelineDeps = getDeps()) {
  const ac = G.controllers?.get(jobId);
  deps.store.updateJob(jobId, { status: "cancelled", message: "Cancelled. Completed stages are kept; resume to continue." });
  ac?.abort();
}
