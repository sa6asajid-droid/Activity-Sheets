/**
 * A small library of consistent line-art pictograms, drawn on a 48×48 grid
 * with the same stroke weight. They support recognition in diagrams; they are
 * never the sole carrier of meaning (every icon sits beside a text label).
 *
 * Each entry is a list of path strings (stroke-only) plus optional circles.
 */
import type { IconNameT } from "../schema/diagram";

export interface IconDef {
  paths: string[];
  circles?: [number, number, number][];
  /** Paths drawn with a solid ink fill (small details only). */
  filled?: string[];
}

export const ICONS: Record<IconNameT, IconDef> = {
  seed: {
    paths: ["M24 7 C35 13 37 31 24 41 C11 31 13 13 24 7 Z", "M24 12 C21 21 21 30 24 37"],
  },
  sprout: {
    paths: [
      "M15 27 C21 20 31 22 31 30 C31 38 19 39 15 27 Z",
      "M21 36 C20 40 22 43 18 46",
      "M24 37 C25 41 23 44 26 46",
      "M27 23 C28 16 25 11 21 8",
      "M21 8 C25 8 28 10 28 13",
    ],
  },
  seedling: {
    paths: [
      "M24 44 L24 21",
      "M24 30 C16 30 11 25 11 18 C19 18 24 22 24 30 Z",
      "M24 25 C32 25 37 20 37 13 C29 13 24 17 24 25 Z",
      "M8 44 L40 44",
    ],
  },
  sun: {
    paths: [
      "M24 4 L24 9",
      "M24 39 L24 44",
      "M4 24 L9 24",
      "M39 24 L44 24",
      "M9.9 9.9 L13.4 13.4",
      "M34.6 34.6 L38.1 38.1",
      "M9.9 38.1 L13.4 34.6",
      "M34.6 13.4 L38.1 9.9",
    ],
    circles: [[24, 24, 9]],
  },
  "water-drop": {
    paths: ["M24 6 C30 16 36 22 36 30 A12 12 0 0 1 12 30 C12 22 18 16 24 6 Z", "M18 30 A6 6 0 0 0 23 36"],
  },
  soil: {
    paths: ["M4 18 C12 15 18 20 24 17 C30 14 36 19 44 16", "M4 18 L4 42 L44 42 L44 16"],
    circles: [
      [12, 27, 1.6],
      [22, 33, 1.6],
      [32, 26, 1.6],
      [37, 35, 1.6],
      [15, 37, 1.6],
    ],
  },
  thermometer: {
    paths: ["M20 30 L20 9 A4 4 0 0 1 28 9 L28 30", "M24 33 L24 14", "M30 12 L33 12", "M30 18 L33 18", "M30 24 L33 24"],
    circles: [[24, 36, 7]],
  },
  clock: {
    paths: ["M24 13 L24 24 L32 29"],
    circles: [[24, 24, 17]],
  },
  magnifier: {
    paths: ["M30 30 L42 42", "M14 20 A7 7 0 0 1 20 14"],
    circles: [[21, 21, 12]],
  },
  document: {
    paths: ["M12 5 L30 5 L38 13 L38 43 L12 43 Z", "M30 5 L30 13 L38 13", "M17 20 L33 20", "M17 26 L33 26", "M17 32 L33 32", "M17 38 L27 38"],
  },
  coin: {
    paths: ["M17 24 L31 24", "M24 17 L24 31"],
    circles: [
      [24, 24, 17],
      [24, 24, 12],
    ],
  },
  basket: {
    paths: ["M7 20 L41 20 L36 42 L12 42 Z", "M14 20 C14 8 34 8 34 20", "M10 28 L38 28", "M11 35 L37 35", "M20 20 L21 42", "M28 20 L27 42"],
  },
  person: {
    paths: ["M24 17 L24 32", "M24 21 L15 28", "M24 21 L33 28", "M24 32 L17 44", "M24 32 L31 44"],
    circles: [[24, 10, 6]],
  },
  tree: {
    paths: ["M24 44 L24 28", "M24 34 L18 29", "M24 31 L30 26", "M24 29 C10 30 7 18 15 13 C15 5 30 3 33 11 C42 12 42 27 31 28 Z"],
  },
  pot: {
    paths: ["M17 6 L31 6", "M19 6 L19 12 C9 16 8 32 14 40 L34 40 C40 32 39 16 29 12 L29 6", "M12 24 L36 24", "M14 31 L34 31"],
  },
  book: {
    paths: ["M24 12 C18 8 11 8 5 10 L5 40 C11 38 18 38 24 42 C30 38 37 38 43 40 L43 10 C37 8 30 8 24 12 Z", "M24 12 L24 42"],
  },
  eye: {
    paths: ["M4 24 C12 12 36 12 44 24 C36 36 12 36 4 24 Z"],
    circles: [[24, 24, 6]],
  },
  cloud: {
    paths: ["M13 36 C5 36 5 26 12 25 C11 17 22 13 26 20 C29 14 39 16 38 24 C45 24 45 36 37 36 Z"],
  },
  ramp: {
    paths: ["M4 40 L44 40 L44 16 Z", "M20 26 L28 21 L31 26 L23 31 Z"],
  },
  pulley: {
    paths: ["M24 4 L24 12", "M15 20 L15 38", "M33 20 L33 30", "M28 30 L38 30 L38 40 L28 40 Z", "M12 4 L36 4"],
    circles: [
      [24, 20, 9],
      [24, 20, 2],
    ],
  },
  "wheel-axle": {
    paths: ["M24 24 L41 24", "M41 24 L41 40"],
    circles: [
      [24, 24, 17],
      [24, 24, 5],
    ],
  },
  lever: {
    paths: ["M4 22 L44 30", "M24 26 L18 40 L30 40 Z", "M6 14 L14 14 L14 21 L6 20 Z"],
  },
  map: {
    paths: ["M5 10 L17 6 L31 10 L43 6 L43 38 L31 42 L17 38 L5 42 Z", "M17 6 L17 38", "M31 10 L31 42", "M22 20 L26 24 M26 20 L22 24"],
  },
  interview: {
    paths: [
      "M6 8 L26 8 L26 22 L14 22 L9 27 L9 22 L6 22 Z",
      "M42 18 L22 18 L22 32 L34 32 L39 37 L39 32 L42 32 Z",
    ],
  },
};
