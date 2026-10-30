"use client";
import { useEffect, useState } from "react";

export interface StatusInfo {
  productName: string;
  providers: { text: string; search: string; live: boolean; mock: boolean; demoOnly: boolean };
  budgetDefaultUsd: number;
}

let cached: Promise<StatusInfo> | null = null;
export function useStatus() {
  const [s, setS] = useState<StatusInfo | null>(null);
  useEffect(() => {
    cached ??= fetch("/api/status").then((r) => r.json());
    cached.then(setS).catch(() => undefined);
  }, []);
  return s;
}

/** States plainly which generation mode is active. */
export function ProviderBanner() {
  const s = useStatus();
  if (!s) return null;
  const p = s.providers;
  if (p.demoOnly)
    return (
      <span className="rounded bg-[#fbefd5] px-2 py-1 text-xs font-semibold text-warn" title="No AI provider credentials are configured on the server.">
        Demo mode — no AI provider configured; generation is off
      </span>
    );
  if (p.mock)
    return (
      <span className="rounded bg-[#f8e1e2] px-2 py-1 text-xs font-semibold text-bad" title="CS_TEXT_PROVIDER=mock">
        Mock provider — placeholder test output, not research
      </span>
    );
  return (
    <span className="rounded bg-[#e1efe2] px-2 py-1 text-xs font-semibold text-ok">
      Live: {p.text}
      {p.search !== "none" ? ` + ${p.search}` : " (no web search)"}
    </span>
  );
}
