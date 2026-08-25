// The renderer's contracts: the golden bytes, the growing canvas (D9), the
// stable origin (D18), the exported transform, and the loud failures.
//
// ## Regenerating the goldens
//
// `test/golden/*.svg` are **reviewed diffs, not blind snapshots**. Nothing
// rewrites them automatically. When a deliberate change to the renderer moves
// the bytes:
//
//     UPDATE_GOLDEN=1 pnpm test test/render.test.ts
//
// then read the resulting `git diff` line by line before committing it. A
// golden updated without reading the diff is a determinism gate that cannot
// fail, which is worse than no gate at all.
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";
import {
  DEFAULT_THEME,
  MARGIN,
  RenderError,
  boxOf,
  parse,
  sizeOf,
  snap,
  svgMeta,
  toSvg,
} from "../src/index.js";
import type { Graph, Node, Position, Theme } from "../src/index.js";

const ROOT = new URL("../", import.meta.url);
const FIXTURES = ["auth", "deploy"] as const;

/**
 * The goldens are rendered with a title and otherwise default options: a
 * `<title>` is the SVG's alternative text, so an untitled one is an
 * accessibility lint error in its own right, and carrying it here means the
 * golden covers that element's placement too.
 */
const TITLES: Record<string, string> = { auth: "Room auth flow", deploy: "Deploy pipeline" };
const titleOf = (name: string): string => TITLES[name] ?? name;

const positionsJson = JSON.parse(
  readFileSync(new URL("fixtures/spike/positions.json", ROOT), "utf8"),
) as Record<string, Record<string, Position>>;

const fixture = (name: string): { graph: Graph; positions: Record<string, Position> } => ({
  graph: parse(readFileSync(new URL(`fixtures/text/${name}.mmd`, ROOT), "utf8")),
  positions: positionsJson[name] ?? {},
});

const goldenPath = (name: string): URL => new URL(`golden/${name}.svg`, import.meta.url);

/**
 * Node labels carry the node font size and edge labels the edge one, which is
 * how a rendered node's coordinates are read back out of the SVG without the
 * renderer having to emit ids for the test's benefit. Labels are unique in both
 * fixtures.
 */
const nodeCoords = (svg: string): Map<string, string> => {
  const re = new RegExp(
    `<text x="([^"]+)" y="([^"]+)" text-anchor="middle" font-family="[^"]*" font-size="${DEFAULT_THEME.fontSize}" fill="[^"]*">([^<]*)</text>`,
    "g",
  );
  const out = new Map<string, string>();
  for (const m of svg.matchAll(re)) out.set(m[3] ?? "", `${m[1]},${m[2]}`);
  return out;
};

const attrs = (svg: string): Record<string, string> => {
  const open = svg.slice(0, svg.indexOf(">"));
  const out: Record<string, string> = {};
  for (const m of open.matchAll(/([a-zA-Z-]+)="([^"]*)"/g)) out[m[1] ?? ""] = m[2] ?? "";
  return out;
};

/** The graph minus one node, and minus every edge that touched it. */
const without = (graph: Graph, id: string): Graph => ({
  direction: graph.direction,
  nodes: graph.nodes.filter((n) => n.id !== id),
  edges: graph.edges.filter((e) => e.from !== id && e.to !== id),
});

const node = (id: string, label = id): Node => ({ id, label, kind: "process" });

/** The two nodes and the one edge most of the non-fixture cases need. */
const pair = (label?: string): Graph => ({
  direction: "TD",
  nodes: [node("a"), node("b")],
  edges: [{ from: "a", to: "b", style: "arrow", ...(label === undefined ? {} : { label }) }],
});

// ---------------------------------------------------------------------------
// the goldens
// ---------------------------------------------------------------------------

describe.each(FIXTURES)("the %s fixture", (name) => {
  const { graph, positions } = fixture(name);

  it("renders byte-identically to its committed golden", () => {
    const svg = toSvg(graph, positions, { title: titleOf(name) });
    if (process.env.UPDATE_GOLDEN === "1") writeFileSync(goldenPath(name), svg);
    expect(svg).toBe(readFileSync(goldenPath(name), "utf8"));
  });

  it("is a pure function of its inputs", () => {
    expect(toSvg(graph, positions)).toBe(toSvg(graph, positions));
    const opts = { title: titleOf(name), highlight: ["gate", "check"], debugGrid: true };
    expect(toSvg(graph, positions, opts)).toBe(toSvg(graph, positions, opts));
  });

  it("draws every node and every labelled edge", () => {
    const svg = toSvg(graph, positions);
    for (const n of graph.nodes) expect(nodeCoords(svg).has(n.label)).toBe(true);
    for (const e of graph.edges) {
      if (e.label) expect(svg).toContain(`>${e.label}</text>`);
    }
  });
});

