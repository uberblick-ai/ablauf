// The snap pass is the safety-critical component (D8), so this file defends
// the four properties docs/spec/layout-store.md claims, in the same words:
// frozen nodes never move, movable nodes never overlap, movable nodes never
// escape the minimum bound, and the whole thing is deterministic. Everything
// else here is either a named regression or one of the twelve spike scenarios.
//
// The generators are deliberately hostile: malformed directives, unknown ids,
// absurd coordinates, cyclic anchors, hundreds at a time. A generator narrowed
// to well-formed input is how a freeze-rule test quietly stops testing the
// freeze rule.
import { readFileSync } from "node:fs";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  COL,
  GRID,
  MARGIN,
  PAD,
  ROW,
  boxOf,
  contentBounds,
  isPosition,
  jsonStore,
  overlaps,
  pruneOrphans,
  sizeOf,
  snap,
} from "../src/index.js";
import type { Directive, Graph, Node, NodeKind, Position, SnapResult } from "../src/index.js";

const SPEC = readFileSync(new URL("../docs/spec/layout-store.md", import.meta.url), "utf8");

const spike = <T,>(name: string): T =>
  JSON.parse(readFileSync(new URL(`../fixtures/spike/${name}`, import.meta.url), "utf8")) as T;

const chart = (nodes: [string, string, NodeKind?][], edges: [string, string][] = []): Graph => ({
  direction: "TD",
  nodes: nodes.map(([id, label, kind]) => ({ id, label, kind: kind ?? "process" })),
  edges: edges.map(([from, to]) => ({ from, to, style: "arrow" })),
});

// ---------------------------------------------------------------------------
// the properties, as assertions
// ---------------------------------------------------------------------------

const named = (directives: readonly unknown[]): Set<string> => {
  const out = new Set<string>();
  for (const d of directives) {
    if (d && typeof d === "object" && typeof (d as { id?: unknown }).id === "string") {
      out.add((d as { id: string }).id);
    }
  }
  return out;
};

/** The freeze rule, restated by the test rather than imported from the code. */
const split = (graph: Graph, prev: Record<string, unknown>, directives: readonly unknown[]) => {
  const asked = named(directives);
  const frozen = graph.nodes.filter((n) => isPosition(prev[n.id]) && !asked.has(n.id));
  const ids = new Set(frozen.map((n) => n.id));
  return { frozen, movable: graph.nodes.filter((n) => !ids.has(n.id)) };
};

const expectSafe = (
  graph: Graph,
  prev: Record<string, unknown>,
  directives: readonly unknown[],
  result: SnapResult,
): void => {
  const { frozen, movable } = split(graph, prev, directives);
  // `hasOwn`, not a plain read: for a node called `__proto__` a plain read goes
  // through the legacy accessor and hands back whatever was set as a prototype,
  // which looks exactly like a position and is not one.
  const at = (n: Node): Position => {
    expect(Object.hasOwn(result.positions, n.id), `own position for ${n.id}`).toBe(true);
    return result.positions[n.id] as Position;
  };

  // 1 — frozen nodes never move, byte for byte.
  for (const n of frozen) {
    expect(at(n), `frozen ${n.id}`).toEqual(prev[n.id] as Position);
  }

  // 2 — no movable node overlaps anything.
  for (const n of movable) {
    const box = boxOf(n, at(n));
    for (const other of graph.nodes) {
      if (other.id === n.id) continue;
      expect(overlaps(box, boxOf(other, at(other))), `${n.id} overlaps ${other.id}`).toBe(false);
    }
  }

  // 2 (D17) — frozen overlaps survive, and say so.
  for (let i = 0; i < frozen.length; i++) {
    for (let j = i + 1; j < frozen.length; j++) {
      const a = frozen[i] as Node;
      const b = frozen[j] as Node;
      if (!overlaps(boxOf(a, at(a)), boxOf(b, at(b)))) continue;
      const reported = result.warnings.some(
        (w) => w.code === "frozen-overlap" && w.ids.includes(a.id) && w.ids.includes(b.id),
      );
      expect(reported, `frozen-overlap warning for ${a.id} and ${b.id}`).toBe(true);
    }
  }

  // 3 — movable nodes stay on the grid and out of the gutter.
  for (const n of movable) {
    const { w, h } = sizeOf(n);
    const p = at(n);
    expect(p.x, `${n.id}.x`).toBeGreaterThanOrEqual(MARGIN + w / 2);
    expect(p.y, `${n.id}.y`).toBeGreaterThanOrEqual(MARGIN + h / 2);
    expect(p.x % GRID, `${n.id}.x on grid`).toBe(0);
    expect(p.y % GRID, `${n.id}.y on grid`).toBe(0);
  }
};

