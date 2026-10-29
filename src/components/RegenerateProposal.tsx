"use client";
import { useState } from "react";
import { api } from "@/lib/client/api";
import type { RegenerationProposal } from "@/lib/pipeline/pipeline";
import { stripInline } from "@/lib/text";
import { Button, Card, ErrorText, Notice } from "./ui";

function summarize(part: RegenerationProposal["before"]) {
  const out: string[] = [];
  if (part.section.heading) out.push(`Heading: ${part.section.heading}`);
  if (part.section.body) out.push(stripInline(part.section.body));
  if (part.activity) {
    out.push(`Activity: ${part.activity.title}`, stripInline(part.activity.instructions), ...part.activity.items.map((i, k) => `${String.fromCharCode(97 + k)}) ${stripInline(i.prompt)}`));
  }
  if (part.answer) out.push(`Answer: ${stripInline(part.answer.answer)}`);
  if (part.diagram) out.push(`Figure: ${part.diagram.caption}`);
  return out.join("\n\n");
}

/** Side-by-side proposal with its dependencies; nothing changes until accepted. */
export function RegenerateProposal({ projectId, jobId, proposal, onDone }: { projectId: string; jobId: string; proposal: RegenerationProposal; onDone: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function decide(reject: boolean) {
    setBusy(true);
    setError(null);
    try {
      await api(`/api/projects/${projectId}/regenerate/accept`, { method: "POST", json: { jobId, reject } });
      await onDone();
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }
  return (
    <Card className="p-4 flex flex-col gap-3 border-accent" as="div">
      <h2 className="font-display text-lg font-semibold">Proposed change to one section</h2>
      <p className="text-sm">{proposal.changeSummary}</p>
      <div className="grid md:grid-cols-2 gap-3 text-sm">
        <div>
          <h3 className="font-semibold mb-1">Now</h3>
          <pre className="whitespace-pre-wrap font-sans bg-[#f6f3ec] rounded p-2">{summarize(proposal.before)}</pre>
        </div>
        <div>
          <h3 className="font-semibold mb-1">Proposed</h3>
          <pre className="whitespace-pre-wrap font-sans bg-[#eef3f7] rounded p-2">{summarize(proposal.after)}</pre>
        </div>
      </div>
      {proposal.dependencies.length > 0 && (
        <Notice title="Check these after accepting">
          <ul className="list-disc pl-4">
            {proposal.dependencies.map((d, i) => (
              <li key={i}>{d}</li>
            ))}
          </ul>
        </Notice>
      )}
      {proposal.newUnsupportedClaims.length > 0 && <Notice tone="warning" title="New statements without a source">{proposal.newUnsupportedClaims.join(" · ")}</Notice>}
      <div className="flex gap-2">
        <Button variant="primary" onClick={() => decide(false)} disabled={busy}>
          Accept and recheck
        </Button>
        <Button onClick={() => decide(true)} disabled={busy}>
          Discard
        </Button>
      </div>
      <ErrorText error={error} />
    </Card>
  );
}
