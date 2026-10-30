/**
 * Independent, deterministic validation of numerical answers. Model-written
 * answers are never trusted for arithmetic: every computation attached to an
 * activity is recomputed here and compared with the answer key.
 */
import type { Computation } from "./schema/document";
import { mechanicalAdvantage } from "./diagrams/compile";
import { fractionsEquivalent } from "./diagrams/checks";

/** Tiny recursive-descent evaluator for + - * / and parentheses. No eval(). */
export function evaluateArithmetic(expr: string): number {
  if (!/^[0-9+\-*/(). ]+$/.test(expr)) throw new Error("Unsupported characters in expression");
  // Spaces may separate tokens but never join digits ("2 2" is an error, not 22).
  const src = expr.trim();
  let i = 0;
  const skip = () => {
    while (src[i] === " ") i++;
  };
  const peek = () => {
    skip();
    return src[i];
  };
  function number(): number {
    skip();
    const start = i;
    while (i < src.length && /[0-9.]/.test(src[i])) i++;
    if (start === i) throw new Error(`Expected a number at position ${i}`);
    const v = Number(src.slice(start, i));
    if (!Number.isFinite(v)) throw new Error("Invalid number");
    return v;
  }
  function factor(): number {
    if (peek() === "-") {
      i++;
      return -factor();
    }
    if (peek() === "(") {
      i++;
      const v = expression();
      if (peek() !== ")") throw new Error("Missing closing parenthesis");
      i++;
      return v;
    }
    return number();
  }
  function term(): number {
    let v = factor();
    while (peek() === "*" || peek() === "/") {
      const op = src[i++];
      const r = factor();
      if (op === "/" && r === 0) throw new Error("Division by zero");
      v = op === "*" ? v * r : v / r;
    }
    return v;
  }
  function expression(): number {
    let v = term();
    while (peek() === "+" || peek() === "-") {
      const op = src[i++];
      const r = term();
      v = op === "+" ? v + r : v - r;
    }
    return v;
  }
  const result = expression();
  skip();
  if (i !== src.length) throw new Error(`Unexpected "${src[i]}" at position ${i}`);
  return result;
}

export interface ComputationResult {
  itemId: string;
  ok: boolean;
  computed: string;
  expected: string;
  message: string;
}

export function runComputation(c: Computation): ComputationResult {
  try {
    switch (c.kind) {
      case "fraction-equivalence": {
        const eq = fractionsEquivalent(c.a, c.b);
        return {
          itemId: c.itemId,
          ok: eq === c.expected,
          computed: eq ? "equivalent" : "not equivalent",
          expected: c.expected ? "equivalent" : "not equivalent",
          message: `${c.a[0]}/${c.a[1]} and ${c.b[0]}/${c.b[1]} are ${eq ? "" : "not "}equivalent.`,
        };
      }
      case "missing-numerator": {
        const v = (c.a[0] * c.denominator) / c.a[1];
        return {
          itemId: c.itemId,
          ok: Math.abs(v - c.expected) < 1e-9,
          computed: String(v),
          expected: String(c.expected),
          message: `${c.a[0]}/${c.a[1]} = ${v}/${c.denominator}.`,
        };
      }
      case "arithmetic": {
        const v = evaluateArithmetic(c.expression);
        return {
          itemId: c.itemId,
          ok: Math.abs(v - c.expected) <= c.tolerance + 1e-9,
          computed: String(Math.round(v * 1e6) / 1e6),
          expected: String(c.expected),
          message: `${c.expression} = ${Math.round(v * 1e6) / 1e6}.`,
        };
      }
      case "percent-change": {
        if (c.from === 0) throw new Error("Percent change from zero is undefined");
        const v = ((c.to - c.from) / c.from) * 100;
        return {
          itemId: c.itemId,
          ok: Math.abs(v - c.expected) <= c.tolerance + 1e-9,
          computed: `${Math.round(v * 100) / 100}%`,
          expected: `${c.expected}%`,
          message: `From ${c.from} to ${c.to} is a ${Math.round(v * 100) / 100}% change.`,
        };
      }
      case "mechanical-advantage": {
        const v = mechanicalAdvantage(c.effortArm, c.loadArm);
        return {
          itemId: c.itemId,
          ok: Math.abs(v - c.expected) <= c.tolerance + 1e-9,
          computed: String(Math.round(v * 1000) / 1000),
          expected: String(c.expected),
          message: `Ideal mechanical advantage = ${c.effortArm} ÷ ${c.loadArm} = ${Math.round(v * 1000) / 1000}.`,
        };
      }
    }
  } catch (e) {
    return { itemId: c.itemId, ok: false, computed: "error", expected: String((c as { expected?: unknown }).expected), message: (e as Error).message };
  }
}

// ---------------------------------------------------------------- units

const LENGTH_TO_M: Record<string, number> = { mm: 0.001, cm: 0.01, m: 1, km: 1000, in: 0.0254, ft: 0.3048, yd: 0.9144, mi: 1609.344 };
const MASS_TO_KG: Record<string, number> = { g: 0.001, kg: 1, oz: 0.028349523125, lb: 0.45359237 };

export function convertUnit(value: number, from: string, to: string): number {
  if (from in LENGTH_TO_M && to in LENGTH_TO_M) return (value * LENGTH_TO_M[from]) / LENGTH_TO_M[to];
  if (from in MASS_TO_KG && to in MASS_TO_KG) return (value * MASS_TO_KG[from]) / MASS_TO_KG[to];
  if ((from === "C" || from === "°C") && (to === "F" || to === "°F")) return (value * 9) / 5 + 32;
  if ((from === "F" || from === "°F") && (to === "C" || to === "°C")) return ((value - 32) * 5) / 9;
  if (from === to) return value;
  throw new Error(`Cannot convert ${from} to ${to}`);
}

/** Page sizes in millimetres. */
export const PAGE_SIZES_MM = {
  letter: { w: 215.9, h: 279.4 },
  a4: { w: 210, h: 297 },
} as const;

export function pageBoxMm(size: "letter" | "a4", orientation: "portrait" | "landscape") {
  const p = PAGE_SIZES_MM[size];
  return orientation === "portrait" ? { w: p.w, h: p.h } : { w: p.h, h: p.w };
}

export function contentBoxMm(
  size: "letter" | "a4",
  orientation: "portrait" | "landscape",
  margins: { top: number; bottom: number; inner: number; outer: number },
  bindingMm: number,
) {
  const page = pageBoxMm(size, orientation);
  return { w: page.w - margins.inner - margins.outer - bindingMm, h: page.h - margins.top - margins.bottom };
}
