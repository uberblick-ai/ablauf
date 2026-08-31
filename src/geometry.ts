// Node geometry: size, box, overlap, content bounds. Every function here is a
// pure function of the node and its centre — no measurement of glyphs, no
// environment, no state — because two replicas rendering the same document
// have to produce the same picture (D5, D21). The size rule is therefore a
// documented formula, not a metric: see docs/spec/layout-store.md.
import type { Graph, Node } from "./types.js";

/** A node **centre**, in px. Positions the snap pass writes are integers. */
export type Position = { x: number; y: number };

export type Size = { w: number; h: number };

/** A node's box: top-left corner, extent, and the centre it came from. */
export type Box = { x: number; y: number; w: number; h: number; cx: number; cy: number };

/** Everything the snap pass and the renderer measure in. */
export const GRID = 20;
export const COL = 200;
export const ROW = 120;
/** Breathing room required between two boxes before they count as clear. */
export const PAD = 14;
/** The left/top gutter every movable node stays out of (D9: no maximum). */
export const MARGIN = 20;
/**
 * How much taller a box gets, and how far apart the renderer sets baselines,
 * for every label line after the first.
 */
export const LINE_HEIGHT = 20;

/**
 * A mermaid line break, spelled the way mermaid's own label splitter spells it:
 * `<br>`, `<br/>` and `<br />`, in either ASCII case and with the internal
 * whitespace mermaid allows. Nothing else is a break — `</br>` and every other
 * tag are ordinary label text and stay visible as written.
 */
const BREAK = /<br\s*\/?>/i;

/**
 * The visible lines of a label. Breaking a label is presentation, so it is a
 * pure function of the label (D5) and this is the single definition of it: the
 * size below and the renderer read the same lines, so a box can never disagree
 * with the text drawn inside it. The marker stays in `Node.label` — turning it
 * into a newline would rewrite the user's semantics and hit `serialize`'s
 * refusal (D4, D13). A label with no break is one line, the empty label
 * included.
 */
export const labelLines = (label: string): string[] => label.split(BREAK);

/**
 * Width grows with the longest visible line and height with the number of
 * lines, both clamped to a readable range; a decision is wider and taller than
 * the rest because its diamond wastes its corners. The constants are part of
 * the determinism contract — changing them changes every chart's collision
 * behaviour, so they are spec'd, not tuned.
 */
export const sizeOf = (node: Node): Size => {
  const lines = labelLines(node.label);
  let longest = 0;
  for (const line of lines) longest = Math.max(longest, line.length);
  const w = Math.min(250, Math.max(120, Math.round(longest * 8.4) + 36));
  const grown = (lines.length - 1) * LINE_HEIGHT;
  return node.kind === "decision" ? { w: w + 44, h: 74 + grown } : { w, h: 56 + grown };
};

export const boxOf = (node: Node, p: Position): Box => {
  const { w, h } = sizeOf(node);
  return { x: p.x - w / 2, y: p.y - h / 2, w, h, cx: p.x, cy: p.y };
};

/** Do two boxes collide, counting `pad` of required clearance on every side? */
export const overlaps = (a: Box, b: Box, pad = PAD): boolean =>
  a.x - pad < b.x + b.w && a.x + a.w + pad > b.x && a.y - pad < b.y + b.h && a.y + a.h + pad > b.y;

export type Bounds = { x: number; y: number; width: number; height: number };

/**
 * The box that holds every positioned node, grown by `margin`. Nodes with no
 * position are skipped; a graph with none yields an empty box at the origin.
 * This is content geometry only — the render origin's `min(0, …)` rule (D18)
 * belongs to the renderer.
 */
export const contentBounds = (
  graph: Graph,
  positions: Record<string, Position>,
  margin = MARGIN,
): Bounds => {
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const node of graph.nodes) {
    const p = positions[node.id];
    if (!p) continue;
    const b = boxOf(node, p);
    minX = Math.min(minX, b.x);
    minY = Math.min(minY, b.y);
    maxX = Math.max(maxX, b.x + b.w);
    maxY = Math.max(maxY, b.y + b.h);
  }
  if (minX > maxX) return { x: 0, y: 0, width: 0, height: 0 };
  return {
    x: minX - margin,
    y: minY - margin,
    width: maxX - minX + 2 * margin,
    height: maxY - minY + 2 * margin,
  };
};