it(
  "produces the golden bytes in a fresh process",
  () => {
    // The golden itself was written by an earlier process, so every `vitest
    // run` already compares across processes. This goes one further and uses a
    // separate node process over the built output — no vitest, no module
    // graph in common — because a same-process double-call proves nothing
    // about the constructs D21 bans.
    const dir = mkdtempSync(join(tmpdir(), "ablauf-render-"));
    execFileSync(
      process.execPath,
      [
        fileURLToPath(new URL("node_modules/typescript/bin/tsc", ROOT)),
        "-p",
        fileURLToPath(new URL("tsconfig.build.json", ROOT)),
        "--outDir",
        dir,
        "--declaration",
        "false",
        "--declarationMap",
        "false",
        "--sourceMap",
        "false",
      ],
      { cwd: fileURLToPath(ROOT), stdio: "pipe" },
    );
    const script = join(dir, "render-once.mjs");
    writeFileSync(
      script,
      [
        `import { readFileSync } from "node:fs";`,
        `import { parse, toSvg } from ${JSON.stringify(pathToFileURL(join(dir, "index.js")).href)};`,
        `const root = ${JSON.stringify(fileURLToPath(ROOT))};`,
        `const positions = JSON.parse(readFileSync(root + "fixtures/spike/positions.json", "utf8"));`,
        `const titles = ${JSON.stringify(TITLES)};`,
        `const out = ${JSON.stringify([...FIXTURES])}.map((name) =>`,
        `  toSvg(parse(readFileSync(root + "fixtures/text/" + name + ".mmd", "utf8")), positions[name],`,
        `    { title: titles[name] }));`,
        `process.stdout.write(JSON.stringify(out));`,
      ].join("\n"),
    );
    const got = JSON.parse(execFileSync(process.execPath, [script], { encoding: "utf8" })) as string[];
    expect(got).toEqual(FIXTURES.map((name) => readFileSync(goldenPath(name), "utf8")));
  },
  60_000,
);

// ---------------------------------------------------------------------------
// D9 — the canvas grows and nothing is clipped
// ---------------------------------------------------------------------------