// ---------------------------------------------------------------------------
// generators
// ---------------------------------------------------------------------------

// `__proto__` is a legal node id, and it is the one id that turns a plain
// object keyed by id into a trap, so it belongs in the universe the properties
// are checked over. `KEPT` is the opposite: an id no directive can ever name,
// so every generated case has at least one frozen node (property 1).
const IDS = ["a", "b", "c", "d", "e", "__proto__"] as const;
const KEPT = "kept";
const KINDS: NodeKind[] = ["process", "rounded", "stadium", "decision", "circle"];
const DIRS = [
  "above",
  "above-left",
  "above-right",
  "below",
  "below-left",
  "below-right",
  "left",
  "right",
  "up",
  "down",
];

const anId = fc.constantFrom(...IDS, "ghost");

const aGraph: fc.Arbitrary<Graph> = fc.record({
  direction: fc.constant("TD" as const),
  nodes: fc.uniqueArray(
    fc.record({
      id: fc.constantFrom(...IDS),
      label: fc.string({ maxLength: 32 }),
      kind: fc.constantFrom(...KINDS),
    }),
    { selector: (n) => n.id, minLength: 1, maxLength: IDS.length },
  ),
  edges: fc.array(
    fc.record({ from: anId, to: anId, style: fc.constant("arrow" as const) }),
    { maxLength: 8 },
  ),
});

const aCoord = fc.oneof(
  fc.integer({ min: -400, max: 1400 }),
  fc.integer({ min: -100000, max: 100000 }),
);

const aPrev = fc.dictionary(
  anId,
  fc.oneof(
    { arbitrary: fc.record({ x: aCoord, y: aCoord }), weight: 10 },
    { arbitrary: fc.constant(null), weight: 1 },
    { arbitrary: fc.record({ x: fc.constant(Number.NaN), y: fc.constant(0) }), weight: 1 },
  ),
  { maxKeys: 6 },
);

const absurd = fc.oneof(
  fc.integer({ min: -2000, max: 2000 }),
  fc.constantFrom(Number.NaN, Number.POSITIVE_INFINITY, -1e308, 1e300, 0.5),
);

const aDirective = fc.oneof(
  {
    arbitrary: fc.record({
      id: anId,
      rel: fc.record(
        {
          of: fc.oneof(anId, fc.constant("nowhere")),
          dir: fc.constantFrom(...DIRS, "sideways"),
          steps: fc.oneof(fc.integer({ min: -3, max: 3 }), fc.constant(Number.NaN)),
        },
        { requiredKeys: ["of", "dir"] },
      ),
    }),
    weight: 4,
  },
  { arbitrary: fc.record({ id: anId, delta: fc.record({ dx: absurd, dy: absurd }) }), weight: 3 },
  {
    arbitrary: fc.record({
      id: anId,
      cell: fc.record({ col: fc.integer({ min: -3, max: 6 }), row: fc.integer({ min: -3, max: 6 }) }),
    }),
    weight: 3,
  },
  { arbitrary: fc.record({ id: anId, at: fc.record({ x: absurd, y: absurd }) }), weight: 4 },
  // malformed on purpose: no form at all, no id at all, not an object
  { arbitrary: fc.record({ id: anId }), weight: 1 },
  { arbitrary: fc.record({ rel: fc.constant({ of: "a", dir: "below" }) }), weight: 1 },
  { arbitrary: fc.constantFrom(null, 42, "a"), weight: 1 },
) as fc.Arbitrary<unknown>;

const aCase = (directives: fc.Arbitrary<unknown[]>) =>
  fc.tuple(aGraph, aPrev, directives) as fc.Arbitrary<[Graph, Record<string, unknown>, unknown[]]>;

/**
 * A case with one node the directive generator cannot reach, positioned. It is
 * frozen by construction whatever the directives say, which is what keeps
 * property 1 from being vacuous when the list is long enough to name every
 * other id.
 */
