import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { Graph } from "../src/index.js";
import { SerializeError, parse, serialize } from "../src/index.js";
import { fenced, table } from "./spec.js";

const read = (path: string): string =>
  readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

// The graph behind the spec's canonical output: one node or edge per emitted
// construct, in the order the table lists them.
const CANONICAL: Graph = {
  direction: "TD",
  nodes: [
    { id: "A", label: "Alpha", kind: "process" },
    { id: "B", label: "Bravo", kind: "rounded" },
    { id: "C", label: "Charlie", kind: "stadium" },
    { id: "D", label: "Delta", kind: "decision" },
    { id: "E", label: "Echo", kind: "circle" },
    { id: "F", label: "Fox {caged}", kind: "process" },
  ],
  edges: [
    { from: "A", to: "B", style: "arrow" },
    { from: "B", to: "C", style: "open" },
    { from: "C", to: "D", style: "dotted" },
    { from: "D", to: "E", style: "thick" },
    { from: "E", to: "F", style: "arrow", label: "yes" },
    { from: "F", to: "A", style: "arrow", label: "a | b #" },
  ],
};

const SOURCES = ["fixtures/text/auth.mmd", "fixtures/text/deploy.mmd"];

describe("serialize", () => {
  it("emits the spec's canonical output verbatim", () => {
    expect(serialize(CANONICAL).trimEnd()).toBe(fenced("### Canonical output").join("\n"));
  });

  it("emits nothing outside the spec's emitted-constructs table", () => {
    const documented = table("## Emitted constructs").map((cells) => cells[1]!);
    const emitted = serialize(CANONICAL).trim().split("\n").map((line) => line.trim());
    expect([...emitted].sort()).toEqual([...documented].sort());
  });

  it("always emits `flowchart` and keeps the direction verbatim", () => {
    expect(serialize(parse("graph TB\n  A --> B")).split("\n")[0]).toBe("flowchart TB");
  });

  it("quotes a label that is not safe bare, and escapes `\"`, `|` and `#`", () => {
    // `D` is the entity round-trip: its label is the six characters `#9829;`,
    // which have to come back out as text a mermaid renderer shows verbatim
    // rather than as the heart the entity would name.
    const graph = parse(
      'flowchart TD\n  A["say #quot;hi#quot;"] -->|"a | b"| B[plain-1.0]\n  C[""]\n  D["#35;9829;"]',
    );
    expect(graph.nodes[3]?.label).toBe("#9829;");
    expect(serialize(graph)).toBe(
      [
        "flowchart TD",
        '  A["say #quot;hi#quot;"]',
        "  B[plain-1.0]",
        '  C[""]',
        '  D["#35;9829;"]',
        '  A -->|"a #124; b"| B',
        "",
      ].join("\n"),
    );
  });

  // The serializer's half of "every output is valid mermaid": a graph it cannot
  // write throws a SerializeError naming the offender, rather than emitting text
  // that reads as something else.
  it("refuses a graph that has no ablauf text", () => {
    const cases: { graph: Graph; names: string }[] = [
      {
        graph: { direction: "TD", nodes: [{ id: "1bad", label: "x", kind: "process" }], edges: [] },
        names: "`1bad`",
      },
      {
        graph: { direction: "TD", nodes: [{ id: "end", label: "x", kind: "process" }], edges: [] },
        names: "`end`",
      },
      {
        // Passes a `[A-Za-z_][A-Za-z0-9_-]*` reading, but the parser stops the
        // id before the trailing hyphen and could never read this back.
        graph: { direction: "TD", nodes: [{ id: "A-", label: "x", kind: "process" }], edges: [] },
        names: "`A-`",
      },
      {
        graph: {
          direction: "TD",
          nodes: [
            { id: "A", label: "one", kind: "process" },
            { id: "A", label: "two", kind: "process" },
          ],
          edges: [],
        },
        names: "node `A` is declared twice",
      },
      {
        graph: { direction: "TD", nodes: [{ id: "A", label: "two\nlines", kind: "process" }], edges: [] },
        names: "node `A` contains a newline",
      },
      {
        graph: {
          direction: "TD",
          nodes: [{ id: "A", label: "Alpha", kind: "process" }],
          edges: [{ from: "A", to: "B", style: "arrow" }],
        },
        names: "undeclared node `B`",
      },
    ];
    for (const { graph, names } of cases) {
      expect(() => serialize(graph), names).toThrow(SerializeError);
      expect(() => serialize(graph)).toThrow(names);
    }
  });

  it("collapses an identical duplicate declaration into one line", () => {
    const node = { id: "A", label: "one", kind: "process" } as const;
    expect(serialize({ direction: "TD", nodes: [node, { ...node }], edges: [] })).toBe(
      "flowchart TD\n  A[one]\n",
    );
  });

  // A mermaid line break is presentation, not grammar: it stays in the label
  // value, nothing in the accepted subset or the emitted vocabulary moves for
  // it, and the label comes back quoted only because `BARE` excludes `<` and
  // `>` (D13) — mermaid's splitter runs on a quoted label too.
  it("keeps a mermaid line break in the label, through the round-trip", () => {
    for (const marker of ["<br>", "<br/>", "<br />", "<BR/>", "<Br  />"]) {
      const source = `flowchart TD\n  A[one${marker}two]\n  A -->|yes${marker}no| B((done))\n`;
      const graph = parse(source);
      expect(graph.nodes[0]?.label).toBe(`one${marker}two`);
      expect(graph.edges[0]?.label).toBe(`yes${marker}no`);
      expect(serialize(graph)).toContain(`A["one${marker}two"]`);
      expect(parse(serialize(graph))).toEqual(graph);
    }
  });

  it("round-trips every graph it emits", () => {
    for (const source of [serialize(CANONICAL), ...SOURCES.map(read)]) {
      const graph = parse(source);
      expect(parse(serialize(graph))).toEqual(graph);
    }
  });

  it("is idempotent through a parse", () => {
    for (const source of [serialize(CANONICAL), ...SOURCES.map(read)]) {
      const once = serialize(parse(source));
      expect(serialize(parse(once))).toBe(once);
    }
  });
});
