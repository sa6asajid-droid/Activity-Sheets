import { afterAll, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "cs-int2-"));
process.env.CS_DATA_DIR = dataDir;

import { SqliteStore } from "@/lib/db/store";
import { MockTextProvider } from "@/lib/providers/mock";
import { runJob, type PipelineDeps } from "@/lib/pipeline/pipeline";
import * as svc from "@/lib/server/services";
import { seedSamples } from "@/lib/samples";
import { addCurriculumDoc } from "@/lib/curriculum";
import { addImageAsset, AssetInputError } from "@/lib/assets";
import { exportProject, ExportRefusedError } from "@/lib/export/exporter";
import { browserLayoutEngine, closeBrowser } from "@/lib/render/browser";
import { makePng } from "../helpers/png";
import { PDFDocument } from "pdf-lib";

afterAll(async () => {
  await closeBrowser();
  fs.rmSync(dataDir, { recursive: true, force: true });
});

async function setup() {
  const d: PipelineDeps = { store: new SqliteStore(":memory:"), text: new MockTextProvider(), search: null, layout: browserLayoutEngine };
  await seedSamples(d.store, null);
  const projectId = d.store.listProjects().find((p) => p.title.startsWith("Why do shadows"))!.id;
  return { d, projectId };
}

describe("curriculum mapping job", () => {
  it("keeps only suggestions whose wording is in the document", async () => {
    const { d, projectId } = await setup();
    const ref = await addCurriculumDoc(projectId, {
      title: "Science curriculum (test excerpt)",
      jurisdiction: "Test",
      version: "2026",
      text: "Earth and Space Systems\nDescribe how the position of the Sun in the sky changes over the course of a day.\nInvestigate how shadows change.",
    });
    svc.updateSettings(d.store, projectId, { curriculumDocs: [ref] });
    const job = d.store.createJob(projectId, "curriculum-map", { docId: ref.id, doc: d.store.getDraft(projectId)!.doc });
    const done = await runJob(d, job.id, new AbortController().signal);
    expect(done.status).toBe("succeeded");
    const result = done.stages.curriculum as { items: { expectation: string; verifiedInDocument: boolean; code?: string }[]; discarded: number };
    expect(result.items).toHaveLength(1);
    expect(result.items[0].verifiedInDocument).toBe(true);
    expect(result.items[0].expectation).toMatch(/position of the Sun/);
    expect(result.discarded).toBe(1); // the invented "Z9.9" expectation
  });
});

describe("uploaded images and review cards in exports", () => {
  it("refuses non-images, exports a PDF with an uploaded image, and refuses when the file is missing", async () => {
    const { d, projectId } = await setup();
    await expect(addImageAsset(d.store, projectId, { name: "x.svg", bytes: Buffer.from("<svg/>") }, "owned")).rejects.toBeInstanceOf(AssetInputError);
    const asset = await addImageAsset(d.store, projectId, { name: "photo.png", bytes: makePng(400, 200) }, "owned");
    const draft = d.store.getDraft(projectId)!;
    const doc = structuredClone(draft.doc);
    doc.diagrams[0] = { ...doc.diagrams[0], image: { assetId: asset.id, mime: "image/png", widthPx: 400, heightPx: 200 }, provenance: { kind: "uploaded-image", note: "test", rights: "owned" } };
    svc.saveDraft(d.store, projectId, doc, draft.version);
    const pdf = await exportProject(d.store, projectId, { kind: "student-pdf", allowDraft: true });
    expect((await PDFDocument.load(pdf.bytes)).getPageCount()).toBeGreaterThan(0);
    const html = (await exportProject(d.store, projectId, { kind: "student-html", allowDraft: true })).bytes.toString();
    expect(html).toContain('<img src="data:image/png;base64,');
    await expect(exportProject(d.store, projectId, { kind: "diagram-svg", diagramId: doc.diagrams[0].id, allowDraft: true })).rejects.toBeInstanceOf(ExportRefusedError);
    fs.rmSync(path.join(dataDir, "storage", d.store.getAsset(asset.id)!.storageKey));
    await expect(exportProject(d.store, projectId, { kind: "student-pdf", allowDraft: true })).rejects.toThrow(/Missing image file/);
  }, 120000);

  it("exports printable review cards", async () => {
    const { d } = await setup();
    const id = d.store.listProjects().find((p) => p.title.startsWith("What makes a fraction"))!.id;
    const out = await exportProject(d.store, id, { kind: "review-cards-pdf", allowDraft: true });
    expect((await PDFDocument.load(out.bytes)).getPageCount()).toBeGreaterThanOrEqual(1);
    expect(out.filename).toMatch(/review-cards\.pdf$/);
  }, 120000);
});
