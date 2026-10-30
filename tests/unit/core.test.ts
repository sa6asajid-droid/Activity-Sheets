import { describe, expect, it } from "vitest";
import { SAMPLES } from "@/lib/samples";
import { validateDocument, type WorksheetDocument } from "@/lib/schema/document";
import { migrateDocument } from "@/lib/schema/migrate";
import { convertUnit, evaluateArithmetic, runComputation, pageBoxMm, contentBoxMm } from "@/lib/computations";
import { runQualityChecks, findAnswerLeaks } from "@/lib/quality/checks";
import { checkDiagram, fractionsEquivalent } from "@/lib/diagrams/checks";
import { compileDiagram, shadowRatio, mechanicalAdvantage } from "@/lib/diagrams/compile";
import { renderSvg } from "@/lib/diagrams/render";
import { renderWorksheetHtml } from "@/lib/render/worksheet";
import { renderInline, stripInline, fleschKincaidGrade } from "@/lib/text";
import { buildClaims } from "@/lib/pipeline/pipeline";
import type { PlanOutT } from "@/lib/pipeline/llm-schemas";
import * as ops from "@/lib/client/docOps";
import { isBlockedAddress, checkUrl, htmlToText } from "@/lib/security/safe-fetch";
import { LocalStorage } from "@/lib/storage";
import { recommendStrategies } from "@/lib/pedagogy/strategies";
import { convertDiagramSpec } from "@/lib/pipeline/convert";

const sample = (k: string) => SAMPLES.find((s) => s.key === k)!.build();
const clone = <T>(x: T): T => structuredClone(x);
const student = (d: WorksheetDocument) => renderWorksheetHtml(d, { variant: "student", fontSrc: () => "" });

describe("schema validation", () => {
  it("accepts every demo sample", () => {
    for (const s of SAMPLES) {
      const v = validateDocument(s.build());
      expect(v.ok, `${s.key}: ${!v.ok && v.errors.join("; ")}`).toBe(true);
    }
  });

  it("rejects duplicate ids and dangling references", () => {
    const d = clone(sample("fractions"));
    d.sections.push({ ...d.sections[0] });
    d.activities[0].answerKeyId = "key-missing";
    const v = validateDocument(d);
    expect(v.ok).toBe(false);
    if (!v.ok) {
      expect(v.errors.join(" ")).toMatch(/Duplicate section/);
      expect(v.errors.join(" ")).toMatch(/no answer-key entry/);
    }
  });

  it("rejects malformed ids and missing required fields", () => {
    const d = clone(sample("seed")) as unknown as Record<string, unknown>;
    (d.sections as { id: string }[])[0].id = "bad id with spaces";
    delete d.directAnswer;
    const v = validateDocument(d);
    expect(v.ok).toBe(false);
  });
});

describe("document migrations", () => {
  it("upgrades a v1 document to the current schema", () => {
    const d = clone(sample("shadows")) as unknown as Record<string, unknown>;
    d.schemaVersion = 1;
    delete d.differentiation;
    delete (d.layout as Record<string, unknown>).studentReferences;
    for (const c of d.claims as Record<string, unknown>[]) delete c.statusAssignedBy;
    const v = validateDocument(d);
    expect(v.ok).toBe(true);
    if (v.ok) {
      expect(v.doc.schemaVersion).toBe(2);
      expect(v.doc.layout.studentReferences).toBe("short");
      expect(v.doc.claims[0].statusAssignedBy).toBe("no-sources");
    }
  });
  it("refuses documents from a newer version", () => {
    expect(() => migrateDocument({ schemaVersion: 99 })).toThrow(/newer version/);
  });
});

