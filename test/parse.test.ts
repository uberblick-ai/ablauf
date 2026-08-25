import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { Graph, NodeKind } from "../src/index.js";
import { ParseError, parse } from "../src/index.js";
import { table } from "./spec.js";

const read = (path: string): string =>
  readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

// Every supported construct in one chart: both header keywords are covered by
// the direction test, so this one takes `graph`, a hyphenated id, all five
// shapes, all four connectors in both label spellings, a chain, `&` groups on
// both sides, a bare reference, a late declaration and an escaped label.
const FULL = `%% every supported construct
graph LR
  a-b[Alpha] --> B(Bravo) & C([Charlie])
  B -- yes --- D{Delta} --> E((Echo))
  C -. maybe .-> D
  E == fast ==> a-b
  F
  F -->|"pipe | here"| G[Gee]
`;

describe("parse", () => {
  it("returns nodes in first-appearance order and edges in source order", () => {
    expect(parse(FULL)).toEqual({
      direction: "LR",
      nodes: [
        { id: "a-b", label: "Alpha", kind: "process" },
        { id: "B", label: "Bravo", kind: "rounded" },
        { id: "C", label: "Charlie", kind: "stadium" },
        { id: "D", label: "Delta", kind: "decision" },
        { id: "E", label: "Echo", kind: "circle" },
        { id: "F", label: "F", kind: "process" },
        { id: "G", label: "Gee", kind: "process" },
      ],
      edges: [
        { from: "a-b", to: "B", style: "arrow" },
        { from: "a-b", to: "C", style: "arrow" },
        { from: "B", to: "D", style: "open", label: "yes" },
        { from: "D", to: "E", style: "arrow" },
        { from: "C", to: "D", style: "dotted", label: "maybe" },
        { from: "E", to: "a-b", style: "thick", label: "fast" },
        { from: "F", to: "G", style: "arrow", label: "pipe | here" },
      ],
    } satisfies Graph);
  });

  it("is deterministic", () => {
    expect(parse(FULL)).toEqual(parse(FULL));
  });

  it("takes the direction from the header and defaults to TD", () => {
    for (const direction of ["TD", "TB", "LR", "RL", "BT"] as const) {
      expect(parse(`flowchart ${direction}\n  A --> B`).direction).toBe(direction);
      expect(parse(`graph ${direction}\n  A --> B`).direction).toBe(direction);
    }
    expect(parse("flowchart\n  A --> B").direction).toBe("TD");
  });

  it("makes an undeclared id a process node labelled with the id", () => {
    expect(parse("flowchart TD\n  A --> B").nodes).toEqual([
      { id: "A", label: "A", kind: "process" },
      { id: "B", label: "B", kind: "process" },
    ]);
  });

  it("keeps a node's first-appearance slot when it is declared later", () => {
    const graph = parse("flowchart TD\n  A --> B --> C\n  B{Later}");
    expect(graph.nodes).toEqual([
      { id: "A", label: "A", kind: "process" },
      { id: "B", label: "Later", kind: "decision" },
      { id: "C", label: "C", kind: "process" },
    ]);
  });

  it("allows an identical re-declaration", () => {
    expect(parse("flowchart TD\n  A[One] --> B\n  A[One] --> C").nodes[0]).toEqual({
      id: "A",
      label: "One",
      kind: "process",
    });
  });

  it("expands chains and `&` groups to one edge per pair", () => {
    expect(parse("flowchart TD\n  A & B --> C & D --> E").edges).toEqual([
      { from: "A", to: "C", style: "arrow" },
      { from: "A", to: "D", style: "arrow" },
      { from: "B", to: "C", style: "arrow" },
      { from: "B", to: "D", style: "arrow" },
      { from: "C", to: "E", style: "arrow" },
      { from: "D", to: "E", style: "arrow" },
    ]);
  });

  it("reads both label spellings, trims them and decodes entity escapes", () => {
    const graph = parse('flowchart TD\n  A -->|  yes  | B\n  B -- "no #124; maybe" --> C\n  C[""]');
    expect(graph.edges.map((e) => e.label)).toEqual(["yes", "no | maybe"]);
    expect(graph.nodes[2]).toEqual({ id: "C", label: "", kind: "process" });
  });

  // The keyword check is a token-boundary check: an id that merely starts with
  // a statement keyword is an ordinary id.
  it("accepts ids that start with a statement keyword", () => {
    const graph = parse("flowchart TD\n  style-node[ok]\n  style1[ok]\n  class_A[ok]");
    expect(graph.nodes.map((n) => n.id)).toEqual(["style-node", "style1", "class_A"]);
  });

  it("skips comment lines and blank lines", () => {
    expect(parse("%% one\n\nflowchart TD\n\n  %% two\n  A --> B\n")).toEqual(
      parse("flowchart TD\n  A --> B"),
    );
  });
});