const withAFrozenNode = (
  directives: fc.Arbitrary<unknown[]>,
): fc.Arbitrary<[Graph, Record<string, unknown>, unknown[]]> =>
  fc.tuple(aCase(directives), fc.record({ x: aCoord, y: aCoord })).map(([[graph, prev, list], p]) => [
    { ...graph, nodes: [...graph.nodes, { id: KEPT, label: "kept", kind: "process" as NodeKind }] },
    { ...prev, [KEPT]: p },
    list,
  ]);

const run = (graph: Graph, prev: Record<string, unknown>, directives: readonly unknown[]): SnapResult =>
  snap(graph, prev as Record<string, Position>, directives as readonly Directive[]);

// ---------------------------------------------------------------------------

describe("geometry", () => {
  it("sizes a node from its label and kind, and nothing else", () => {
    expect(sizeOf({ id: "a", label: "Done", kind: "process" })).toEqual({ w: 120, h: 56 });
    expect(sizeOf({ id: "a", label: "Write audit log", kind: "process" })).toEqual({ w: 162, h: 56 });
    expect(sizeOf({ id: "a", label: "Valid token?", kind: "decision" })).toEqual({ w: 181, h: 74 });
    // clamped at both ends
    expect(sizeOf({ id: "a", label: "", kind: "process" }).w).toBe(120);
    expect(sizeOf({ id: "a", label: "x".repeat(200), kind: "process" }).w).toBe(250);
  });

  it("boxes are centred on the position", () => {
    const box = boxOf({ id: "a", label: "Done", kind: "process" }, { x: 100, y: 60 });
    expect(box).toEqual({ x: 40, y: 32, w: 120, h: 56, cx: 100, cy: 60 });
  });

  it("overlap counts the pad on every side", () => {
    const node: Node = { id: "a", label: "Done", kind: "process" };
    const a = boxOf(node, { x: 100, y: 60 });
    expect(overlaps(a, boxOf(node, { x: 100 + 120 + PAD - 1, y: 60 }))).toBe(true);
    expect(overlaps(a, boxOf(node, { x: 100 + 120 + PAD + 1, y: 60 }))).toBe(false);
  });

  it("content bounds grow with the content and stay empty without it", () => {
    const graph = chart([["a", "Done"]]);
    expect(contentBounds(graph, { a: { x: 100, y: 60 } }, 20)).toEqual({
      x: 20,
      y: 12,
      width: 160,
      height: 96,
    });
    expect(contentBounds(graph, {})).toEqual({ x: 0, y: 0, width: 0, height: 0 });
  });
});

describe("the JSON store", () => {
  const doc = { version: 1 as const, nodes: { b: { x: 1, y: 2 }, a: { x: 3, y: 4 } } };

  it("round-trips a document and sorts by id in code-unit order", () => {
    const store = jsonStore(doc);
    expect(store.entries().map(([id]) => id)).toEqual(["a", "b"]);
    expect(store.get("a")).toEqual({ x: 3, y: 4 });
    expect(store.toJSON()).toEqual({ version: 1, nodes: { a: { x: 3, y: 4 }, b: { x: 1, y: 2 } } });
    expect(store.snapshot()).toEqual({ a: { x: 3, y: 4 }, b: { x: 1, y: 2 } });
  });

  it("orders entries(), not snapshot(): a Record cannot order integer-like ids", () => {
    const store = jsonStore({ version: 1, nodes: { "2": { x: 2, y: 2 }, "10": { x: 10, y: 10 } } });
    expect(store.entries().map(([id]) => id)).toEqual(["10", "2"]);
    expect(store.snapshot()).toEqual({ "2": { x: 2, y: 2 }, "10": { x: 10, y: 10 } });
  });

  it("drops entries that are not a finite point", () => {
    const store = jsonStore({ version: 1, nodes: { a: { x: 1, y: 2 }, b: null, c: { x: Number.NaN, y: 0 } } as never });
    expect(Object.keys(store.snapshot())).toEqual(["a"]);
  });

  it("keeps orphans until a host asks for them to go", () => {
    const store = jsonStore(doc);
    const graph = chart([["a", "A"]]);
    expect(snap(graph, store.snapshot()).warnings.filter((w) => w.code === "orphan")).toHaveLength(1);
    expect(store.get("b")).toBeDefined();
    expect(pruneOrphans(store, graph)).toEqual(["b"]);
    expect(store.get("b")).toBeUndefined();
  });

  it("does not alias what it hands out", () => {
    const store = jsonStore(doc);
    const p = store.get("a") as Position;
    p.x = 999;
    expect(store.get("a")).toEqual({ x: 3, y: 4 });
  });
});