describe("D9: the canvas grows, it is never clamped", () => {
  const { graph, positions } = fixture("auth");

  const far: Record<string, Position> = { ...positions, done: { x: 3000, y: 4000 } };

  it("a node far outside the previous bounds makes a larger SVG", () => {
    const before = svgMeta(graph, positions);
    const after = svgMeta(graph, far);
    expect(after.height).toBeGreaterThan(before.height);
    expect(after.width).toBeGreaterThan(before.width);
    expect(after.height).toBeGreaterThan(4000);
    expect(after.width).toBeGreaterThan(3000);
  });

  it("clips nothing: every node's box lies inside the canvas", () => {
    const meta = svgMeta(graph, far);
    const svg = toSvg(graph, far);
    expect(attrs(svg).viewBox).toBe(`${meta.originX} ${meta.originY} ${meta.width} ${meta.height}`);
    for (const n of graph.nodes) {
      const b = boxOf(n, far[n.id] ?? { x: 0, y: 0 });
      expect(b.x, n.id).toBeGreaterThanOrEqual(meta.originX);
      expect(b.y, n.id).toBeGreaterThanOrEqual(meta.originY);
      expect(b.x + b.w, n.id).toBeLessThanOrEqual(meta.originX + meta.width);
      expect(b.y + b.h, n.id).toBeLessThanOrEqual(meta.originY + meta.height);
    }
  });

  it("fits the decorations too: a long edge label grows the canvas around it", () => {
    // The chip behind an edge label is drawn from the label's own length, so a
    // long label between two short nodes reaches past every node box in the
    // picture. Width and height are taken from everything painted, so the far
    // edge grows around it; a canvas sized from node boxes alone would crop it.
    const long = "a label far wider than either of the two boxes it sits between";
    const pos = { a: { x: 200, y: 100 }, b: { x: 200, y: 400 } };
    const before = svgMeta(pair("ok"), pos);
    const meta = svgMeta(pair(long), pos);
    expect(meta.width).toBeGreaterThan(before.width);

    // The chip is the only `rx="4"` rect the renderer draws.
    const found = /<rect x="([^"]+)" y="([^"]+)" width="([^"]+)" height="([^"]+)" rx="4"/.exec(
      toSvg(pair(long), pos),
    );
    const [x = 0, y = 0, w = 0, h = 0] = found?.slice(1).map(Number) ?? [];
    expect(found).not.toBeNull();
    expect(y).toBeGreaterThanOrEqual(meta.originY);
    expect(x + w).toBeLessThanOrEqual(meta.originX + meta.width);
    expect(y + h).toBeLessThanOrEqual(meta.originY + meta.height);
    // The *near* edge is the origin's, and the origin is measured from node
    // boxes (D18): this chip is wider than the gutter in front of the leftmost
    // box, so it really is cropped on the left rather than translating the
    // whole picture. Pinned so the trade-off cannot change unnoticed.
    expect(x).toBeLessThan(meta.originX);
  });

  it("fits the stroke on the far edge: half a node's outline paints outside its box", () => {
    // One 120x56 box at (0, 0) with no margin: the 2px stroke straddles the
    // outline, so the picture really runs -1..121 by -1..57. The far edge is
    // taken from the stroked box and reaches 121/57, so nothing is cropped as
    // the canvas grows. The near edge is the origin, measured from the *box*
    // (D18) — the gutter (zero here, `MARGIN` in a real render) is what holds
    // the outer half of the stroke.
    const one: Graph = { direction: "TD", nodes: [node("a")], edges: [] };
    const meta = svgMeta(one, { a: { x: 60, y: 28 } }, { margin: 0 });
    expect(meta).toEqual({ originX: 0, originY: 0, width: 121, height: 57 });
    expect(attrs(toSvg(one, { a: { x: 60, y: 28 } }, { margin: 0 })).viewBox).toBe("0 0 121 57");
  });

  it("fits a highlight ring's stroke, which sticks out further still", () => {
    // The ring is 7px outside the box on every side, and stroked the same way,
    // so the far edge reaches 128/64 — again from the ink, while the origin
    // stays on the box.
    const one: Graph = { direction: "TD", nodes: [node("a")], edges: [] };
    const opts = { margin: 0, highlight: ["a"] };
    const meta = svgMeta(one, { a: { x: 60, y: 28 } }, opts);
    expect(meta).toEqual({ originX: 0, originY: 0, width: 128, height: 64 });
    expect(attrs(toSvg(one, { a: { x: 60, y: 28 } }, opts)).viewBox).toBe("0 0 128 64");
  });

  it("nothing is scaled to fit: width and height are the viewBox's own", () => {
    const a = attrs(toSvg(graph, far));
    expect(`${a.width} ${a.height}`).toBe(`${a.viewBox?.split(" ")[2]} ${a.viewBox?.split(" ")[3]}`);
  });
});

// ---------------------------------------------------------------------------
// D18 — the render origin is stable
// ---------------------------------------------------------------------------

describe("D18: the render origin is stable", () => {
  const { graph, positions } = fixture("auth");

  it("deleting the leftmost, then the topmost node moves nothing that remains", () => {
    // `reject` is the leftmost node (x=140) and `start` the topmost (y=60);
    // under a bounds-derived origin, deleting either translates the whole
    // picture at 0px store drift — invisible to every store-level gate.
    const full = nodeCoords(toSvg(graph, positions));
    const noLeft = without(graph, "reject");
    const noLeftTop = without(noLeft, "start");
    const second = nodeCoords(toSvg(noLeft, positions));
    const third = nodeCoords(toSvg(noLeftTop, positions));

    for (const n of noLeftTop.nodes) {
      expect(second.get(n.label), n.id).toBe(full.get(n.label));
      expect(third.get(n.label), n.id).toBe(full.get(n.label));
    }
    expect(third.size).toBe(full.size - 2);
  });

  it("the origin is (0, 0) whenever the content stays out of the gutter", () => {
    expect(svgMeta(graph, positions)).toMatchObject({ originX: 0, originY: 0 });
  });

  it("a node the snap pass clamped to the bound does not move the origin", () => {
    // The clamp puts a movable node's *box* at exactly MARGIN, and the 2px
    // stroke it paints reaches one pixel further into the gutter. An origin
    // measured from painted ink follows it to -1, and every node in the chart
    // is then drawn 1px right at 0px store drift — D18's complaint in miniature.
    const { positions: clamped } = snap(graph, positions, [
      { id: "done", at: { x: -400, y: -400 } },
    ]);
    const done = graph.nodes.find((n) => n.id === "done") as Node;
    expect(boxOf(done, clamped.done as Position).x).toBe(MARGIN);
    expect(svgMeta(graph, clamped)).toMatchObject({ originX: 0, originY: 0 });
    // And the picture proves it: every other node is drawn where it was.
    const before = nodeCoords(toSvg(graph, positions));
    const after = nodeCoords(toSvg(graph, clamped));
    for (const n of graph.nodes) {
      if (n.id !== "done") expect(after.get(n.label), n.id).toBe(before.get(n.label));
    }
  });

  it("only content carried past the bound extends the origin", () => {
    // A frozen node stored outside the minimum bound is emitted verbatim by the
    // snap pass (D17), so the canvas has to reach it rather than crop it.
    const out: Record<string, Position> = { ...positions, reject: { x: -300, y: 300 } };
    const meta = svgMeta(graph, out);
    expect(meta.originX).toBeLessThan(0);
    expect(meta.originY).toBe(0);
    // Still no translation: the node is drawn at the coordinate it is stored at.
    expect(nodeCoords(toSvg(graph, out)).get("401 Unauthorized")).toBe("-300,305");
  });
});