// One case per row of the spec's rejected-constructs table. `needle` is the
// part of the message that names the offending construct.
const REJECTED: { construct: string; text: string; line: number; needle: string }[] = [
  { construct: "missing-header", text: "A --> B", line: 1, needle: "flowchart" },
  { construct: "header", text: "flowchart TD A --> B", line: 1, needle: "header line" },
  { construct: "bad-direction", text: "flowchart XX", line: 1, needle: "XX" },
  { construct: "semicolon", text: "flowchart TD\n  A --> B;", line: 2, needle: ";" },
  { construct: "init", text: 'flowchart TD\n%%{init: {"theme":"dark"}}%%', line: 2, needle: "%%{init}%%" },
  { construct: "subgraph", text: "flowchart TD\n  subgraph one\n  end", line: 2, needle: "subgraph" },
  { construct: "end", text: "flowchart TD\n  A --> B\n  end", line: 3, needle: "end" },
  { construct: "style", text: "flowchart TD\n  A --> B\n  style A fill:#f00", line: 3, needle: "style" },
  { construct: "classDef", text: "flowchart TD\n  classDef big font-size:20px", line: 2, needle: "classDef" },
  { construct: "class", text: "flowchart TD\n  class A big", line: 2, needle: "class" },
  { construct: "linkStyle", text: "flowchart TD\n  linkStyle 0 stroke:#f00", line: 2, needle: "linkStyle" },
  { construct: "click", text: 'flowchart TD\n  click A "https://example.com"', line: 2, needle: "click" },
  { construct: "direction", text: "flowchart TD\n  A --> B\n  direction LR", line: 3, needle: "direction" },
  { construct: "unknown-shape", text: "flowchart TD\n  A[[Sub]]", line: 2, needle: "[[" },
  { construct: "bad-id", text: "flowchart TD\n  1bad --> B", line: 2, needle: "node id" },
  { construct: "bad-id", text: "flowchart TD\n  A --> end", line: 2, needle: "keyword" },
  { construct: "duplicate-node", text: "flowchart TD\n  A[One]\n  A(One)", line: 3, needle: "already declared" },
  { construct: "empty-label", text: "flowchart TD\n  A[]", line: 2, needle: "empty" },
  { construct: "unterminated-label", text: "flowchart TD\n  A[One", line: 2, needle: "closing" },
  { construct: "bare-label", text: "flowchart TD\n  A[x %% y]", line: 2, needle: "%%" },
  { construct: "bare-label", text: "flowchart TD\n  A([x]y])", line: 2, needle: "]" },
  { construct: "bare-label", text: "flowchart TD\n  A[x|y]", line: 2, needle: "|" },
  { construct: "entity", text: "flowchart TD\n  A[#9829;]", line: 2, needle: "#9829;" },
  { construct: "edge", text: "flowchart TD\n  A -- yes -->|no| B", line: 2, needle: "one label" },
  { construct: "unparsable-line", text: "flowchart TD\n  A --> B C", line: 2, needle: "unexpected" },
];

describe("rejected constructs", () => {
  it.each(REJECTED)("rejects $construct", ({ construct, text, line, needle }) => {
    let thrown: unknown;
    try {
      parse(text);
    } catch (error) {
      thrown = error;
    }
    expect(thrown, `parse() accepted ${JSON.stringify(text)}`).toBeInstanceOf(ParseError);
    const error = thrown as ParseError;
    expect(error.construct).toBe(construct);
    expect(error.line).toBe(line);
    expect(error.column).toBeGreaterThan(0);
    expect(error.message).toContain(needle);
    expect(error.message).toContain(`line ${line}:${error.column}: `);
  });

  it("covers every row of the spec's rejected-constructs table", () => {
    const documented = new Set(table("## Rejected constructs").map((cells) => cells[0]!));
    expect([...new Set(REJECTED.map((c) => c.construct))].sort()).toEqual([...documented].sort());
  });

  it("reports an unclosed `--` edge label rather than crashing", () => {
    const error = (() => {
      try {
        parse("flowchart TD\n  A --yes B");
      } catch (e) {
        return e as ParseError;
      }
      throw new Error("expected a ParseError");
    })();
    expect(error.construct).toBe("edge");
    expect(error.message).toContain("closes it");
  });
});

// The spike fixtures are the only realistic hand-arranged graphs this project
// has (fixtures/spike/README.md); the `.mmd` twins are what the parser has to
// reproduce, mapping the spike's coarse `terminal` kind to a stadium.
type SpikeGraph = {
  nodes: { id: string; label: string; kind: string }[];
  edges: { from: string; to: string; label?: string }[];
};

const SPIKE_KIND: Record<string, NodeKind> = {
  process: "process",
  decision: "decision",
  terminal: "stadium",
};

const spike = JSON.parse(read("fixtures/spike/graphs.json")) as Record<string, SpikeGraph>;

describe.each(Object.keys(spike))("fixtures/text/%s.mmd", (name) => {
  it("parses to the spike graph", () => {
    const source = spike[name]!;
    expect(parse(read(`fixtures/text/${name}.mmd`))).toEqual({
      direction: "TD",
      nodes: source.nodes.map((n) => ({ id: n.id, label: n.label, kind: SPIKE_KIND[n.kind]! })),
      edges: source.edges.map((e) =>
        e.label === undefined
          ? { from: e.from, to: e.to, style: "arrow" }
          : { from: e.from, to: e.to, style: "arrow", label: e.label },
      ),
    } satisfies Graph);
  });
});