describe("the spec and the code agree", () => {
  it("on the constants", () => {
    const constant = (name: string): number => {
      const row = new RegExp(`^\\|\\s*\`${name}\`\\s*\\|\\s*(-?\\d+)`, "m").exec(SPEC);
      if (!row) throw new Error(`docs/spec/layout-store.md has no row for ${name}`);
      return Number(row[1]);
    };
    expect([constant("GRID"), constant("COL"), constant("ROW"), constant("PAD"), constant("MARGIN")]).toEqual([
      GRID,
      COL,
      ROW,
      PAD,
      MARGIN,
    ]);
  });

  it("on the warning vocabulary", () => {
    const start = SPEC.indexOf("### Warnings");
    const table = SPEC.slice(start, SPEC.indexOf("\n## ", start));
    const documented = [...table.matchAll(/^\|\s*`([a-z-]+)`/gm)].map((m) => m[1]).sort();
    // every code the pass can emit, listed here so the spec cannot drift
    const emitted = [
      "displaced",
      "duplicate-directive",
      "frozen-out-of-bounds",
      "frozen-overlap",
      "invalid-directive",
      "invalid-position",
      "min-clamped",
      "orphan",
      "unknown-node",
      "unresolvable-anchor",
    ];
    expect(documented).toEqual(emitted);
  });

  it("on the freeze rule being stated where the tests can point at it", () => {
    expect(SPEC).toContain("emitted verbatim");
    expect(SPEC).toContain("Frozen overlaps are preserved");
    expect(SPEC).toContain("The host-integration contract");
  });
});

describe("directives", () => {
  const graph = chart([
    ["a", "A"],
    ["b", "B"],
  ]);
  const prev = { a: { x: 400, y: 300 } };

  it("rel steps by COL/ROW off the anchor's centre", () => {
    const out = snap(graph, prev, [{ id: "b", rel: { of: "a", dir: "below-right" } }]);
    expect(out.positions.b).toEqual({ x: 400 + COL, y: 300 + ROW });
    const two = snap(graph, prev, [{ id: "b", rel: { of: "a", dir: "up", steps: 2 } }]);
    expect(two.positions.b).toEqual({ x: 400, y: 300 - 2 * ROW });
  });

  it("delta moves a node from its previous position", () => {
    const out = snap(graph, { ...prev, b: { x: 100, y: 100 } }, [{ id: "b", delta: { dx: 37, dy: -38 } }]);
    expect(out.positions.b).toEqual({ x: 140, y: 60 });
  });

  it("cell is the coarse grid", () => {
    const out = snap(graph, prev, [{ id: "b", cell: { col: 2, row: 3 } }]);
    expect(out.positions.b).toEqual({ x: COL / 2 + 2 * COL, y: ROW / 2 + 3 * ROW });
  });

  it("at is the pixel escape hatch, snapped to the grid", () => {
    const out = snap(graph, prev, [{ id: "b", at: { x: 693, y: 511 } }]);
    expect(out.positions.b).toEqual({ x: 700, y: 520 });
  });

  it("chains resolve off nodes this same pass is placing", () => {
    const out = snap(graph, prev, [
      { id: "b", rel: { of: "c", dir: "below" } },
      { id: "c", rel: { of: "a", dir: "right" } },
    ] as Directive[]);
    // c is not a node here, so b's anchor never resolves and b is auto-placed
    expect(out.warnings.map((w) => w.code)).toContain("unknown-node");
    const three = chart([
      ["a", "A"],
      ["b", "B"],
      ["c", "C"],
    ]);
    const chained = snap(three, prev, [
      { id: "b", rel: { of: "c", dir: "below" } },
      { id: "c", rel: { of: "a", dir: "right" } },
    ]);
    expect(chained.positions.c).toEqual({ x: 600, y: 300 });
    expect(chained.positions.b).toEqual({ x: 600, y: 420 });
  });

  it("last one wins for duplicate ids, with a warning", () => {
    const out = snap(graph, prev, [
      { id: "b", cell: { col: 0, row: 0 } },
      { id: "b", cell: { col: 3, row: 1 } },
    ]);
    expect(out.positions.b).toEqual({ x: COL / 2 + 3 * COL, y: ROW / 2 + ROW });
    expect(out.warnings.filter((w) => w.code === "duplicate-directive").map((w) => w.ids)).toEqual([["b"]]);
  });

  it("a directive for a node the chart does not have is ignored", () => {
    const out = snap(graph, { ...prev, b: { x: 100, y: 100 } }, [{ id: "zz", at: { x: 0, y: 0 } }]);
    expect(out.warnings.filter((w) => w.code === "unknown-node")).toHaveLength(1);
    expect(out.positions).toEqual({ a: { x: 400, y: 300 }, b: { x: 100, y: 100 } });
  });

  it("a cyclic anchor chain warns and falls through to the fallback", () => {
    const out = snap(graph, {}, [
      { id: "a", rel: { of: "b", dir: "below" } },
      { id: "b", rel: { of: "a", dir: "below" } },
    ]);
    expect(out.warnings.filter((w) => w.code === "unresolvable-anchor")).toHaveLength(2);
    expect(Object.keys(out.positions)).toEqual(["a", "b"]);
  });

  it("a malformed directive still names its node, and lands it back where it was", () => {
    const out = snap(graph, { a: { x: 400, y: 300 } }, [{ id: "a", rel: { of: "b", dir: "sideways" } } as never]);
    expect(out.warnings.map((w) => w.code)).toContain("invalid-directive");
    expect(out.positions.a).toEqual({ x: 400, y: 300 });
  });
});

