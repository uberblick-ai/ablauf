// The renderer. It has ZERO layout intelligence: given positions, it draws.
// Everything that decides *where* something goes happened in the snap pass;
// everything here is a pure function of (graph, positions, options).
//
// Two things it does that the spike's renderer did not, and they are the point:
//
//   * The canvas grows (D9). The spike drew into a fixed `graph.canvas` and
//     clamped into it, which produced half its ugly placements. Here width and
//     height come from the bounding box of everything painted — node boxes,
//     highlight rings, edge-label chips — plus a margin, so a node at y=4000
//     makes a taller SVG and nothing is ever clipped or scaled to fit.
//   * The origin does not move (D18). The viewBox origin is
//     `(min(0, minBoxX - margin), min(0, minBoxY - margin))`, measured from the
//     node *boxes* — geometry, not ink — and so (0, 0) in every normal case,
//     since movable nodes are min-clamped to exactly that bound. Translating
//     the picture to its content bounds instead would shift every node on
//     screen whenever the extreme node changed, which turns "0px store drift"
//     into a lie on the only surface the user looks at; measuring the origin
//     from painted extents does the same thing 1px at a time, because a
//     clamped box's stroke reaches into the gutter.
//
// Determinism (D5, D21): fixed element order, fixed attribute order, fixed
// precision, literal theme tokens, no generated ids beyond the two arrow
// markers and the grid pattern, no clock, no randomness, no font measurement,
// and none of the approximated math D21 bans.
import { MARGIN, boxOf } from "../geometry.js";
import type { Box, Position } from "../geometry.js";
import { isPosition } from "../layout/store.js";
import type { Edge, Graph, Node } from "../types.js";
import { type Theme, fillOf, resolveTheme } from "./theme.js";

export type RenderOptions = {
  /** Shallow overrides on `DEFAULT_THEME`. */
  theme?: Partial<Theme>;
  /** Gutter between the content and the canvas edge. Defaults to `MARGIN`. */
  margin?: number;
  /** Node ids and `"from->to"` edge keys to draw with the accent token. */
  highlight?: readonly string[];
  /** The spike's coordinate grid, for debugging a layout. */
  debugGrid?: boolean;
  /** Emitted as `<title>` for accessibility; never drawn. */
  title?: string;
};

/** Anything the renderer refuses to draw. Thrown before a byte is emitted. */
export class RenderError extends Error {
  constructor(message: string) {
    super(`ablauf: ${message}`);
    this.name = "RenderError";
  }
}

/**
 * The canvas the SVG declares: the viewBox origin and the size in px. The
 * viewBox *starts* at `(originX, originY)`, so a coordinate in the SVG's own
 * user space already **is** a store coordinate — nothing to add, which is the
 * whole point of D18.
 *
 * The origin is what a host adds to a *viewport-relative* pixel offset: a
 * pointer measured from the SVG element's top-left corner, at natural size,
 * maps back as `store.x = originX + offsetX`. A host that scales the element
 * divides by its own scale first; that part is the host's, and this is the part
 * that is not guessable from the outside.
 */
export type SvgMeta = { originX: number; originY: number; width: number; height: number };

type Pt = { x: number; y: number };
type Side = "top" | "bottom" | "left" | "right";
/** An axis-aligned box in store coordinates, in the `Box` spelling. */
type Rect = { x: number; y: number; w: number; h: number };

/** Fixed precision, with the trailing `.0` trimmed: one value, one spelling. */
const num = (v: number): string => {
  const s = v.toFixed(1);
  const t = s.endsWith(".0") ? s.slice(0, -2) : s;
  return t === "-0" ? "0" : t;
};

/** Everything that reaches an attribute or a text node goes through this. */
const esc = (s: string): string =>
  s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");

type AttrValue = string | number | undefined;

/**
 * The one place an element is spelled. Every attribute value goes through `esc`
 * (strings) or `num` (numbers) *here*, so no caller can splice a theme token —
 * a value the host supplies — into markup unescaped; `undefined` drops the
 * attribute. Key insertion order is the attribute order, which is part of the
 * byte contract (D5). `body` is markup and is emitted verbatim: a caller
 * passing text escapes it.
 */
