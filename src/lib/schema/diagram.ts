/**
 * Diagram specifications and the scene-graph they compile to.
 *
 * Models produce *specifications* (validated data), never markup. Each spec
 * type is compiled by deterministic code into a SceneGraph, and the scene
 * graph is rendered to SVG by `diagrams/render.ts`, which escapes all text
 * and only emits an allowlisted set of elements and attributes.
 */
import { z } from "zod";

const id = z.string().min(1).max(80).regex(/^[A-Za-z0-9_.:-]+$/);
const label = z.string().max(160);

export const ICON_NAMES = [
  "seed",
  "sprout",
  "seedling",
  "sun",
  "water-drop",
  "soil",
  "thermometer",
  "clock",
  "magnifier",
  "document",
  "coin",
  "basket",
  "person",
  "tree",
  "pot",
  "book",
  "eye",
  "cloud",
  "ramp",
  "pulley",
  "wheel-axle",
  "lever",
  "map",
  "interview",
] as const;
export const IconName = z.enum(ICON_NAMES);
export type IconNameT = z.infer<typeof IconName>;

// ---------------------------------------------------------------- high-level specs

export const SequenceSpec = z.object({
  type: z.literal("sequence"),
  steps: z
    .array(z.object({ label: label.min(1), detail: z.string().max(200).default(""), icon: IconName.optional() }))
    .min(2)
    .max(6),
  cyclic: z.boolean().default(false),
});

export const ComparisonSpec = z.object({
  type: z.literal("comparison"),
  columns: z
    .array(z.object({ title: label.min(1), points: z.array(z.string().max(160)).min(1).max(6), icon: IconName.optional() }))
    .min(2)
    .max(3),
});

export const TimelineSpec = z.object({
  type: z.literal("timeline"),
  start: z.number().int(),
  end: z.number().int(),
  /** e.g. "CE", "years ago" – printed next to tick values. */
  unitLabel: z.string().max(20).default(""),
  events: z.array(z.object({ value: z.number(), label: label.min(1) })).min(2).max(8),
});

export const LightShadowSpec = z.object({
  type: z.literal("light-shadow"),
  objectLabel: label.default("stick"),
  times: z
    .array(
      z.object({
        label: label.min(1),
        sunElevationDeg: z.number().min(5).max(90),
        sunSide: z.enum(["left", "right", "overhead"]),
      }),
    )
    .min(2)
    .max(4),
  showLengthLabels: z.boolean().default(true),
});

export const FractionBarsSpec = z.object({
  type: z.literal("fraction-bars"),
  bars: z
    .array(z.object({ numerator: z.number().int().min(0).max(24), denominator: z.number().int().min(1).max(24), label: label.default("") }))
    .min(1)
    .max(5),
  /** Optional claim the diagram makes, checked deterministically. */
  claim: z.enum(["all-equivalent", "none", "not-equivalent"]).default("none"),
  showFractionLabels: z.boolean().default(true),
});

export const NumberLineSpec = z.object({
  type: z.literal("number-line"),
  min: z.number(),
  max: z.number(),
  step: z.number().positive(),
  /** Tick label denominator: render ticks as fractions of this denominator. */
  fractionDenominator: z.number().int().min(2).max(24).optional(),
  points: z.array(z.object({ value: z.number(), label: label })).max(8).default([]),
});

export const LeverSpec = z.object({
  type: z.literal("lever"),
  /** Distance from fulcrum to where the effort is applied (any unit). */
  effortArm: z.number().positive(),
  /** Distance from fulcrum to the load. */
  loadArm: z.number().positive(),
  unit: z.string().max(12).default("m"),
  loadLabel: label.default("load"),
  effortLabel: label.default("effort"),
  fulcrumLabel: label.default("fulcrum"),
  showDistances: z.boolean().default(true),
});

export const BarChartSpec = z.object({
  type: z.literal("bar-chart"),
  title: label.default(""),
  yLabel: label,
  unit: z.string().max(20).default(""),
  bars: z.array(z.object({ label: label.min(1), value: z.number().min(0) })).min(2).max(10),
  yMax: z.number().positive().optional(),
});

export const ConceptMapSpec = z.object({
  type: z.literal("concept-map"),
  nodes: z.array(z.object({ id, label: label.min(1) })).min(2).max(8),
  edges: z.array(z.object({ from: id, to: id, label: z.string().max(60).default("") })).max(12),
  centralNodeId: id.optional(),
});

