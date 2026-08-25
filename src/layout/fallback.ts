// Where a node goes when nothing says where it goes. This is the whole of
// ablauf's placement intelligence, and it is deliberately about ten lines: the
// freeze rule already keeps every known node still (D6), so the only thing
// left to get wrong is one new node, and getting it slightly wrong is ugly,
// never scrambled (D7). A model that has an opinion emits a directive instead.
import { COL, ROW } from "../geometry.js";
import type { Position } from "../geometry.js";
import type { Graph } from "../types.js";

/** Neighbours by id, each list in edge document order. */
export type Adjacency = { ins: Map<string, string[]>; outs: Map<string, string[]> };

export const adjacency = (graph: Graph): Adjacency => {
  const ins = new Map<string, string[]>();
  const outs = new Map<string, string[]>();
  for (const n of graph.nodes) {
    ins.set(n.id, []);
    outs.set(n.id, []);
  }
  for (const e of graph.edges) {
    outs.get(e.from)?.push(e.to);
    ins.get(e.to)?.push(e.from);
  }
  return { ins, outs };
};

export const neighbours = (adj: Adjacency, id: string): string[] => [
  ...(adj.ins.get(id) ?? []),
  ...(adj.outs.get(id) ?? []),
];

/** The point a node with no other claim on it asks for. */
export const ORIGIN: Position = { x: COL / 2, y: ROW / 2 };

/**
 * One row below the first placed parent; failing that, one row above the first
 * placed child; failing that, the origin cell. The snap pass then grid-snaps,
 * clamps and resolves overlaps, so this only has to name a neighbourhood.
 */
export const fallbackPoint = (
  id: string,
  adj: Adjacency,
  placed: (id: string) => Position | undefined,
): Position => {
  for (const parent of adj.ins.get(id) ?? []) {
    const p = placed(parent);
    if (p) return { x: p.x, y: p.y + ROW };
  }
  for (const child of adj.outs.get(id) ?? []) {
    const p = placed(child);
    if (p) return { x: p.x, y: p.y - ROW };
  }
  return { ...ORIGIN };
};
