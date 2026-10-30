import type { z } from "zod";
import type { StageModel } from "../config";
import type { Source } from "../schema/document";

export interface Usage {
  inputTokens: number;
  outputTokens: number;
  searches: number;
}

export interface StructuredRequest<T> {
  stage: string;
  system: string;
  prompt: string;
  schema: z.ZodType<T>;
  model: StageModel;
  signal?: AbortSignal;
}

export interface StructuredResult<T> {
  data: T;
  usage: Usage;
  model: string;
  /** Set when the provider served the request on a fallback model. */
  servedBy?: string;
}

export interface TextProvider {
  readonly name: string;
  /** True for providers that do not produce real content (tests). */
  readonly isMock: boolean;
  generateStructured<T>(req: StructuredRequest<T>): Promise<StructuredResult<T>>;
}

export interface ResearchFinding {
  text: string;
  sourceIds: string[];
  excerpts: string[];
}

export interface ResearchResult {
  sources: Source[];
  findings: ResearchFinding[];
  usage: Usage;
  model: string;
  note: string;
}

export interface ResearchRequest {
  question: string;
  scope: string;
  audienceSummary: string;
  questionType: string;
  model: StageModel;
  maxSearches: number;
  signal?: AbortSignal;
}

export interface SearchProvider {
  readonly name: string;
  readonly isMock: boolean;
  research(req: ResearchRequest): Promise<ResearchResult>;
}

export type ProviderErrorKind =
  | "not-configured"
  | "auth"
  | "rate-limit"
  | "overloaded"
  | "timeout"
  | "network"
  | "bad-request"
  | "invalid-response"
  | "refusal"
  | "cancelled";

export class ProviderError extends Error {
  constructor(
    readonly kind: ProviderErrorKind,
    message: string,
    readonly retryable: boolean,
    readonly retryAfterMs?: number,
  ) {
    super(message);
    this.name = "ProviderError";
  }
}

/** User-facing explanation of a provider failure, never including secrets. */
export function describeProviderError(e: unknown): string {
  if (e instanceof ProviderError) {
    switch (e.kind) {
      case "not-configured":
        return "No AI provider is configured. Add ANTHROPIC_API_KEY to the server environment, or use source-free demo samples.";
      case "auth":
        return "The AI provider rejected the credentials. Check ANTHROPIC_API_KEY on the server.";
      case "rate-limit":
        return "The AI provider is rate-limiting requests. Wait a minute and resume; completed stages are saved.";
      case "overloaded":
        return "The AI provider is temporarily overloaded. Resume shortly; completed stages are saved.";
      case "timeout":
        return "The request timed out. Resume to retry this stage; completed stages are saved.";
      case "network":
        return "Could not reach the AI provider. Check the network and resume.";
      case "refusal":
        return "The model declined this request. Rephrase the question or narrow its scope.";
      case "cancelled":
        return "Cancelled.";
      case "invalid-response":
        return `The model's response did not match the required structure after retrying: ${e.message}`;
      case "bad-request":
        return `The provider rejected the request: ${e.message}`;
    }
  }
  return e instanceof Error ? e.message : String(e);
}