describe("safety properties", () => {
  it("property 1–3 hold for arbitrary graphs, positions and directives", () => {
    fc.assert(
      fc.property(aCase(fc.array(aDirective, { maxLength: 12 })), ([graph, prev, directives]) => {
        expectSafe(graph, prev, directives, run(graph, prev, directives));
      }),
      { numRuns: 500 },
    );
  });

  it("property 1–3 hold for hundreds of directives at once", () => {
    fc.assert(
      fc.property(
        withAFrozenNode(fc.array(aDirective, { minLength: 200, maxLength: 300 })),
        ([graph, prev, directives]) => {
          // 200+ directives drawn from a handful of ids name every other node
          // with near-certainty, so without this the run asserts nothing about
          // frozen nodes at all.
          expect(split(graph, prev, directives).frozen.map((n) => n.id)).toContain(KEPT);
          expectSafe(graph, prev, directives, run(graph, prev, directives));
        },
      ),
      { numRuns: 40 },
    );
  });

  it("property 4 — the same input produces a deep-equal result every time", () => {
    fc.assert(
      fc.property(aCase(fc.array(aDirective, { maxLength: 12 })), ([graph, prev, directives]) => {
        expect(run(graph, prev, directives)).toEqual(run(graph, prev, directives));
      }),
      { numRuns: 300 },
    );
  });

  it("property 4 — permuting the directive list changes nothing", () => {
    const unique = fc
      .uniqueArray(aDirective, {
        selector: (d) => (d && typeof d === "object" ? String((d as { id?: unknown }).id) : "junk"),
        maxLength: 6,
      })
      .chain((list) =>
        fc.tuple(
          fc.constant(list),
          fc.shuffledSubarray(
            list.map((_, i) => i),
            { minLength: list.length, maxLength: list.length },
          ),
        ),
      );
    fc.assert(
      fc.property(fc.tuple(aGraph, aPrev, unique), ([graph, prev, [list, order]]) => {
        const permuted = order.map((i) => list[i]);
        expect(run(graph, prev, permuted)).toEqual(run(graph, prev, list));
      }),
      { numRuns: 300 },
    );
  });
});