// ---------------------------------------------------------------------------
// the exported transform
// ---------------------------------------------------------------------------

describe("the exported transform", () => {
  const { graph, positions } = fixture("auth");

  it("matches what the SVG actually uses", () => {
    const meta = svgMeta(graph, positions);
    const a = attrs(toSvg(graph, positions));
    expect(a.width).toBe(String(meta.width));
    expect(a.height).toBe(String(meta.height));
    expect(a.viewBox).toBe(`${meta.originX} ${meta.originY} ${meta.width} ${meta.height}`);
  });

  it("round-trips a pointer position back to a store position", () => {
    // The one rule a host must not re-derive: `store = origin + pixel offset`,
    // for an SVG rendered at its natural size. Checked on a canvas whose origin
    // is not (0, 0), because that is the case where getting it wrong shows.
    const shifted: Record<string, Position> = { ...positions, reject: { x: -300, y: -40 } };
    const meta = svgMeta(graph, shifted);
    expect(meta.originX < 0 && meta.originY < 0).toBe(true);
    for (const n of graph.nodes) {
      const p = shifted[n.id] ?? { x: 0, y: 0 };
      const pointer = { x: p.x - meta.originX, y: p.y - meta.originY };
      expect(pointer.x, n.id).toBeGreaterThanOrEqual(0);
      expect(pointer.y, n.id).toBeGreaterThanOrEqual(0);
      expect(pointer.x, n.id).toBeLessThanOrEqual(meta.width);
      expect(pointer.y, n.id).toBeLessThanOrEqual(meta.height);
      expect({ x: meta.originX + pointer.x, y: meta.originY + pointer.y }).toEqual(p);
    }
  });

  it("honours the margin option without translating the picture", () => {
    const plain = svgMeta(graph, positions);
    const wide = svgMeta(graph, positions, { margin: MARGIN + 30 });
    expect(wide.width).toBeGreaterThan(plain.width);
    expect(wide.height).toBeGreaterThan(plain.height);
    // A wider gutter grows the canvas; it never moves a node on it.
    expect(nodeCoords(toSvg(graph, positions, { margin: MARGIN + 30 }))).toEqual(
      nodeCoords(toSvg(graph, positions)),
    );
  });
});

// ---------------------------------------------------------------------------
// options
// ---------------------------------------------------------------------------

