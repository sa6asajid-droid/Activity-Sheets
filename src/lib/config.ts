/**
 * Server-side configuration. Read only from server code: secrets never reach
 * the browser bundle (nothing here is prefixed NEXT_PUBLIC_).
 */
import path from "node:path";

export interface ModelPrice {
  inputPerMTok: number;
  outputPerMTok: number;
}

/**
 * Prices used for estimates and budget checks (USD). They are configuration,
 * not live data: check your provider's current pricing and override with
 * CS_PRICE_<MODEL>="input,output" if they differ.
 */
const DEFAULT_PRICES: Record<string, ModelPrice> = {
  "claude-opus-5-5": { inputPerMTok: 4, outputPerMTok: 20 },
  "claude-sonnet-5-5": { inputPerMTok: 2, outputPerMTok: 10 },
  "claude-haiku-5-5": { inputPerMTok: 0.1, outputPerMTok: 0.5 },
};

function priceFor(model: string): ModelPrice {
  const env = process.env[`CS_PRICE_${model.toUpperCase().replace(/[^A-Z0-9]/g, "_")}`];
  if (env) {
    const [i, o] = env.split(",").map(Number);
    if (Number.isFinite(i) && Number.isFinite(o)) return { inputPerMTok: i, outputPerMTok: o };
  }
  return DEFAULT_PRICES[model] ?? { inputPerMTok: 5, outputPerMTok: 25 };
}

export type Effort = "low" | "medium" | "high" | "xhigh" | "max";

export interface StageModel {
  model: string;
  effort: Effort;
  maxTokens: number;
}

export function getConfig() {
  const dataDir = path.resolve(process.env.CS_DATA_DIR || path.join(/* turbopackIgnore: true */ process.cwd(), "data"));
  const model = process.env.CS_MODEL || "claude-opus-5-5";
  const provider = (process.env.CS_TEXT_PROVIDER || (process.env.ANTHROPIC_API_KEY ? "anthropic" : "none")) as "anthropic" | "mock" | "none";
  const search = (process.env.CS_SEARCH_PROVIDER || (provider === "anthropic" ? "anthropic-web-search" : "none")) as "anthropic-web-search" | "mock" | "none";
  const stage = (name: string, effort: Effort, maxTokens: number): StageModel => ({
    model: process.env[`CS_MODEL_${name}`] || model,
    effort: (process.env[`CS_EFFORT_${name}`] as Effort) || effort,
    maxTokens,
  });
  return {
    productName: process.env.CS_PRODUCT_NAME || "Curiosity Studio",
    dataDir,
    dbFile: process.env.CS_DB_FILE || path.join(dataDir, "curiosity-studio.db"),
    storageDir: path.join(dataDir, "storage"),
    exportDir: path.join(dataDir, "exports"),
    textProvider: provider,
    searchProvider: search,
    // Effort is the main cost lever: lighter tasks run at lower effort by default.
    stages: {
      interpret: stage("INTERPRET", "low", 8000),
      research: stage("RESEARCH", "medium", 16000),
      plan: stage("PLAN", "medium", 16000),
      write: stage("WRITE", "medium", 32000),
      visuals: stage("VISUALS", "medium", 16000),
      check: stage("CHECK", "low", 12000),
      regenerate: stage("REGENERATE", "medium", 16000),
    },
    maxSearches: Number(process.env.CS_MAX_SEARCHES || 6),
    searchCostUsd: Number(process.env.CS_SEARCH_COST_USD || 0.01),
    defaultBudgetUsd: Number(process.env.CS_DEFAULT_BUDGET_USD || 2),
    requestTimeoutMs: Number(process.env.CS_REQUEST_TIMEOUT_MS || 600000),
    maxAttempts: Number(process.env.CS_MAX_ATTEMPTS || 2),
    priceFor,
    upload: { maxBytes: Number(process.env.CS_UPLOAD_MAX_BYTES || 2 * 1024 * 1024) },
    fetch: { maxBytes: 1024 * 1024, maxRedirects: 3, timeoutMs: 15000 },
    /** Fallback model routing on refusals (Anthropic server-side fallbacks). */
    refusalFallbacks: process.env.CS_REFUSAL_FALLBACKS !== "off",
  };
}

export type AppConfig = ReturnType<typeof getConfig>;

export function estimateCostUsd(model: string, inputTokens: number, outputTokens: number, searches = 0) {
  const p = priceFor(model);
  return (inputTokens / 1e6) * p.inputPerMTok + (outputTokens / 1e6) * p.outputPerMTok + searches * getConfig().searchCostUsd;
}
