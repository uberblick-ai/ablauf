// The spike fixtures are test seeds for the renderer and the snap pass, so
// their invariants are worth one cheap check: every node has a position, and
// every edge endpoint is a node that exists. A fixture that quietly drifts out
// of shape would show up as a confusing failure three suites away.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

type Graph = {
  nodes: { id: string; label: string; kind: string }[];
  edges: { from: string; to: string; label?: string }[];
};

const read = <T,>(name: string): T =>
  JSON.parse(readFileSync(new URL(`../fixtures/spike/${name}`, import.meta.url), "utf8")) as T;

const graphs = read<Record<string, Graph>>("graphs.json");
const positions = read<Record<string, Record<string, { x: number; y: number }>>>("positions.json");

describe.each(Object.keys(graphs))("spike fixture %s", (key) => {
  const graph = graphs[key]!;
  const pos = positions[key]!;

  it("positions cover exactly the graph's nodes", () => {
    const ids = graph.nodes.map((n) => n.id).sort();
    expect(Object.keys(pos).sort()).toEqual(ids);
  });

  it("every edge connects two known nodes", () => {
    const ids = new Set(graph.nodes.map((n) => n.id));
    for (const e of graph.edges) {
      expect(ids, `edge from ${e.from}`).toContain(e.from);
      expect(ids, `edge to ${e.to}`).toContain(e.to);
    }
  });

  it("node ids are unique", () => {
    const ids = graph.nodes.map((n) => n.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
