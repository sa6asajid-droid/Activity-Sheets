import { describe, expect, it } from "vitest";
import { makePng } from "../helpers/png";
import { detectImage } from "@/lib/assets";
import { verifyItems, curriculumStatus } from "@/lib/curriculum";
import { reviewCards, renderWorksheetHtml } from "@/lib/render/worksheet";
import { SAMPLES } from "@/lib/samples";
import { runQualityChecks, findAnswerLeaks } from "@/lib/quality/checks";
import { checkDiagram } from "@/lib/diagrams/checks";
import * as ops from "@/lib/client/docOps";
import { validateDocument } from "@/lib/schema/document";

const sample = (k: string) => SAMPLES.find((s) => s.key === k)!.build();

describe("uploaded images", () => {
  it("identifies PNG and JPEG by their bytes and reads dimensions", () => {
    expect(detectImage(makePng(120, 80))).toEqual({ mime: "image/png", width: 120, height: 80 });
    const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x04, 0x00, 0x00, 0xff, 0xc0, 0x00, 0x11, 0x08, 0x00, 0x64, 0x00, 0xc8, 0x03, 0, 0, 0, 0, 0, 0]);
    expect(detectImage(jpeg)).toEqual({ mime: "image/jpeg", width: 200, height: 100 });
    expect(detectImage(Buffer.from("<svg xmlns='http://www.w3.org/2000/svg'><script>alert(1)</script></svg>"))).toBeNull();
    expect(detectImage(Buffer.from("GIF89a....."))).toBeNull();
  });

  it("renders an image figure, reserves its space without bytes, and checks it", () => {
    const d = structuredClone(sample("lever"));
    const fig = d.diagrams[0];
    fig.image = { assetId: "00000000-0000-4000-8000-000000000001", mime: "image/png", widthPx: 1200, heightPx: 600 };
    fig.provenance = { kind: "uploaded-image", note: "Uploaded", rights: "unknown" };
    expect(validateDocument(d).ok).toBe(true);
    const withImg = renderWorksheetHtml(d, { variant: "student", fontSrc: () => "", assetSrc: () => "data:image/png;base64,AAAA" });
    expect(withImg).toContain('<img src="data:image/png;base64,AAAA"');
    const placeholder = renderWorksheetHtml(d, { variant: "student", fontSrc: () => "" });
    expect(placeholder).toContain("aspect-ratio:1200 / 600");
    const codes = runQualityChecks(d).issues.map((i) => i.code);
    expect(codes).toContain("rights-unknown");
    expect(codes).toContain("image-labels-unchecked");
  });

  it("blocks an image figure that has no image yet", () => {
    const { doc, diagramId } = ops.addImageFigure(sample("seed"));
    expect(validateDocument(doc).ok).toBe(true);
    expect(checkDiagram(doc.diagrams.find((x) => x.id === diagramId)!).map((f) => f.code)).toEqual(["image-missing"]);
  });
});

describe("curriculum verification", () => {
  const text = "Strand B: Earth and Space\nB2.1 describe how the position of the Sun in the sky changes over the course of a day\nB2.2 investigate shadows";
  const item = (expectation: string, code?: string) => ({ expectation, code, objectiveIds: ["obj-1"], activityIds: [], coverageLimitations: "", verifiedInDocument: false });

  it("verifies exact wording (ignoring case and whitespace) and finds a location", () => {
    const [v] = verifyItems([item("Describe how the position of the Sun in the sky   changes over the course of a day", "B2.1")], { "cur-1": text });
    expect(v.verifiedInDocument).toBe(true);
    expect(v.documentId).toBe("cur-1");
    expect(v.location).toMatch(/Strand B/);
  });
  it("refuses paraphrases and codes that are not in the document", () => {
    const [a, b] = verifyItems([item("Explain why the Sun moves across the sky during the day"), item("investigate shadows cast by objects", "B9.9")], { "cur-1": text + " investigate shadows cast by objects" });
    expect(a.verifiedInDocument).toBe(false);
    expect(b.verifiedInDocument).toBe(false);
    expect(b.problem).toMatch(/B9\.9/);
  });
  it("only reports verified status when every item is verified", () => {
    expect(curriculumStatus([])).toBe("none");
    expect(curriculumStatus([{ ...item("x"), verifiedInDocument: true }, item("y")])).toBe("suggested-unverified");
    expect(curriculumStatus([{ ...item("x"), verifiedInDocument: true }])).toBe("verified-from-document");
  });
  it("blocks a document that claims verified alignment with an unverified item", () => {
    const d = structuredClone(sample("shadows"));
    d.teacherNotes.curriculum = { status: "verified-from-document", documentTitle: "X", items: [{ ...item("something"), location: "p. 1" }] };
    expect(runQualityChecks(d).issues.some((i) => i.code === "curriculum-not-verified" && i.severity === "blocking")).toBe(true);
  });
});

describe("review cards", () => {
  it("builds one card per review day, mixing prompts, without answers on student cards", () => {
    const d = sample("fractions");
    const cards = reviewCards(d);
    expect(cards.map((c) => c.day)).toEqual([2, 7, 21]);
    expect(new Set(cards.map((c) => c.prompts[0].prompt)).size).toBeGreaterThan(1);
    const html = renderWorksheetHtml(d, { variant: "review-cards", fontSrc: () => "" });
    expect(html).toContain("Day 7 after the worksheet");
    expect(findAnswerLeaks(d, html)).toEqual([]);
    expect(html).not.toContain(cards[0].prompts[0].answer.slice(0, 40));
    const key = renderWorksheetHtml(d, { variant: "answer-key", fontSrc: () => "" });
    expect(key).toContain("Review card answers");
  });
  it("makes no cards when review is switched off", () => {
    const d = structuredClone(sample("seed"));
    d.learningPlan.reviewPlan = { retrievalCard: false, suggestedReviewDays: [] };
    expect(reviewCards(d)).toEqual([]);
  });
});