describe("computations and units", () => {
  it("evaluates arithmetic without eval and rejects anything else", () => {
    expect(evaluateArithmetic("3 * (4 + 2) / 2")).toBe(9);
    expect(evaluateArithmetic("-2 + 5")).toBe(3);
    expect(() => evaluateArithmetic("process.exit()")).toThrow();
    expect(() => evaluateArithmetic("1/0")).toThrow(/Division by zero/);
    expect(() => evaluateArithmetic("2 2")).toThrow();
  });
  it("checks answer-key numbers independently", () => {
    expect(runComputation({ kind: "fraction-equivalence", itemId: "a", a: [3, 4], b: [6, 9], expected: false }).ok).toBe(true);
    expect(runComputation({ kind: "fraction-equivalence", itemId: "a", a: [3, 4], b: [6, 9], expected: true }).ok).toBe(false);
    expect(runComputation({ kind: "missing-numerator", itemId: "a", a: [3, 4], denominator: 20, expected: 15 }).ok).toBe(true);
    expect(runComputation({ kind: "percent-change", itemId: "a", from: 50, to: 54, expected: 8, tolerance: 0.05 }).ok).toBe(true);
    expect(runComputation({ kind: "mechanical-advantage", itemId: "a", effortArm: 2, loadArm: 0.5, expected: 4, tolerance: 0.01 }).ok).toBe(true);
    expect(runComputation({ kind: "arithmetic", itemId: "a", expression: "300 / 3", expected: 90, tolerance: 0 }).ok).toBe(false);
  });
  it("converts units", () => {
    expect(convertUnit(1, "in", "cm")).toBeCloseTo(2.54, 6);
    expect(convertUnit(100, "C", "F")).toBe(212);
    expect(convertUnit(2.2046226218, "lb", "kg")).toBeCloseTo(1, 6);
    expect(() => convertUnit(1, "kg", "m")).toThrow();
  });
  it("computes page and content boxes", () => {
    expect(pageBoxMm("letter", "portrait")).toEqual({ w: 215.9, h: 279.4 });
    expect(pageBoxMm("a4", "landscape")).toEqual({ w: 297, h: 210 });
    expect(contentBoxMm("a4", "portrait", { top: 16, bottom: 16, inner: 16, outer: 16 }, 5)).toEqual({ w: 210 - 37, h: 297 - 32 });
  });
});

describe("quality checks", () => {
  it("finds a missing answer key and blocks", () => {
    const d = clone(sample("lever"));
    d.answerKey = d.answerKey.filter((k) => k.activityId !== "act-calc");
    const r = runQualityChecks(d);
    expect(r.issues.some((i) => i.code === "answer-key-missing" && i.severity === "blocking")).toBe(true);
  });
  it("blocks a wrong numerical answer", () => {
    const d = clone(sample("fractions"));
    const a = d.activities.find((x) => x.id === "act-check")!;
    (a.computations[1] as { expected: boolean }).expected = true; // 3/4 vs 6/9 claimed equivalent
    const r = runQualityChecks(d);
    expect(r.issues.some((i) => i.code === "computation-failed")).toBe(true);
  });
  it("all samples pass their own numerical checks", () => {
    for (const s of SAMPLES) {
      const r = runQualityChecks(s.build());
      expect(r.issues.filter((i) => i.code === "computation-failed"), s.key).toEqual([]);
    }
  });
  it("labels curriculum suggestions as unverified", () => {
    const d = clone(sample("seed"));
    d.teacherNotes.curriculum = { status: "suggested-unverified", items: [] };
    expect(runQualityChecks(d).issues.some((i) => i.message === "Suggested topic alignment—not verified curriculum alignment.")).toBe(true);
  });
  it("reports measured overflow as blocking clipped text", () => {
    const r = runQualityChecks(sample("seed"), { measuredPages: [{ page: 1, kind: "Student", overflowPx: 40, clippedSections: ["sec-fig"] }] });
    expect(r.issues.find((i) => i.code === "text-clipped")?.severity).toBe("blocking");
  });
  it("keeps override decisions across re-checks", () => {
    const d = clone(sample("shadows"));
    const first = runQualityChecks(d);
    const w = first.issues.find((i) => i.code === "no-sources")!;
    w.resolutionStatus = "overridden";
    w.reviewer = "Ana";
    const second = runQualityChecks(d, { previous: first.issues });
    expect(second.issues.find((i) => i.code === "no-sources")?.resolutionStatus).toBe("overridden");
  });
  it("reports readability as an estimate", () => {
    const g = fleschKincaidGrade("The cat sat on the mat. It was a warm day. The sun was out and the sky was blue. Birds sang in the trees near the house. A dog ran past the gate and barked twice at the cat.");
    expect(g).not.toBeNull();
    expect(g!).toBeLessThan(4);
  });
});