const el = (name: string, attrs: Record<string, AttrValue>, body?: string): string => {
  let out = `<${name}`;
  for (const [key, value] of Object.entries(attrs)) {
    if (value === undefined) continue;
    out += ` ${key}="${typeof value === "number" ? num(value) : esc(value)}"`;
  }
  return body === undefined ? `${out}/>` : `${out}>${body}</${name}>`;
};

/** Guards the arithmetic below: a non-finite number must never reach a byte. */
const finite = (what: string, ...values: number[]): void => {
  for (const value of values) {
    if (!Number.isFinite(value)) throw new RenderError(`${what} is not a finite number (${value})`);
  }
};

/** The key `opts.highlight` uses for an edge. Edges have no other identity. */
const edgeKey = (e: Edge): string => `${e.from}->${e.to}`;

/**
 * Boxes for every node, in document order. `strict` is the renderer's contract
 * — a missing or broken position throws, naming the node; `svgMeta` is
 * deliberately permissive, because it is plain geometry and the graph it
 * describes has no picture to be measured against anyway.
 */
const boxes = (
  graph: Graph,
  positions: Record<string, Position>,
  strict: boolean,
): Map<string, Box> => {
  const out = new Map<string, Box>();
  for (const node of graph.nodes) {
    const p: unknown = positions[node.id];
    if (p === undefined) {
      if (strict) throw new RenderError(`no position for node "${node.id}"`);
      continue;
    }
    if (!isPosition(p)) {
      if (strict) throw new RenderError(`the position for node "${node.id}" is not a finite point`);
      continue;
    }
    out.set(node.id, boxOf(node, p));
  }
  return out;
};

/** Numeric tokens SVG cannot draw with at zero: a 0px font renders no text. */
const POSITIVE: ReadonlySet<string> = new Set(["fontSize", "edgeFontSize"]);

type Resolved = { theme: Theme; margin: number };

/**
 * Options are checked once, up front, and the error names the option: every
 * number here ends up in an attribute, and an SVG carrying `width="NaN"` fails
 * silently in a viewer rather than loudly at the call site. The margin is an
 * integer because the exported transform is (D18).
 */
const resolve = (opts: RenderOptions): Resolved => {
  const margin = opts.margin ?? MARGIN;
  if (!Number.isInteger(margin) || margin < 0) {
    throw new RenderError(`options.margin must be a non-negative integer, got ${margin}`);
  }
  const theme = resolveTheme(opts.theme);
  for (const [key, value] of Object.entries(theme)) {
    if (typeof value !== "number") continue;
    const positive = POSITIVE.has(key);
    if (!Number.isFinite(value) || value < 0 || (positive && value === 0)) {
      const bound = positive ? "positive" : "non-negative";
      throw new RenderError(`options.theme.${key} must be a ${bound} finite number, got ${value}`);
    }
  }
  return { theme, margin };
};

const port = (b: Box, side: Side): Pt => {
  switch (side) {
    case "top":
      return { x: b.cx, y: b.y };
    case "bottom":
      return { x: b.cx, y: b.y + b.h };
    case "left":
      return { x: b.x, y: b.cy };
    default:
      return { x: b.x + b.w, y: b.cy };
  }
};

/**
 * The spike's dogleg router, ported verbatim. Mostly-vertical edges leave the
 * bottom and enter the top with a mid-y elbow; mostly-horizontal or backward
 * edges leave a side. It is deliberately dumb and knows nothing about
 * obstacles: a real orthogonal routing pass is deferred (see
 * docs/decisions.md, "Deliberately deferred") and is not smuggled in here.
 */
const routeEdge = (a: Box, b: Box): Pt[] => {
  const dx = b.cx - a.cx;
  const dy = b.cy - a.cy;
  if (Math.abs(dy) > 60 && b.y > a.y + a.h - 10) {
    const s = port(a, "bottom");
    const t = port(b, "top");
    if (Math.abs(dx) < 6) return [s, t];
    const my = (s.y + t.y) / 2;
    return [s, { x: s.x, y: my }, { x: t.x, y: my }, t];
  }
  const s = port(a, dx >= 0 ? "right" : "left");
  const t = port(b, dx >= 0 ? "left" : "right");
  if (Math.abs(dy) < 6) return [s, t];
  const mx = (s.x + t.x) / 2;
  return [s, { x: mx, y: s.y }, { x: mx, y: t.y }, t];
};

