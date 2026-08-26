// The snap pass: previous positions + directives -> the positions to render.
// This is the safety-critical component (D8). Everything it does is arranged
// around one invariant:
//
//   a node that has a position and is not named by a directive is emitted
//   verbatim — not clamped, not grid-snapped, not overlap-resolved.
//
// So a bad directive set, a hostile one, or a model that lost its mind can
// make the picture ugly and can never scramble it. The pass takes any input
// and returns a layout plus warnings; it throws only when one of its own
// invariants is broken, which is the other half of failing loudly.
import { COL, GRID, MARGIN, ROW, boxOf, overlaps, sizeOf } from "../geometry.js";
import type { Box, Position } from "../geometry.js";
import type { Graph, Node } from "../types.js";
import { ORIGIN, adjacency, fallbackPoint, neighbours } from "./fallback.js";
import { isPosition } from "./store.js";

/** The twelve spellings of a direction; `up`/`down` alias `above`/`below`. */
export type Dir =
  | "above"
  | "above-left"
  | "above-right"
  | "below"
  | "below-left"
  | "below-right"
  | "left"
  | "right"
  | "up"
  | "down";

/**
 * What a human drag or a model emits, one per node it wants moved. Anything
 * not named here cannot move, which is the whole point (D7).
 */
export type Directive =
  | { id: string; rel: { of: string; dir: Dir; steps?: number } }
  | { id: string; delta: { dx: number; dy: number } }
  | { id: string; cell: { col: number; row: number } }
  | { id: string; at: { x: number; y: number } };

export type WarningCode =
  | "orphan"
  | "invalid-position"
  | "unknown-node"
  | "duplicate-directive"
  | "invalid-directive"
  | "unresolvable-anchor"
  | "min-clamped"
  | "displaced"
  | "frozen-overlap"
  | "frozen-out-of-bounds";

/** `ids` names the nodes the warning is about; branch on `code`, show `message`. */
export type Warning = { code: WarningCode; ids: string[]; message: string };

/**
 * `positions` is every graph node's centre — the full picture to render.
 * `writes` is the subset a host has to persist: the nodes whose stored entry is
 * missing, not a finite point, or numerically different. A frozen node, and a
 * node whose directive happened to resolve back to where it already was, are in
 * `positions` and not in `writes` (D27).
 */
export type SnapResult = {
  positions: Record<string, Position>;
  writes: Record<string, Position>;
  warnings: Warning[];
};

const DIRS = new Map<string, readonly [number, number]>([
  ["above", [0, -1]],
  ["above-left", [-1, -1]],
  ["above-right", [1, -1]],
  ["below", [0, 1]],
  ["below-left", [-1, 1]],
  ["below-right", [1, 1]],
  ["left", [-1, 0]],
  ["right", [1, 0]],
  ["up", [0, -1]],
  ["down", [0, 1]],
]);

/**
 * How far the overlap search may go before the pass declares its own logic
 * broken. Nothing sane reaches it: a node blocks a few hundred grid cells at
 * most, so a free cell exists within a handful of rings of any request.
 */
const MAX_RING = 512;

const byCodeUnit = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

const obj = (v: unknown): Record<string, unknown> | undefined =>
  typeof v === "object" && v !== null ? (v as Record<string, unknown>) : undefined;

const onGrid = (v: number): number => Math.round(v / GRID) * GRID;

/** The smallest centre that keeps a node's box out of the gutter, in px. */
const boundCentre = (node: Node): Position => {
  const { w, h } = sizeOf(node);
  return { x: MARGIN + w / 2, y: MARGIN + h / 2 };
};

/**
 * The same bound rounded up to the grid, which is where a *movable* node goes:
 * it has to be on the grid as well as in bounds. Frozen positions are checked
 * against `boundCentre` instead — a stored centre a few px off the grid is in
 * bounds if its box is, and rounding would report it as an escape.
 */
const minCentre = (node: Node): Position => {
  const min = boundCentre(node);
  return { x: Math.ceil(min.x / GRID) * GRID, y: Math.ceil(min.y / GRID) * GRID };
};