describe("student / teacher separation", () => {
  it("student HTML never contains answer-key or teacher text", () => {
    for (const s of SAMPLES) {
      const d = s.build();
      const html = student(d);
      expect(findAnswerLeaks(d, html), s.key).toEqual([]);
      for (const k of d.answerKey) {
        if (k.reasoning.length > 20) expect(html.includes(k.reasoning.slice(0, 40)), `${s.key} ${k.id}`).toBe(false);
      }
      expect(html.includes(d.teacherNotes.overview.slice(0, 40))).toBe(false);
    }
  });
  it("detects a leak if teacher text is injected into student output", () => {
    const d = sample("lever");
    const leaked = student(d).replace("</body>", `<p>${d.answerKey[1].reasoning}</p></body>`);
    expect(findAnswerLeaks(d, leaked).length).toBeGreaterThan(0);
  });
  it("blank diagram labels stay blank for students and show in the key", () => {
    const d = sample("seed");
    const fig = d.diagrams.find((x) => x.id === "fig-label")!;
    const graph = compileDiagram(fig.spec);
    const studentSvg = renderSvg(graph, { colourMode: "bw", accentColour: "#000000", idPrefix: "s", revealBlanks: false });
    const keySvg = renderSvg(graph, { colourMode: "bw", accentColour: "#000000", idPrefix: "k", revealBlanks: true });
    expect(studentSvg).not.toMatch(/>seed coat</);
    expect(keySvg).toMatch(/>seed coat</);
  });
});