describe("regressions", () => {
  // The spike's two bugs, both of the same shape: the overlap resolver trading
  // an overlap for an off-canvas node (D8, D9).
  it("spike bug 1: the resolver never trades an overlap for an out-of-bounds position", () => {
    const graph = chart([
      ["a", "A"],
      ["b", "B"],
    ]);
    const min = { x: MARGIN + 120 / 2, y: MARGIN + 56 / 2 };
    // a sits in the top-left corner; b is dropped exactly on top of it, so
    // every nearer candidate is either occupied or outside the bound
    const out = snap(graph, { a: { x: 80, y: 60 } }, [{ id: "b", at: { x: 80, y: 60 } }]);
    const b = out.positions.b as Position;
    expect(b.x).toBeGreaterThanOrEqual(min.x);
    expect(b.y).toBeGreaterThanOrEqual(min.y);
    expect(overlaps(boxOf(graph.nodes[1] as Node, b), boxOf(graph.nodes[0] as Node, { x: 80, y: 60 }))).toBe(false);
    expect(out.warnings.map((w) => w.code)).toContain("displaced");
  });

  it("spike bug 2: the clamp applies to every movable node, not only to colliding ones", () => {
    const graph = chart([["a", "A"]]);
    const out = snap(graph, {}, [{ id: "a", at: { x: -5000, y: -5000 } }]);
    expect(out.positions.a).toEqual({ x: 80, y: 60 });
    expect(out.warnings.map((w) => w.code)).toContain("min-clamped");
  });

  // D17: a relabel grows a box around a centre nobody may move. The auth
  // fixture's `reject` and `rate` are 240px apart, so labels at the width
  // clamp put their boxes 32px into each other with no directive in sight.
  it("frozen overlap (D17): a relabel that collides is reported, never resolved", () => {
    const graph = chart([
      ["reject", "401 Unauthorized, token expired"],
      ["rate", "Rate limited or over quota now?", "decision"],
    ]);
    const prev = { reject: { x: 140, y: 300 }, rate: { x: 380, y: 300 } };
    const [reject, rate] = graph.nodes as [Node, Node];
    expect(sizeOf(reject).w).toBe(250);
    expect(sizeOf(rate).w).toBe(294);
    const overlap = 140 + 250 / 2 - (380 - 294 / 2);
    expect(overlap).toBe(32);

    const out = snap(graph, prev, []);
    expect(out.positions).toEqual(prev);
    const frozen = out.warnings.filter((w) => w.code === "frozen-overlap");
    expect(frozen).toHaveLength(1);
    expect(frozen[0]?.ids).toEqual(["reject", "rate"]);
    // and being outside the bound does not move it either
    expect(out.warnings.filter((w) => w.code === "frozen-out-of-bounds").map((w) => w.ids)).toEqual([["reject"]]);
  });

  // The bound a frozen position is judged against is the geometric one. Grid
  // rounding belongs to movable placement; applying it here reports a node
  // whose box is comfortably inside the margin as an escape.
  it("frozen out-of-bounds is the geometric bound, not the grid-rounded one", () => {
    const graph = chart([["q", "Retry?", "decision"]]);
    expect(sizeOf(graph.nodes[0] as Node)).toEqual({ w: 164, h: 74 });
    // centre 110 puts the box at x = 28, clear of MARGIN; the grid-rounded
    // movable minimum would be 120, the geometric one is 102
    const prev = { q: { x: 110, y: 60 } };
    const out = snap(graph, prev, []);
    expect(out.positions).toEqual(prev);
    expect(out.warnings.filter((warning) => warning.code === "frozen-out-of-bounds")).toEqual([]);
    // one grid step further in, the box does break the margin, and that warns
    const inside = snap(graph, { q: { x: 100, y: 60 } }, []);
    expect(inside.warnings.map((warning) => warning.code)).toContain("frozen-out-of-bounds");
  });

  // A node id may be `__proto__` (the grammar admits it), and a store read off
  // disk carries it as an own key. Building the result with `positions[id] = p`
  // would call the legacy setter and emit no position for that node at all.
  it("a node called __proto__ gets an own property in the result", () => {
    const graph = chart([["__proto__", "A"]]);
    const prev = JSON.parse('{"__proto__":{"x":400,"y":300}}') as Record<string, Position>;
    const out = snap(graph, prev, []);
    expect(Object.keys(out.positions)).toEqual(["__proto__"]);
    expect(Object.getOwnPropertyDescriptor(out.positions, "__proto__")?.value).toEqual({ x: 400, y: 300 });
    expect(out.warnings).toEqual([]);
  });
});

