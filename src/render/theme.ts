// The render tokens. Every value here is written **literally** into the SVG —
// no `<style>` block, no external stylesheet, no `currentColor` — because the
// output has to be self-contained and byte-stable wherever it is dropped (D5,
// D21). A host that wants light and dark passes two themes and renders twice.
//
// The token set is deliberately flat: `opts.theme` merges shallowly, so a flat
// record means overriding one fill cannot silently drop the other four.
import type { NodeKind } from "../types.js";

export type Theme = {
  /** Painted as a full-canvas rect, so the SVG is opaque wherever it lands. */
  background: string;
  fillProcess: string;
  fillRounded: string;
  fillStadium: string;
  fillDecision: string;
  fillCircle: string;
  /** Node outline. */
  stroke: string;
  /** Node label. */
  text: string;
  /** Edge line and arrowhead. */
  edge: string;
  /** Edge label. */
  edgeText: string;
  /** Highlighted nodes and edges — what an adapter draws selection with. */
  accent: string;
  /** `debugGrid` only. */
  grid: string;
  /** Written into every `font-family`; the renderer never measures it (D5). */
  fontFamily: string;
  fontSize: number;
  edgeFontSize: number;
  nodeStrokeWidth: number;
  edgeStrokeWidth: number;
  /** `==>` edges. */
  thickStrokeWidth: number;
  /** Corner radius of a `rounded` node; a stadium uses half its height. */
  radius: number;
};

/** The theme the spike drew with, retyped onto ablauf's five node kinds. */
export const DEFAULT_THEME: Theme = {
  background: "#ffffff",
  fillProcess: "#eef2f8",
  fillRounded: "#eef2f8",
  fillStadium: "#e6f6ec",
  fillDecision: "#fdf3dd",
  fillCircle: "#e6f6ec",
  stroke: "#33405a",
  text: "#16203a",
  edge: "#5a6580",
  edgeText: "#5a6580",
  accent: "#c2410c",
  grid: "#dfe6f0",
  fontFamily: "Helvetica, Arial, sans-serif",
  fontSize: 15,
  edgeFontSize: 13,
  nodeStrokeWidth: 2,
  edgeStrokeWidth: 1.8,
  thickStrokeWidth: 3.2,
  radius: 8,
};

/** Shallow override: named tokens win, everything else stays the default. */
export const resolveTheme = (over?: Partial<Theme>): Theme => ({ ...DEFAULT_THEME, ...over });

/** The tokens that are colours: what a fill may be named from. */
type ColourToken = { [K in keyof Theme]: Theme[K] extends string ? K : never }[keyof Theme];

/**
 * Total in both directions: a new `NodeKind` fails to compile until it has a
 * fill, and a renamed token fails to compile here. A `switch` with a `default`
 * did neither — it silently gave every future kind the process fill.
 */
const FILL: Record<NodeKind, ColourToken> = {
  process: "fillProcess",
  rounded: "fillRounded",
  stadium: "fillStadium",
  decision: "fillDecision",
  circle: "fillCircle",
};

export const fillOf = (theme: Theme, kind: NodeKind): string => theme[FILL[kind]];