describe("diagrams", () => {
  it("computes shadow geometry and mechanical advantage", () => {
    expect(shadowRatio(45)).toBeCloseTo(1, 6);
    expect(shadowRatio(15)).toBeGreaterThan(shadowRatio(30));
    expect(mechanicalAdvantage(1.5, 0.5)).toBe(3);
    expect(fractionsEquivalent([2, 4], [1, 2])).toBe(true);
  });
  it("flags out-of-range timeline events", () => {
    const d = clone(sample("shadows").diagrams[0]);
    d.spec = { type: "timeline", start: 1900, end: 2000, unitLabel: "", events: [{ value: 1950, label: "Mid-century" }, { value: 2050, label: "Future" }] };
    expect(checkDiagram(d).some((f) => f.code === "timeline-out-of-range")).toBe(true);
  });
  it("flags a false equivalence claim on fraction bars", () => {
    const d = clone(sample("fractions").diagrams[0]);
    d.spec = { type: "fraction-bars", claim: "all-equivalent", showFractionLabels: true, bars: [{ numerator: 1, denominator: 2, label: "1/2" }, { numerator: 2, denominator: 3, label: "2/3" }] };
    expect(checkDiagram(d).some((f) => f.code === "fraction-claim-false")).toBe(true);
  });
  it("flags labels that do not match the drawn fraction", () => {
    const d = clone(sample("fractions").diagrams[0]);
    d.spec = { type: "fraction-bars", claim: "none", showFractionLabels: true, bars: [{ numerator: 1, denominator: 2, label: "1/3" }] };
    expect(checkDiagram(d).some((f) => f.code === "fraction-label-mismatch")).toBe(true);
  });
  it("flags a chart axis that would misrepresent data", () => {
    const d = clone(sample("inflation").diagrams[0]);
    if (d.spec.type === "bar-chart") d.spec.yMax = 40;
    expect(checkDiagram(d).some((f) => f.code === "chart-axis-clipped")).toBe(true);
  });
  it("flags empty and out-of-bounds labels", () => {
    const d = clone(sample("seed").diagrams.find((x) => x.id === "fig-label")!);
    if (d.spec.type === "labelled-scene") d.spec.callouts[0] = { ...d.spec.callouts[0], blank: false, text: "", at: { x: 590, y: 150 } };
    const f = checkDiagram(d).map((x) => x.code);
    expect(f).toContain("diagram-empty-label");
  });
  it("applies editor label overrides by element id", () => {
    const d = sample("shadows").diagrams[0];
    const g = compileDiagram(d.spec, { "time-0": "Sunrise" });
    expect(g.elements.find((e) => e.id === "time-0" && e.kind === "text")).toMatchObject({ text: "Sunrise" });
  });
  it("escapes all text in SVG output", () => {
    const g = compileDiagram({ type: "sequence", cyclic: false, steps: [{ label: '<script>alert(1)</script>', detail: '" onload="x' }, { label: "b", detail: "" }] });
    const svg = renderSvg(g, { colourMode: "bw", accentColour: "#000000", idPrefix: "t", revealBlanks: false });
    expect(svg).not.toContain("<script>");
    expect(svg).toContain("&lt;script&gt;");
    expect(svg).not.toMatch(/onload="/);
  });
  it("rejects invalid model diagram specs instead of guessing", () => {
    const bad = { type: "fraction-bars", fractionBars: { bars: [{ numerator: 1, denominator: 0, label: "" }], claim: "none" } } as never;
    expect(() => convertDiagramSpec({ ...emptyLlmSpec(), ...(bad as object) } as never)).toThrow();
  });
});

function emptyLlmSpec() {
  return {
    type: "sequence",
    sequence: { steps: [], cyclic: false },
    comparison: { columns: [] },
    timeline: { start: 0, end: 0, unitLabel: "", events: [] },
    lightShadow: { objectLabel: "", times: [] },
    fractionBars: { bars: [], claim: "none" },
    numberLine: { min: 0, max: 0, step: 0, fractionDenominator: 0, points: [] },
    lever: { effortArm: 0, loadArm: 0, unit: "", loadLabel: "", effortLabel: "", fulcrumLabel: "" },
    barChart: { title: "", yLabel: "", unit: "", bars: [] },
    conceptMap: { nodes: [], edges: [], centralNodeId: "" },
    labelledScene: { width: 0, height: 0, primitives: [], callouts: [], legend: [] },
  };
}

describe("source-to-claim links", () => {
  const sources = [{ id: "usr-1", title: "Notes", location: { kind: "pasted" as const, value: "Notes" }, retrievedAt: "2026-01-01", excerpt: "Plants need water.", sourceType: "user-supplied" as const, licenceStatus: "owned" as const }];
  const plan = (claims: PlanOutT["claims"]) => ({ claims }) as PlanOutT;
  it("keeps a claim whose quote is found in the cited source", () => {
    const [c] = buildClaims(plan([{ text: "Seeds need water to germinate.", sourceIds: ["usr-1"], quote: "seeds   need water", evidenceStatus: "supported", uncertainty: "" }]), sources, { "usr-1": "Most seeds need water to germinate." }, []);
    expect(c.evidenceStatus).toBe("supported");
    expect(c.excerpts[0]).toMatch(/need water/);
  });
  it("marks a fabricated quote unsupported (deterministic)", () => {
    const [c] = buildClaims(plan([{ text: "Seeds need moonlight.", sourceIds: ["usr-1"], quote: "seeds need moonlight", evidenceStatus: "supported", uncertainty: "" }]), sources, { "usr-1": "Most seeds need water." }, []);
    expect(c.evidenceStatus).toBe("unsupported");
    expect(c.statusAssignedBy).toBe("deterministic");
  });
  it("drops unknown source ids and downgrades the claim", () => {
    const [c] = buildClaims(plan([{ text: "X is true.", sourceIds: ["src-404"], quote: "", evidenceStatus: "supported", uncertainty: "" }]), sources, {}, []);
    expect(c.sourceIds).toEqual([]);
    expect(c.evidenceStatus).toBe("unsupported");
  });
});

describe("editor operations", () => {
  it("does not change locked sections", () => {
    let d = sample("shadows");
    d = ops.updateSection(d, "sec-hook", { locked: true });
    const after = ops.updateSection(d, "sec-hook", { body: "changed" });
    expect(after.sections.find((s) => s.id === "sec-hook")!.body).not.toBe("changed");
    expect(ops.removeSection(d, "sec-hook").sections.length).toBe(d.sections.length);
  });
  it("duplicates an activity section with a new activity and answer key", () => {
    const d = sample("lever");
    const out = ops.duplicateSection(d, "sec-calc");
    expect(out.activities.length).toBe(d.activities.length + 1);
    expect(out.answerKey.length).toBe(d.answerKey.length + 1);
    expect(validateDocument(out).ok).toBe(true);
  });
  it("duplicates a page and keeps the document valid", () => {
    const d = sample("seed");
    const out = ops.duplicatePage(d, 2);
    expect(ops.studentPageCount(out)).toBe(ops.studentPageCount(d) + 1);
    expect(validateDocument(out).ok).toBe(true);
  });
  it("adds and removes an activity with its answer key", () => {
    const d = sample("fractions");
    const added = ops.addSection(d, "activity");
    expect(validateDocument(added).ok).toBe(true);
    const sec = added.sections.find((s) => !d.sections.some((x) => x.id === s.id))!;
    const removed = ops.removeSection(added, sec.id);
    expect(removed.activities.length).toBe(d.activities.length);
    expect(removed.answerKey.length).toBe(d.answerKey.length);
  });
});

describe("text and markup", () => {
  it("renders constrained markup safely", () => {
    expect(renderInline("**a** _b_ [[c]] <i>x</i>")).toBe('<strong>a</strong> <em>b</em> <span class="term">c</span> &lt;i&gt;x&lt;/i&gt;');
    expect(renderInline("Length: ____ cm")).toBe("Length: ____ cm");
    expect(stripInline("**a** _b_ [[c]]")).toBe("a b c");
  });
});

describe("security helpers", () => {
  it("blocks private, loopback and metadata addresses", () => {
    for (const ip of ["127.0.0.1", "10.1.2.3", "172.16.5.4", "192.168.1.1", "169.254.169.254", "0.0.0.0", "::1", "fd00::1", "fe80::1", "::ffff:127.0.0.1"]) expect(isBlockedAddress(ip), ip).toBe(true);
    for (const ip of ["93.184.215.14", "2606:4700::1111"]) expect(isBlockedAddress(ip), ip).toBe(false);
  });
  it("refuses unsafe URLs before any request", async () => {
    await expect(checkUrl("file:///etc/passwd")).rejects.toThrow(/http/);
    await expect(checkUrl("http://localhost/")).rejects.toThrow();
    await expect(checkUrl("http://169.254.169.254/latest/meta-data")).rejects.toThrow();
    await expect(checkUrl("http://user:pw@example.com/")).rejects.toThrow(/credentials/);
    await expect(checkUrl("http://example.com:8080/")).rejects.toThrow(/ports/);
  });
  it("reduces HTML to text and drops scripts", () => {
    const { title, text } = htmlToText("<title>T</title><script>evil()</script><p>Hello <b>world</b></p>");
    expect(title).toBe("T");
    expect(text).toBe("Hello world");
  });
  it("prevents storage path traversal", () => {
    const s = new LocalStorage("/tmp/cs-storage-test");
    expect(() => s.resolve("../../etc/passwd")).toThrow();
    expect(() => s.resolve("sources/a/../../x")).toThrow();
    expect(s.resolve("sources/abc/def.txt")).toBe("/tmp/cs-storage-test/sources/abc/def.txt");
  });
});

describe("planning engine", () => {
  it("selects a small set of strategies suited to the learner", () => {
    const s = recommendStrategies({ questionType: "how", priorKnowledge: "new", intendedUse: "independent", grouping: "individual", targetStudentPages: 1, wantsInvestigation: false, wantsDiscussion: false, wantsRetrievalCard: false, procedural: true });
    expect(s.length).toBeGreaterThanOrEqual(3);
    expect(s.length).toBeLessThanOrEqual(6);
    expect(s).toContain("explicit-explanation");
    expect(s).toContain("worked-example");
    const confident = recommendStrategies({ questionType: "what", priorKnowledge: "confident", intendedUse: "classroom", grouping: "collaborative", targetStudentPages: 3, wantsInvestigation: true, wantsDiscussion: true, wantsRetrievalCard: true, procedural: true });
    expect(confident).toContain("faded-example");
    expect(confident).not.toContain("explicit-explanation");
  });
});