/**
 * The midpoint of the longest segment. Every segment the router emits is
 * axis-aligned, so `|dx| + |dy|` *is* its length: exact, order-stable on every
 * engine (D21), and — unlike the squared length D21 prescribes for the general
 * case — it cannot overflow to Infinity on a far-out coordinate and take the
 * ordering with it.
 */
const labelPos = (pts: Pt[]): Pt => {
  let best: Pt = pts[0] ?? { x: 0, y: 0 };
  let bestLen = -1;
  for (let i = 0; i + 1 < pts.length; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    if (!a || !b) continue;
    const len = Math.abs(b.x - a.x) + Math.abs(b.y - a.y);
    if (len > bestLen) {
      bestLen = len;
      best = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    }
  }
  return best;
};

/**
 * The chip behind an edge label, so the label stays readable where it crosses
 * its own edge. Its width is an arithmetic guess, not a measurement: the
 * renderer never measures text (D5). It is derived here rather than at the draw
 * site because the canvas has to be big enough to hold it.
 */
const chipOf = (label: string, at: Pt, theme: Theme): Rect => {
  const w = Math.round(label.length * theme.edgeFontSize * 0.54) + 10;
  const h = theme.edgeFontSize + 7;
  return { x: at.x - w / 2, y: at.y - h / 2, w, h };
};

/** The dashed ring a highlighted node gets, which sticks out past its box. */
const RING_PAD = 7;
const ringOf = (b: Box): Rect => ({
  x: b.x - RING_PAD,
  y: b.y - RING_PAD,
  w: b.w + 2 * RING_PAD,
  h: b.h + 2 * RING_PAD,
});

/**
 * A stroke straddles the path it follows, so half of its width paints *outside*
 * the rectangle the geometry names: a 2px-stroked box at x=0 wets the pixel at
 * x=-1. The far edge is taken from the stroked rectangle, so that half is never
 * cropped as the canvas grows (D9); the near edge is not, because the `MARGIN`
 * gutter already holds it and the origin is measured from boxes (D18).
 */
const stroked = (r: Rect, width: number): Rect => {
  const half = width / 2;
  return { x: r.x - half, y: r.y - half, w: r.w + width, h: r.h + width };
};

/**
 * Every box the renderer paints, in document order: node boxes, the rings
 * around highlighted ones, and the edge-label chips. The canvas *size* comes
 * from this rather than from node boxes alone — a long label between two short
 * nodes reaches well past every box in the picture, and D9 says nothing is
 * clipped. The *origin* does not: it comes from the boxes (D18, `metaOf`).
 * Boxes and rings are stroked and so contribute their outline too; the chip is
 * a bare fill, so its own rectangle is all of it.
 */
const painted = (
  graph: Graph,
  box: Map<string, Box>,
  theme: Theme,
  hot: ReadonlySet<string>,
): Rect[] => {
  const out: Rect[] = [];
  for (const node of graph.nodes) {
    const b = box.get(node.id);
    if (!b) continue;
    out.push(stroked(b, theme.nodeStrokeWidth));
    if (hot.has(node.id)) out.push(stroked(ringOf(b), theme.nodeStrokeWidth));
  }
  for (const e of graph.edges) {
    const a = box.get(e.from);
    const b = box.get(e.to);
    if (!a || !b || e.label === undefined || e.label === "") continue;
    out.push(chipOf(e.label, labelPos(routeEdge(a, b)), theme));
  }
  return out;
};

/**
 * The canvas, from two different measurements on purpose.
 *
 * The far edge is the bounding box of everything *painted*, so nothing is
 * clipped as the canvas grows (D9). The origin is measured from the node
 * *boxes* — the same geometry the snap pass clamps — so a movable node clamped
 * to exactly `MARGIN` leaves the origin at (0, 0) (D18) instead of dragging it
 * to -1 with the outer half of its stroke and shifting the whole picture on
 * screen at 0px store drift. The gutter is what absorbs that stroke; only a
 * *box* carried past the bound, which is a frozen node (D17), pushes the origin
 * negative, and `min(0, …)` is what lets it.
 *
 * Integers on all four numbers — the origin floored, the far edge ceiled — so
 * the exported transform is exact and rounding can only ever grow the canvas,
 * never crop it.
 */