/** Free-form annotated illustration built only from allowlisted primitives. */
export const ScenePrimitive = z.discriminatedUnion("shape", [
  z.object({ shape: z.literal("rect"), x: z.number(), y: z.number(), w: z.number().positive(), h: z.number().positive(), rx: z.number().min(0).default(0), fill: z.enum(["none", "paper", "light", "mid", "ink", "accent", "hatch"]).default("none") }),
  z.object({ shape: z.literal("circle"), cx: z.number(), cy: z.number(), r: z.number().positive(), fill: z.enum(["none", "paper", "light", "mid", "ink", "accent", "hatch"]).default("none") }),
  z.object({ shape: z.literal("ellipse"), cx: z.number(), cy: z.number(), rx: z.number().positive(), ry: z.number().positive(), fill: z.enum(["none", "paper", "light", "mid", "ink", "accent", "hatch"]).default("none") }),
  z.object({ shape: z.literal("line"), x1: z.number(), y1: z.number(), x2: z.number(), y2: z.number(), dashed: z.boolean().default(false) }),
  z.object({ shape: z.literal("polygon"), points: z.array(z.tuple([z.number(), z.number()])).min(3).max(40), fill: z.enum(["none", "paper", "light", "mid", "ink", "accent", "hatch"]).default("none"), smooth: z.boolean().default(false) }),
  z.object({ shape: z.literal("polyline"), points: z.array(z.tuple([z.number(), z.number()])).min(2).max(60), smooth: z.boolean().default(false) }),
  z.object({ shape: z.literal("arrow"), x1: z.number(), y1: z.number(), x2: z.number(), y2: z.number() }),
  z.object({ shape: z.literal("icon"), name: IconName, x: z.number(), y: z.number(), size: z.number().min(12).max(200) }),
]);

export const LabelledSceneSpec = z.object({
  type: z.literal("labelled-scene"),
  width: z.number().min(200).max(800),
  height: z.number().min(120).max(800),
  primitives: z.array(ScenePrimitive).min(1).max(60),
  callouts: z
    .array(
      z.object({
        id,
        text: label.min(1),
        anchor: z.object({ x: z.number(), y: z.number() }),
        at: z.object({ x: z.number(), y: z.number() }),
        /** Blank label the learner fills in (label activities). */
        blank: z.boolean().default(false),
      }),
    )
    .max(12),
  legend: z.array(z.object({ fill: z.enum(["light", "mid", "ink", "accent", "hatch"]), text: label })).max(5).default([]),
});

export const DiagramSpecSchema = z.discriminatedUnion("type", [
  SequenceSpec,
  ComparisonSpec,
  TimelineSpec,
  LightShadowSpec,
  FractionBarsSpec,
  NumberLineSpec,
  LeverSpec,
  BarChartSpec,
  ConceptMapSpec,
  LabelledSceneSpec,
]);
export type DiagramSpec = z.infer<typeof DiagramSpecSchema>;
export const DIAGRAM_TYPES = DiagramSpecSchema.options.map((o) => o.shape.type.value);

// ---------------------------------------------------------------- scene graph

export type Fill = "none" | "paper" | "light" | "mid" | "ink" | "accent" | "hatch" | "dots";
export type Stroke = "ink" | "muted" | "accent" | "none";

interface Base {
  id: string;
  stroke?: Stroke;
  strokeWidth?: number;
  dashed?: boolean;
}
export type SceneElement =
  | (Base & { kind: "rect"; x: number; y: number; w: number; h: number; rx?: number; fill?: Fill })
  | (Base & { kind: "circle"; cx: number; cy: number; r: number; fill?: Fill })
  | (Base & { kind: "ellipse"; cx: number; cy: number; rx: number; ry: number; fill?: Fill })
  | (Base & { kind: "line"; x1: number; y1: number; x2: number; y2: number })
  | (Base & { kind: "polyline"; points: [number, number][]; smooth?: boolean })
  | (Base & { kind: "polygon"; points: [number, number][]; fill?: Fill; smooth?: boolean })
  | (Base & { kind: "path"; d: string; fill?: Fill })
  | (Base & { kind: "arrow"; x1: number; y1: number; x2: number; y2: number; both?: boolean; curve?: number })
  | (Base & { kind: "icon"; name: IconNameT; x: number; y: number; size: number })
  | (Base & {
      kind: "text";
      x: number;
      y: number;
      text: string;
      size: number;
      anchor: "start" | "middle" | "end";
      weight?: "normal" | "bold";
      italic?: boolean;
      /** Wrap width in user units; 0 = no wrap. */
      maxWidth: number;
      role: "label" | "title" | "tick" | "detail" | "value";
      /** Editable labels can be overridden from the editor. */
      editable: boolean;
      /** Renders as an empty write-on line in student copies. */
      blank?: boolean;
    })
  | (Base & {
      kind: "callout";
      text: string;
      anchor: { x: number; y: number };
      at: { x: number; y: number };
      size: number;
      editable: boolean;
      blank?: boolean;
    });

export interface SceneGraph {
  width: number;
  height: number;
  elements: SceneElement[];
  legend: { fill: Fill; text: string }[];
}
