// The layout store: positions keyed by node id, outside the text (D4). The
// core ships the interface and one binding over plain JSON; a host binds the
// same interface to whatever it already has — a Map, a Y.Map — and nothing in
// here knows which (the core imports no host SDK, ever).
import type { Position } from "../geometry.js";
import type { Graph } from "../types.js";

export type { Position };

/** The on-disk shape. `version` is 1 and is written on every save. */
export type LayoutJson = { version: 1; nodes: Record<string, Position> };

/**
 * What the snap pass and a host agree on. Small on purpose: five members is
 * about five lines over a `Map` and about fifteen over a `Y.Map`.
 *
 * `entries` is sorted by id in code-unit order, so no consumer can accidentally
 * depend on insertion order and get a different picture on another replica (D5,
 * D21). `snapshot` is a plain `Record` and carries no order at all: JS
 * enumerates integer-like keys numerically whatever order they were defined in,
 * and such keys do reach a store as orphans. Anything that iterates uses
 * `entries`; `snapshot` is a lookup table.
 */
export interface LayoutStore {
  get(id: string): Position | undefined;
  set(id: string, p: Position): void;
  delete(id: string): void;
  entries(): [string, Position][];
  snapshot(): Record<string, Position>;
}

export interface JsonLayoutStore extends LayoutStore {
  toJSON(): LayoutJson;
}

const byCodeUnit = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/** A store entry is a position only if both coordinates are finite numbers. */
export const isPosition = (v: unknown): v is Position => {
  if (typeof v !== "object" || v === null) return false;
  const p = v as { x?: unknown; y?: unknown };
  return typeof p.x === "number" && Number.isFinite(p.x) && typeof p.y === "number" && Number.isFinite(p.y);
};

/**
 * The JSON binding. A document read off disk is filtered on load — entries
 * that are not a finite `{x, y}` pair are dropped rather than carried into the
 * geometry, where they would silently poison a box.
 */
export const jsonStore = (doc?: LayoutJson | null): JsonLayoutStore => {
  const nodes = new Map<string, Position>();
  for (const [id, p] of Object.entries(doc?.nodes ?? {})) {
    if (isPosition(p)) nodes.set(id, { x: p.x, y: p.y });
  }
  const sorted = (): [string, Position][] =>
    [...nodes.keys()].sort(byCodeUnit).map((id) => {
      const p = nodes.get(id) ?? { x: 0, y: 0 };
      return [id, { x: p.x, y: p.y }];
    });
  return {
    get: (id) => {
      const p = nodes.get(id);
      return p ? { x: p.x, y: p.y } : undefined;
    },
    set: (id, p) => {
      nodes.set(id, { x: p.x, y: p.y });
    },
    delete: (id) => {
      nodes.delete(id);
    },
    entries: sorted,
    snapshot: () => Object.fromEntries(sorted()),
    toJSON: () => ({ version: 1, nodes: Object.fromEntries(sorted()) }),
  };
};

/**
 * Ids the store has a position for that the graph has no node for. They are
 * **kept** by default — deleting a node and re-adding it under the same id
 * puts it back where it was — and the snap pass only reports them.
 */
export const orphans = (store: LayoutStore, graph: Graph): string[] => {
  const ids = new Set(graph.nodes.map((n) => n.id));
  return store
    .entries()
    .map(([id]) => id)
    .filter((id) => !ids.has(id));
};

/**
 * Drop the orphans. Nothing calls this implicitly: forgetting where a node
 * used to be is a decision the host makes, not a side effect of rendering.
 * Returns the ids removed, in code-unit order.
 */
export const pruneOrphans = (store: LayoutStore, graph: Graph): string[] => {
  const gone = orphans(store, graph);
  for (const id of gone) store.delete(id);
  return gone;
};