describe("options", () => {
  const { graph, positions } = fixture("auth");

  it("draws highlighted nodes and edges with the accent token", () => {
    // The accent marker always sits in <defs>; nothing may *use* it unasked.
    const plain = toSvg(graph, positions);
    const hot = toSvg(graph, positions, { highlight: ["check", "check->rate"] });
    expect(plain).not.toContain(`stroke="${DEFAULT_THEME.accent}"`);
    expect(plain).not.toContain("ablauf-arrow-accent)");
    expect(hot).toContain(`stroke="${DEFAULT_THEME.accent}"`);
    expect(hot).toContain('stroke-dasharray="6 4"');
    expect(hot).toContain('marker-end="url(#ablauf-arrow-accent)"');
  });

  it("emits the title as <title>, first and undrawn", () => {
    const svg = toSvg(graph, positions, { title: "Room auth flow" });
    expect(svg).toContain("<title>Room auth flow</title>");
    expect(svg.indexOf("<title>")).toBeLessThan(svg.indexOf("<defs>"));
  });

  it("overrides theme tokens shallowly and writes them literally", () => {
    const svg = toSvg(graph, positions, { theme: { background: "#101014", text: "#f5f5f5" } });
    expect(svg).toContain(`fill="#101014"`);
    expect(svg).toContain(`fill="#f5f5f5"`);
    // Untouched tokens keep their defaults, and nothing indirects through CSS.
    expect(svg).toContain(`stroke="${DEFAULT_THEME.stroke}"`);
    expect(svg).not.toContain("<style");
    expect(svg).not.toContain("currentColor");
  });

  it("draws the debug grid only when asked", () => {
    expect(toSvg(graph, positions)).not.toContain(DEFAULT_THEME.grid);
    expect(toSvg(graph, positions, { debugGrid: true })).toContain(`stroke="${DEFAULT_THEME.grid}"`);
  });

  it("draws the debug grid at a size the coordinates cannot inflate", () => {
    // One repeating pattern cell, not a line per 40px: the enumerated version
    // put 25 million `<line>` elements in front of a node at x=1e9.
    const far: Graph = { direction: "TD", nodes: [node("a")], edges: [] };
    const pos = { a: { x: 1e9, y: 40 } };
    const plain = toSvg(far, pos);
    const grid = toSvg(far, pos, { debugGrid: true });
    expect(grid).toContain('patternUnits="userSpaceOnUse"');
    expect(grid.length).toBeLessThan(3 * plain.length);
  });

  it("rejects an option it cannot draw with, naming it", () => {
    for (const margin of [-20, Number.NaN, 1.5]) {
      expect(() => svgMeta(graph, positions, { margin })).toThrow(/options\.margin/);
      expect(() => toSvg(graph, positions, { margin })).toThrow(/options\.margin/);
    }
    const fontSize = Number.POSITIVE_INFINITY;
    expect(() => toSvg(graph, positions, { theme: { fontSize } })).toThrow(/options\.theme\.fontSize/);
  });

  it("gives each of the four edge styles its own line", () => {
    const two: Graph = {
      direction: "TD",
      nodes: [node("a"), node("b")],
      edges: [
        { from: "a", to: "b", style: "arrow" },
        { from: "a", to: "b", style: "open" },
        { from: "a", to: "b", style: "dotted" },
        { from: "a", to: "b", style: "thick" },
      ],
    };
    const pos = { a: { x: 200, y: 100 }, b: { x: 200, y: 400 } };
    const body = toSvg(two, pos).split("</defs>")[1] ?? "";
    const paths = [...body.matchAll(/<path [^>]*>/g)].map((m) => m[0]);
    expect(paths).toHaveLength(4);
    expect(paths[0]).toContain('marker-end="url(#ablauf-arrow)"');
    expect(paths[1]).not.toContain("marker-end");
    expect(paths[2]).toContain('stroke-dasharray="6 4"');
    expect(paths[3]).toContain(`stroke-width="${DEFAULT_THEME.thickStrokeWidth}"`);
  });
});

// ---------------------------------------------------------------------------
// failing loudly, and escaping
// ---------------------------------------------------------------------------