const metaOf = (rects: readonly Rect[], nodeBoxes: readonly Rect[], margin: number): SvgMeta => {
  // Nothing painted: an empty chart is a margin-sized square of paper.
  if (rects.length === 0) return { originX: 0, originY: 0, width: 2 * margin, height: 2 * margin };
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  for (const b of nodeBoxes) {
    minX = Math.min(minX, b.x);
    minY = Math.min(minY, b.y);
  }
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const r of rects) {
    maxX = Math.max(maxX, r.x + r.w);
    maxY = Math.max(maxY, r.y + r.h);
  }
  finite("the content bounds", minX, minY, maxX, maxY);
  const originX = Math.min(0, Math.floor(minX - margin));
  const originY = Math.min(0, Math.floor(minY - margin));
  const width = Math.ceil(maxX + margin) - originX;
  const height = Math.ceil(maxY + margin) - originY;
  finite("the canvas size", originX, originY, width, height);
  return { originX, originY, width, height };
};

/**
 * The canvas `toSvg` will draw on, without drawing it. Unlike `toSvg` this is
 * permissive about positions: a node with no position is left out of the bounds
 * rather than throwing.
 */
export const svgMeta = (
  graph: Graph,
  positions: Record<string, Position>,
  opts: RenderOptions = {},
): SvgMeta => {
  const { theme, margin } = resolve(opts);
  const box = boxes(graph, positions, false);
  const hot = new Set(opts.highlight ?? []);
  return metaOf(painted(graph, box, theme, hot), [...box.values()], margin);
};

const shape = (node: Node, b: Box, theme: Theme): string => {
  const skin = {
    fill: fillOf(theme, node.kind),
    stroke: theme.stroke,
    "stroke-width": theme.nodeStrokeWidth,
  };
  if (node.kind === "decision") {
    const pts = `${num(b.cx)},${num(b.y)} ${num(b.x + b.w)},${num(b.cy)} ${num(b.cx)},${num(b.y + b.h)} ${num(b.x)},${num(b.cy)}`;
    return el("polygon", { points: pts, ...skin });
  }
  if (node.kind === "circle") {
    // The size rule (D5) gives a wide, short box, so a true circle would clip
    // the label it was sized for; the round shape is kept as an ellipse.
    return el("ellipse", { cx: b.cx, cy: b.cy, rx: b.w / 2, ry: b.h / 2, ...skin });
  }
  const rx = node.kind === "stadium" ? b.h / 2 : node.kind === "rounded" ? theme.radius : 0;
  return el("rect", { x: b.x, y: b.y, width: b.w, height: b.h, rx, ...skin });
};

const label = (x: number, y: number, size: number, fill: string, theme: Theme, text: string): string =>
  el(
    "text",
    { x, y, "text-anchor": "middle", "font-family": theme.fontFamily, "font-size": size, fill },
    esc(text),
  );

const GRID_ID = "ablauf-grid";
const GRID_CELL = 200;
const GRID_STEP = 40;

/**
 * The debug grid as one repeating cell, not a line per 40px: enumerated lines
 * made the output grow with the coordinates, and a node at x=1e9 alone is 25
 * million `<line>` elements. The cell is anchored at the viewBox origin, so the
 * major lines land on the origin and every 200px out from it — deterministic,
 * and stable while the canvas grows right and down (D18).
 */
const gridPattern = (meta: SvgMeta, theme: Theme): string => {
  const minor: string[] = [];
  for (let v = GRID_STEP; v < GRID_CELL; v += GRID_STEP) {
    minor.push(`M${num(v)},0 V${num(GRID_CELL)} M0,${num(v)} H${num(GRID_CELL)}`);
  }
  const line = (d: string, width: number): string =>
    el("path", { d, fill: "none", stroke: theme.grid, "stroke-width": width });
  return el(
    "pattern",
    {
      id: GRID_ID,
      patternUnits: "userSpaceOnUse",
      x: meta.originX,
      y: meta.originY,
      width: GRID_CELL,
      height: GRID_CELL,
    },
    line(minor.join(" "), 0.6) + line(`M0,0 V${num(GRID_CELL)} M0,0 H${num(GRID_CELL)}`, 1.4),
  );
};