describe("the host-integration contract", () => {
  const graph = chart([
    ["a", "A"],
    ["b", "B"],
  ]);

  it("a drag is one call, and a drop onto an occupied spot resolves nearest-free", () => {
    const store = jsonStore({ version: 1, nodes: { a: { x: 400, y: 300 }, b: { x: 400, y: 500 } } });
    const out = snap(graph, store.snapshot(), [{ id: "b", at: { x: 400, y: 300 } }]);
    expect(out.positions.a).toEqual({ x: 400, y: 300 });
    expect(overlaps(boxOf(graph.nodes[1] as Node, out.positions.b as Position), boxOf(graph.nodes[0] as Node, { x: 400, y: 300 }))).toBe(false);
    for (const [id, p] of Object.entries(out.positions)) store.set(id, p);
    expect(store.snapshot()).toEqual(out.positions);
  });

  it("a drop out of bounds min-clamps with a warning", () => {
    const out = snap(graph, { a: { x: 400, y: 300 } }, [{ id: "b", at: { x: -12, y: -900 } }]);
    expect(out.positions.b).toEqual({ x: 80, y: 60 });
    expect(out.warnings.filter((w) => w.code === "min-clamped").map((w) => w.ids)).toEqual([["b"]]);
  });
});

// ---------------------------------------------------------------------------
// the twelve spike scenarios
// ---------------------------------------------------------------------------

type SpikeNode = { id: string; label: string; kind: string };
type SpikeGraph = { nodes: SpikeNode[]; edges: { from: string; to: string; label?: string }[] };
type Op =
  | { op: "addNode"; id: string; label: string; kind: string }
  | { op: "delNode"; id: string }
  | { op: "addEdge"; from: string; to: string; label?: string }
  | { op: "delEdge"; from: string; to: string }
  | { op: "relabel"; id: string; label: string };
type Scenario = { id: string; base: string; mutation: string; ops: Op[] };

const graphs = spike<Record<string, SpikeGraph>>("graphs.json");
const seeds = spike<Record<string, Record<string, Position>>>("positions.json");
const scenarios = spike<Scenario[]>("scenarios.json");

const KIND: Record<string, NodeKind> = { process: "process", decision: "decision", terminal: "stadium" };

const toGraph = (g: SpikeGraph): Graph => ({
  direction: "TD",
  nodes: g.nodes.map((n) => ({ id: n.id, label: n.label, kind: KIND[n.kind] ?? "process" })),
  edges: g.edges.map((e) => ({ from: e.from, to: e.to, style: "arrow" as const })),
});

const mutate = (base: SpikeGraph, ops: Op[]): SpikeGraph => {
  let nodes = base.nodes.map((n) => ({ ...n }));
  let edges = base.edges.map((e) => ({ ...e }));
  for (const op of ops) {
    if (op.op === "addNode") nodes.push({ id: op.id, label: op.label, kind: op.kind });
    else if (op.op === "delNode") {
      nodes = nodes.filter((n) => n.id !== op.id);
      edges = edges.filter((e) => e.from !== op.id && e.to !== op.id);
    } else if (op.op === "addEdge") edges.push({ from: op.from, to: op.to });
    else if (op.op === "delEdge") edges = edges.filter((e) => !(e.from === op.from && e.to === op.to));
    else nodes = nodes.map((n) => (n.id === op.id ? { ...n, label: op.label } : n));
  }
  return { nodes, edges };
};

describe.each(scenarios)("spike scenario $id", (scenario) => {
  const before = graphs[scenario.base] as SpikeGraph;
  const graph = toGraph(mutate(before, scenario.ops));
  const prev = seeds[scenario.base] as Record<string, Position>;
  const result = snap(graph, prev, []);
  const control = scenario.mutation.startsWith("relabel") || scenario.mutation === "add cross edge";

  it("every pre-existing node is at 0px drift", () => {
    for (const node of graph.nodes) {
      const was = prev[node.id];
      if (!was) continue;
      expect(result.positions[node.id], node.id).toEqual(was);
    }
  });

  if (control) {
    it("is a control: nothing moves at all", () => {
      expect(result.positions).toEqual(
        Object.fromEntries(graph.nodes.map((n) => [n.id, prev[n.id] as Position])),
      );
    });
  }

  it("the layout it produces is safe", () => {
    expectSafe(graph, prev, [], result);
  });
});