const warn = (code: WarningCode, ids: string[], message: string): Warning => ({ code, ids, message });

/**
 * Turn directives into coordinates.
 *
 * `prev` is the layout store's snapshot; `directives` may be empty, malformed,
 * contradictory or enormous. Returns every graph node's centre, the minimal set
 * of them a host has to write back, and what the pass had to say about the
 * input. See docs/spec/layout-store.md.
 */
export const snap = (
  graph: Graph,
  prev: Record<string, Position> = {},
  directives: readonly Directive[] = [],
): SnapResult => {
  const byId = new Map(graph.nodes.map((n) => [n.id, n]));
  const adj = adjacency(graph);
  const input: Warning[] = [];
  const during: Warning[] = [];
  const emitted: Warning[] = [];

  // --- what the store already knows --------------------------------------
  // Orphans are kept, not pruned: re-adding a node under the same id puts it
  // back where it was. Entries that are not a finite point are not positions,
  // so their node counts as new rather than being frozen at a non-place.
  const known = new Map<string, Position>();
  const store = obj(prev) ?? {};
  for (const id of Object.keys(store).sort(byCodeUnit)) {
    if (!byId.has(id)) {
      input.push(warn("orphan", [id], `the layout store has a position for "${id}", which the chart has no node for; kept`));
      continue;
    }
    const p = store[id];
    if (!isPosition(p)) {
      input.push(warn("invalid-position", [id], `the layout store's entry for "${id}" is not a finite point; treated as unplaced`));
      continue;
    }
    known.set(id, { x: p.x, y: p.y });
  }

  // --- what the directives ask for ---------------------------------------
  // Keyed by id, last one wins (D19), so the order of the list carries no
  // meaning and two callers who send the same set get the same picture.
  const chosen = new Map<string, Directive>();
  const count = new Map<string, number>();
  let shapeless = 0;
  for (const raw of directives as readonly unknown[]) {
    const d = obj(raw);
    const id = d?.id;
    if (!d || typeof id !== "string") {
      shapeless++;
      continue;
    }
    count.set(id, (count.get(id) ?? 0) + 1);
    chosen.set(id, raw as Directive);
  }
  if (shapeless > 0) {
    input.push(warn("invalid-directive", [], `${shapeless} directive(s) ignored: not an object with a string id`));
  }
  for (const id of [...chosen.keys()].sort(byCodeUnit)) {
    if (byId.has(id)) continue;
    input.push(warn("unknown-node", [id], `directive for "${id}" ignored: the chart has no such node`));
    chosen.delete(id);
  }
  for (const id of [...count.keys()].sort(byCodeUnit)) {
    const n = count.get(id) ?? 0;
    if (n > 1) input.push(warn("duplicate-directive", [id], `${n} directives for "${id}"; the last one wins`));
  }

  // --- the freeze rule ----------------------------------------------------
  const placed = new Map<string, Position>();
  const frozen: Node[] = [];
  const movable: Node[] = [];
  for (const node of graph.nodes) {
    const p = known.get(node.id);
    if (p && !chosen.has(node.id)) {
      frozen.push(node);
      placed.set(node.id, p);
    } else {
      movable.push(node);
    }
  }

  const pending = new Set(movable.map((n) => n.id));
  const at = (id: string): Position | undefined => placed.get(id);

  /** Where a node ends up when its directive says nothing usable. */
  const fallback = (node: Node): Position => known.get(node.id) ?? fallbackPoint(node.id, adj, at);

  /**
   * The point a node asks for, or `null` to try again once something it is
   * anchored on has been placed. Warnings about the ask are emitted here; the
   * ask itself is not yet snapped, clamped or checked for overlaps.
   */
  const request = (node: Node): Position | null => {
    const d = chosen.get(node.id);
    if (!d) {
      // A new node with no directive hangs off a neighbour, so wait for one
      // that is still coming rather than settling for the origin.
      const near = neighbours(adj, node.id);
      if (!near.some((id) => placed.has(id)) && near.some((id) => id !== node.id && pending.has(id))) {
        return null;
      }
      return fallback(node);
    }
    const f = d as unknown as Record<string, unknown>;
    const invalid = (detail: string): Position => {
      during.push(warn("invalid-directive", [node.id], `directive for "${node.id}" ${detail}`));
      return fallback(node);
    };

    const rel = obj(f.rel);
    if (rel) {
      const of = rel.of;
      const dir = typeof rel.dir === "string" ? DIRS.get(rel.dir as string) : undefined;
      const steps = rel.steps ?? 1;
      if (typeof of !== "string" || !dir || !isNum(steps)) return invalid("is not a usable `rel`");
      const anchor = placed.get(of);
      if (!anchor) {
        if (of !== node.id && pending.has(of)) return null;
        during.push(warn("unresolvable-anchor", [node.id, of], `"${node.id}" is placed relative to "${of}", which never resolves; auto-placed instead`));
        return fallback(node);
      }
      return { x: anchor.x + dir[0] * COL * steps, y: anchor.y + dir[1] * ROW * steps };
    }

    const delta = obj(f.delta);
    if (delta) {
      const base = known.get(node.id);
      const dx = delta.dx;
      const dy = delta.dy;
      if (!base) return invalid("moves it by a delta, but it has no previous position");
      if (!isNum(dx) || !isNum(dy)) return invalid("is not a usable `delta`");
      return { x: base.x + dx, y: base.y + dy };
    }

    const cell = obj(f.cell);
    if (cell) {
      const col = cell.col;
      const row = cell.row;
      if (!isNum(col) || !isNum(row)) return invalid("is not a usable `cell`");
      return { x: COL / 2 + col * COL, y: ROW / 2 + row * ROW };
    }

    const point = obj(f.at);
    if (point) {
      const x = point.x;
      const y = point.y;
      if (!isNum(x) || !isNum(y)) return invalid("is not a usable `at`");
      return { x, y };
    }

    return invalid("names none of `rel`, `delta`, `cell`, `at`");
  };

  /**
   * The nearest free on-grid centre, by increasing distance from the point the
   * node asked for, with a fixed candidate order inside each distance (D19).
   * Candidates that break the minimum bound are skipped, never clamped: that
   * is what stops the resolver from trading an overlap for an escape.
   */
  const nearestFree = (node: Node, want: Position): Position => {
    const min = minCentre(node);
    const taken: Box[] = [];
    for (const [id, p] of placed) {
      const other = byId.get(id);
      if (other) taken.push(boxOf(other, p));
    }
    const fits = (p: Position): boolean => {
      const b = boxOf(node, p);
      return !taken.some((t) => overlaps(b, t));
    };
    let inner = -1;
    for (let r = 2; r <= MAX_RING; r *= 2) {
      const ring: [number, number, number][] = [];
      for (let dx = -r; dx <= r; dx++) {
        for (let dy = -r; dy <= r; dy++) {
          const d2 = dx * dx + dy * dy;
          if (d2 > r * r || d2 <= inner) continue;
          ring.push([d2, dx, dy]);
        }
      }
      ring.sort((a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2]);
      for (const [, dx, dy] of ring) {
        const p = { x: want.x + dx * GRID, y: want.y + dy * GRID };
        if (p.x < min.x || p.y < min.y) continue;
        if (fits(p)) return p;
      }
      inner = r * r;
    }
    throw new Error(
      `ablauf: no free position for "${node.id}" within ${MAX_RING} grid steps of (${want.x}, ${want.y})`,
    );
  };

  /** Snap, clamp, resolve — in that order, and for every movable node. */
  const place = (node: Node, want: Position): void => {
    let p = { x: onGrid(want.x), y: onGrid(want.y) };
    if (!Number.isSafeInteger(p.x) || !Number.isSafeInteger(p.y)) {
      during.push(warn("invalid-directive", [node.id], `"${node.id}" asked for a point that is not an exact integer coordinate; auto-placed instead`));
      p = { x: ORIGIN.x, y: ORIGIN.y };
    }
    const min = minCentre(node);
    if (p.x < min.x || p.y < min.y) {
      p = { x: Math.max(p.x, min.x), y: Math.max(p.y, min.y) };
      during.push(warn("min-clamped", [node.id], `"${node.id}" would sit in the top-left gutter; moved to (${p.x}, ${p.y})`));
    }
    const free = nearestFree(node, p);
    if (free.x !== p.x || free.y !== p.y) {
      during.push(warn("displaced", [node.id], `(${p.x}, ${p.y}) was occupied; "${node.id}" moved to the nearest free cell (${free.x}, ${free.y})`));
    }
    placed.set(node.id, free);
  };

  // --- place the movable nodes -------------------------------------------
  // Document order, repeated until nothing more resolves, so a directive can
  // chain off a node this same pass is placing. Order within a pass is the
  // graph's, never the directive list's (D19).
  const queue = [...movable];
  for (let pass = 0; queue.length > 0 && pass <= movable.length; pass++) {
    let progressed = false;
    for (const node of [...queue]) {
      const want = request(node);
      if (want === null) continue;
      queue.splice(queue.indexOf(node), 1);
      pending.delete(node.id);
      place(node, want);
      progressed = true;
    }
    if (!progressed) break;
  }
  // Left over: an anchor cycle, or a new node whose only neighbours are in the
  // same knot. Both settle in document order, on whatever is placed by now.
  for (const node of queue) {
    if (chosen.has(node.id)) {
      during.push(warn("unresolvable-anchor", [node.id], `"${node.id}" is anchored on a chain that never resolves; auto-placed instead`));
    }
    pending.delete(node.id);
    place(node, fallback(node));
  }

  // --- what the emitted layout says about itself -------------------------
  // Frozen boxes may overlap each other (D17) and may sit outside the bound if
  // they were stored there. Both are reported and neither is touched: the
  // freeze rule outranks beauty, and "fixing" it here is the one failure this
  // project cannot afford.
  for (let i = 0; i < frozen.length; i++) {
    const a = frozen[i];
    const pa = a && placed.get(a.id);
    if (!a || !pa) continue;
    for (let j = i + 1; j < frozen.length; j++) {
      const b = frozen[j];
      const pb = b && placed.get(b.id);
      if (!b || !pb) continue;
      if (overlaps(boxOf(a, pa), boxOf(b, pb))) {
        emitted.push(warn("frozen-overlap", [a.id, b.id], `"${a.id}" and "${b.id}" overlap; both are frozen, so both are left where they are`));
      }
    }
  }
  for (const node of frozen) {
    const p = placed.get(node.id);
    const min = boundCentre(node);
    if (p && (p.x < min.x || p.y < min.y)) {
      emitted.push(warn("frozen-out-of-bounds", [node.id], `"${node.id}" is stored outside the top-left bound; frozen, so it is emitted as stored`));
    }
  }

  // `Object.fromEntries`, not assignment: a node id may legally be `__proto__`,
  // and `positions[id] = p` would call the legacy setter instead of creating an
  // own property, dropping that node's position out of the result entirely.
  // Everything else here is keyed in a `Map` for the same reason.
  const positions: Record<string, Position> = Object.fromEntries(
    graph.nodes.map((node) => {
      const p = placed.get(node.id);
      if (!p) throw new Error(`ablauf: the snap pass emitted no position for "${node.id}"`);
      return [node.id, p] as const;
    }),
  );
  // The minimal write set (D27). Hosts render `positions` and persist only this:
  // rewriting a node whose stored coordinate is already correct is a competing
  // write, and in a keyed CRDT store a competing write can defeat a concurrent
  // drag of that node on another replica. `known` is exactly "prev had a finite
  // point for this graph node", so an absent, invalid or orphan entry falls
  // through to a write and an unknown id can never reach one. Graph document
  // order, never `prev`'s key order (D21).
  const writes: Record<string, Position> = Object.fromEntries(
    graph.nodes.flatMap((node) => {
      const p = placed.get(node.id) as Position;
      const was = known.get(node.id);
      if (was && was.x === p.x && was.y === p.y) return [];
      return [[node.id, p] as const];
    }),
  );
  return { positions, writes, warnings: [...input, ...during, ...emitted] };
};
