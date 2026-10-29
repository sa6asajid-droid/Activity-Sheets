/**
 * Upgrade stored or imported documents to the current schema version.
 * Each step is small and explicit; unknown future versions are refused
 * rather than guessed at.
 */
import { SCHEMA_VERSION } from "./document";

type Raw = Record<string, unknown> & { schemaVersion?: number };

const STEPS: Record<number, (d: Raw) => Raw> = {
  // v1 → v2: student reference line and differentiation level were added;
  // claims gained `statusAssignedBy`.
  1: (d) => {
    const layout = { studentReferences: "short", ...(d.layout as object) };
    const claims = ((d.claims as Raw[]) ?? []).map((c) => ({ statusAssignedBy: (c.sourceIds as unknown[])?.length ? "model-assessment" : "no-sources", ...c }));
    return { differentiation: "standard", ...d, layout, claims, schemaVersion: 2 };
  },
};

export class MigrationError extends Error {}

export function migrateDocument(input: unknown): unknown {
  if (!input || typeof input !== "object") throw new MigrationError("Not a document.");
  let doc = { ...(input as Raw) };
  let v = typeof doc.schemaVersion === "number" ? doc.schemaVersion : 1;
  if (v > SCHEMA_VERSION) throw new MigrationError(`This document was made by a newer version (schema ${v}). Update Curiosity Studio to open it.`);
  while (v < SCHEMA_VERSION) {
    const step = STEPS[v];
    if (!step) throw new MigrationError(`No migration from schema ${v}.`);
    doc = step(doc);
    v = doc.schemaVersion as number;
  }
  return doc;
}