/** Every id the document has: the two arrow markers, and the grid when asked. */
const defs = (theme: Theme, meta: SvgMeta, debugGrid: boolean): string => {
  const marker = (id: string, fill: string): string =>
    el(
      "marker",
      {
        id,
        viewBox: "0 0 10 10",
        refX: 9,
        refY: 5,
        markerWidth: 7,
        markerHeight: 7,
        orient: "auto-start-reverse",
      },
      el("path", { d: "M0,0 L10,5 L0,10 z", fill }),
    );
  const body =
    marker("ablauf-arrow", theme.edge) +
    marker("ablauf-arrow-accent", theme.accent) +
    (debugGrid ? gridPattern(meta, theme) : "");
  return el("defs", {}, body);
};

/**
 * Draw `graph` at `positions`. Every node in the graph needs a position and a
 * missing one throws, naming the node; entries in `positions` for ids the graph
 * has no node for are ignored, because that is exactly what an orphan is and
 * the layout store keeps orphans on purpose.
 */
export const toSvg = (
  graph: Graph,
  positions: Record<string, Position>,
  opts: RenderOptions = {},
): string => {
  const { theme, margin } = resolve(opts);
  const box = boxes(graph, positions, true);
  const hot = new Set(opts.highlight ?? []);
  const meta = metaOf(painted(graph, box, theme, hot), [...box.values()], margin);

  const parts: string[] = [];
  if (opts.title !== undefined) parts.push(el("title", {}, esc(opts.title)));
  parts.push(defs(theme, meta, opts.debugGrid === true));
  const sheet = { x: meta.originX, y: meta.originY, width: meta.width, height: meta.height };
  parts.push(el("rect", { ...sheet, fill: theme.background }));
  if (opts.debugGrid) parts.push(el("rect", { ...sheet, fill: `url(#${GRID_ID})` }));

  // Edges first, so a node's fill covers the stub of anything routed into it.
  for (const e of graph.edges) {
    const a = box.get(e.from);
    const b = box.get(e.to);
    if (!a || !b) continue;
    const pts = routeEdge(a, b);
    for (const p of pts) finite(`the route for edge "${edgeKey(e)}"`, p.x, p.y);
    const d = pts.map((p, i) => `${i ? "L" : "M"}${num(p.x)},${num(p.y)}`).join(" ");
    const accent = hot.has(edgeKey(e));
    parts.push(
      el("path", {
        d,
        fill: "none",
        stroke: accent ? theme.accent : theme.edge,
        "stroke-width": e.style === "thick" ? theme.thickStrokeWidth : theme.edgeStrokeWidth,
        "stroke-dasharray": e.style === "dotted" ? "6 4" : undefined,
        "marker-end":
          e.style === "open" ? undefined : `url(#ablauf-arrow${accent ? "-accent" : ""})`,
      }),
    );
    if (e.label !== undefined && e.label !== "") {
      const lp = labelPos(pts);
      const chip = chipOf(e.label, lp, theme);
      parts.push(
        el("rect", {
          x: chip.x,
          y: chip.y,
          width: chip.w,
          height: chip.h,
          rx: 4,
          fill: theme.background,
        }),
      );
      const colour = accent ? theme.accent : theme.edgeText;
      parts.push(
        label(lp.x, lp.y + theme.edgeFontSize / 3, theme.edgeFontSize, colour, theme, e.label),
      );
    }
  }

  for (const node of graph.nodes) {
    const b = box.get(node.id);
    if (!b) continue;
    parts.push(shape(node, b, theme));
    if (hot.has(node.id)) {
      const ring = ringOf(b);
      parts.push(
        el("rect", {
          x: ring.x,
          y: ring.y,
          width: ring.w,
          height: ring.h,
          rx: theme.radius + 4,
          fill: "none",
          stroke: theme.accent,
          "stroke-width": theme.nodeStrokeWidth,
          "stroke-dasharray": "6 4",
        }),
      );
    }
    parts.push(label(b.cx, b.cy + theme.fontSize / 3, theme.fontSize, theme.text, theme, node.label));
  }

  // One element per line. Whitespace between elements draws nothing, and it is
  // what makes `test/golden/*.svg` a diff a human can actually review.
  const view = `${num(meta.originX)} ${num(meta.originY)} ${num(meta.width)} ${num(meta.height)}`;
  const attrs = {
    xmlns: "http://www.w3.org/2000/svg",
    width: meta.width,
    height: meta.height,
    viewBox: view,
  };
  return `${el("svg", attrs, `\n${parts.join("\n")}\n`)}\n`;
};