describe("bad input", () => {
  const two: Graph = { direction: "TD", nodes: [node("a"), node("b")], edges: [] };

  it("throws, naming the node, when a position is missing", () => {
    expect(() => toSvg(two, { a: { x: 100, y: 100 } })).toThrow(/no position for node "b"/);
  });

  it("throws, naming the node, when a position is not a finite point", () => {
    const bad = { a: { x: 100, y: 100 }, b: { x: Number.NaN, y: 0 } };
    expect(() => toSvg(two, bad)).toThrow(/"b" is not a finite point/);
  });

  it("ignores a position for a node the graph does not have", () => {
    // That is an orphan, and the layout store keeps orphans on purpose.
    const pos = { a: { x: 100, y: 100 }, b: { x: 100, y: 300 } };
    expect(toSvg(two, { ...pos, ghost: { x: 9000, y: 9000 } })).toBe(toSvg(two, pos));
  });

  it("escapes every label, so a <script> label comes out inert", () => {
    const hostile: Graph = {
      direction: "TD",
      nodes: [
        { id: "a", label: `<script>alert("xss")</script>`, kind: "process" },
        { id: "b", label: `Tom & Jerry's "quotes"`, kind: "decision" },
      ],
      edges: [{ from: "a", to: "b", style: "arrow", label: `<b>&amp;</b>` }],
    };
    const svg = toSvg(hostile, { a: { x: 300, y: 100 }, b: { x: 300, y: 400 } }, { title: "<x>" });
    expect(svg).not.toContain("<script");
    expect(svg).not.toContain("</script>");
    expect(svg).toContain("&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;");
    expect(svg).toContain("Tom &amp; Jerry&apos;s &quot;quotes&quot;");
    expect(svg).toContain("&lt;b&gt;&amp;amp;&lt;/b&gt;");
    expect(svg).toContain("<title>&lt;x&gt;</title>");
    // The tags that are left are the renderer's own, and they balance.
    expect(svg.match(/</g)?.length).toBe(svg.match(/>/g)?.length);
  });

  it("escapes theme tokens too, so a hostile one cannot break out of an attribute", () => {
    // Tokens are host input like labels are, and they land in attributes rather
    // than in text nodes — the half of the surface the label test does not see.
    const evil = `" onload="alert(1)" x="<script>`;
    const hostile = Object.fromEntries(
      Object.entries(DEFAULT_THEME)
        .filter(([, v]) => typeof v === "string")
        .map(([k]) => [k, evil]),
    ) as Partial<Theme>;
    const auth = fixture("auth");
    const svg = toSvg(auth.graph, auth.positions, {
      theme: hostile,
      debugGrid: true,
      highlight: ["check", "check->rate"],
    });
    expect(svg).not.toContain(evil);
    expect(svg).toContain("&quot; onload=&quot;alert(1)&quot; x=&quot;&lt;script&gt;");
    const values = [...svg.matchAll(/="([^"]*)"/g)].map((m) => m[1] ?? "");
    expect(values.length).toBeGreaterThan(20);
    for (const value of values) expect(value).not.toContain("<");
    // Still one document, and its tags balance.
    expect(svg.match(/<svg\b/g)).toHaveLength(1);
    expect(svg.match(/<\/svg>/g)).toHaveLength(1);
    expect(svg.match(/</g)?.length).toBe(svg.match(/>/g)?.length);
  });

  it("throws rather than emitting a non-finite number", () => {
    // Two nodes a full float apart: the canvas width overflows to Infinity, and
    // an SVG carrying `width="Infinity"` fails silently in a viewer instead.
    const apart = { a: { x: -1e308, y: 0 }, b: { x: 1e308, y: 0 } };
    expect(() => svgMeta(pair(), apart)).toThrow(RenderError);
    expect(() => toSvg(pair(), apart)).toThrow(/not a finite number/);
    // A canvas that merely is enormous still renders, and renders finite.
    expect(toSvg(pair(), { a: { x: 0, y: 0 }, b: { x: 1e9, y: 0 } })).not.toContain("Infinity");
  });

  it("renders an empty graph as a margin-sized sheet rather than nothing", () => {
    const empty: Graph = { direction: "TD", nodes: [], edges: [] };
    const side = 2 * MARGIN;
    expect(svgMeta(empty, {})).toEqual({ originX: 0, originY: 0, width: side, height: side });
    expect(toSvg(empty, {})).toContain(`width="${side}" height="${side}"`);
  });
});

// ---------------------------------------------------------------------------
// the renderer measures nothing
// ---------------------------------------------------------------------------

it("takes every size from src/geometry.ts, never from the text", () => {
  // A relabel that does not change the size rule's output must not change the
  // drawn box; one that does must change it by exactly what sizeOf says.
  const short = node("a", "ab");
  const long = node("a", "a much longer label than that one");
  const graph = (n: Node): Graph => ({ direction: "TD", nodes: [n], edges: [] });
  const pos = { a: { x: 300, y: 300 } };
  const boxAttr = (svg: string): string => (svg.match(/<rect x="[^"]*"[^>]*rx="0"[^>]*\/>/) ?? [""])[0];
  expect(sizeOf(short)).toEqual({ w: 120, h: 56 });
  expect(boxAttr(toSvg(graph(short), pos))).toContain(`width="120"`);
  expect(boxAttr(toSvg(graph(long), pos))).toContain(`width="${sizeOf(long).w}"`);
});
