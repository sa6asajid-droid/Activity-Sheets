"use client";
import { useState } from "react";
import { api } from "@/lib/client/api";
import type { ProjectData } from "@/app/projects/[id]/page";
import { Badge, Button, Card, ErrorText } from "./ui";

export function HistoryPanel({ projectId, data, onRestored }: { projectId: string; data: ProjectData; onRestored: () => void }) {
  const [error, setError] = useState<string | null>(null);
  async function restore(id: string, n: number) {
    if (!window.confirm(`Restore revision ${n} as the working draft? The current draft stays available as its own revision.`)) return;
    try {
      await api(`/api/projects/${projectId}/revisions`, { method: "POST", json: { label: "Before restore" } }).catch(() => undefined);
      await api(`/api/projects/${projectId}/revisions/${id}/restore`, { method: "POST", json: {} });
      onRestored();
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function differentiate(level: "more-support" | "extension") {
    try {
      const { project } = await api<{ project: { id: string } }>(`/api/projects/${projectId}/duplicate`, { method: "POST", json: { differentiation: level, title: `${data.project.title} (${level === "more-support" ? "more support" : "extension"})` } });
      window.location.href = `/projects/${project.id}?tab=edit`;
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return (
    <div className="grid lg:grid-cols-[1fr_360px] gap-5 items-start">
      <Card className="p-4">
        <h2 className="font-display text-lg font-semibold mb-2">Revisions</h2>
        <ErrorText error={error} />
        <ul className="flex flex-col gap-1 text-sm">
          {data.revisions.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center gap-2 border-b border-line py-1">
              <b>r{r.number}</b>
              <Badge tone={r.kind === "approved" ? "ok" : "draft"}>{r.kind}</Badge>
              <span className="grow">{r.label}</span>
              <span className="text-xs text-muted">{new Date(r.createdAt).toLocaleString()}</span>
              <Button size="sm" variant="ghost" onClick={() => void restore(r.id, r.number)}>
                Restore
              </Button>
            </li>
          ))}
        </ul>
      </Card>
      <div className="flex flex-col gap-4">
        <Card className="p-4 text-sm">
          <h2 className="font-display text-lg font-semibold mb-2">AI usage</h2>
          <p>
            {data.usage.calls} calls · {data.usage.inputTokens.toLocaleString()} input / {data.usage.outputTokens.toLocaleString()} output tokens · {data.usage.searches} searches
          </p>
          <p>
            Estimated cost ${data.usage.costUsd.toFixed(3)} of ${data.project.settings.budget.maxCostUsd.toFixed(2)} limit. Estimates use configured prices; check your provider bill.
          </p>
        </Card>
        <Card className="p-4 text-sm flex flex-col gap-2">
          <h2 className="font-display text-lg font-semibold">Differentiated copies</h2>
          <p className="text-muted">Creates a copy you can adapt (and regenerate sections in). The main objective should stay the same.</p>
          <div className="flex gap-2">
            <Button size="sm" onClick={() => void differentiate("more-support")}>
              More-support copy
            </Button>
            <Button size="sm" onClick={() => void differentiate("extension")}>
              Extension copy
            </Button>
          </div>
        </Card>
      </div>
    </div>
  );
}
