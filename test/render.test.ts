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
  DARK_THEME,
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

/**
 * Every edge's polyline, in declaration order, read back out of the drawn
 * paths: the renderer emits one `<path>` per edge, in that order, and its `d`
 * is nothing but `M`/`L` moves (`src/render/svg.ts`). `</defs>` cuts off the
 * arrow markers, which are paths too.
 */
type Pt = [number, number];
const polylines = (svg: string): Pt[][] =>
  [...(svg.split("</defs>")[1] ?? "").matchAll(/<path d="([^"]+)"/g)].map((m) =>
    (m[1] ?? "").split(" ").map((p) => p.slice(1).split(",").map(Number) as Pt),
  );

/** A legibility scenario from issues #13/#14: text and positions in, polylines out. */
const routes = (text: string, at: Record<string, [number, number]>): Pt[][] =>
  polylines(
    toSvg(
      parse(text),
      Object.fromEntries(Object.entries(at).map(([id, [x, y]]) => [id, { x, y }])),
    ),
  );

/**
 * Which boxes one route runs through the **interior** of — the same strict test
 * the router itself asks (`through` in src/render/svg.ts), so an anchor sitting
 * on a border, or a segment running along one, is not a crossing. Every node in
 * the chart counts, the edge's own endpoints included — both of them, for a
 * self-loop (D25).
 */
const crossings = (line: Pt[], text: string, at: Record<string, [number, number]>): string[] => {
  const hits: string[] = [];
  for (const n of parse(text).nodes) {
    const [x, y] = at[n.id] as [number, number];
    const b = boxOf(n, { x, y });
    for (let i = 0; i + 1 < line.length; i++) {
      const [ax, ay] = line[i] as Pt;
      const [bx, by] = line[i + 1] as Pt;
      const over =
        Math.min(ax, bx) < b.x + b.w &&
        Math.max(ax, bx) > b.x &&
        Math.min(ay, by) < b.y + b.h &&
        Math.max(ay, by) > b.y;
      if (over) hits.push(`${n.id}@seg${i}`);
    }
  }
  return hits;
};

/**
 * Which pairs of distinct edges are drawn one on top of the other: two
 * axis-aligned segments on the same line sharing more than a single point
 * (D23/D26). Crossing at a point is fine and unavoidable; sharing a run is the
 * defect — a doubled line the reader cannot take apart, and an arrowhead
 * stranded in the middle of somebody else's edge.
 */
const retraced = (graph: Graph, svg: string): string[] => {
  const lines = polylines(svg);
  const segments = (pts: Pt[]): [Pt, Pt][] =>
    pts.slice(1).map((p, i) => [pts[i] as Pt, p] as [Pt, Pt]);
  const spans = (a: number, b: number, c: number, d: number): boolean =>
    Math.min(a, b) < Math.max(c, d) && Math.min(c, d) < Math.max(a, b);
  const retraces = ([a, b]: [Pt, Pt], [c, d]: [Pt, Pt]): boolean =>
    (a[0] === b[0] && c[0] === d[0] && a[0] === c[0] && spans(a[1], b[1], c[1], d[1])) ||
    (a[1] === b[1] && c[1] === d[1] && a[1] === c[1] && spans(a[0], b[0], c[0], d[0]));

  const doubled: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    for (let j = i + 1; j < lines.length; j++) {
      for (const p of segments(lines[i] ?? [])) {
        for (const q of segments(lines[j] ?? [])) {
          const [ei, ej] = [graph.edges[i], graph.edges[j]];
          if (retraces(p, q)) doubled.push(`${ei?.from}->${ei?.to} × ${ej?.from}->${ej?.to}`);
        }
      }
    }
  }
  return doubled;
};

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

/**
 * The dark half of the pair (`DARK_THEME`): one fixture, the second preset,
 * pinned the same way — colours are written literally, so a palette change is
 * a reviewable byte diff like any other (D5/D21).
 */
it("renders the auth fixture with DARK_THEME byte-identically to its golden", () => {
  const { graph, positions } = fixture("auth");
  const svg = toSvg(graph, positions, { title: titleOf("auth"), theme: DARK_THEME });
  if (process.env.UPDATE_GOLDEN === "1") writeFileSync(goldenPath("auth-dark"), svg);
  expect(svg).toBe(readFileSync(goldenPath("auth-dark"), "utf8"));
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
// D23 — one endpoint per anchor
// ---------------------------------------------------------------------------

describe("D23: one endpoint per anchor", () => {
  // Every anchor below is arithmetic rather than a snapshot: `sizeOf` makes a
  // decision `max(120, round(label*8.4) + 36) + 44` wide and 74 tall and every
  // other shape that width without the 44 and 56 tall, centred on its position.
  // So `d` at (320, 180) is 164x74 — top vertex (320, 143), left (238, 180),
  // right (402, 180) — and `e`, 120x56 at (320, 440), reaches 28px either way.
  const S2 = `flowchart TD
  a([Start]) --> d{OK?}
  d -->|yes| b1[Do thing]
  d -->|no| b2[Fix it]
  b1 --> e([End])
  b2 --> e`;
  const S2_AT: Record<string, [number, number]> = {
    a: [320, 60],
    d: [320, 180],
    b1: [180, 310],
    b2: [460, 310],
    e: [320, 440],
  };

  it("routes a diamond's entry through the top vertex and its exits through two others", () => {
    const [entry, yes, no] = routes(S2, S2_AT);
    expect(entry?.at(-1)).toEqual([320, 143]);
    expect(yes?.[0]).toEqual([238, 180]);
    expect(no?.[0]).toEqual([402, 180]);
  });

  it("lands two arrows into one merge target as mirror images of each other", () => {
    const [, , , first, second] = routes(S2, S2_AT);
    // `b1` and `b2` straddle x=320, so their claims on `e`'s top anchor are
    // exactly equal (D23): neither takes it by being declared first, both step
    // aside, and each keeps the side anchor it faces. Declaration order used to
    // give `first` the top and push `second` onto the right — the same geometry
    // drawn as two different shapes.
    expect(first).toEqual([
      [180, 338],
      [180, 440],
      [260, 440],
    ]);
    expect(second).toEqual([
      [460, 338],
      [460, 440],
      [380, 440],
    ]);
  });

  it("gives a ternary decision three vertices, and its merge target three anchors", () => {
    // S5. `sev` is 164x74 at (400, 190), `done` 120x56 at (400, 470).
    const lines = routes(
      `flowchart TD
  in([Alert fires]) --> sev{Severity?}
  sev -->|low| log[Log it]
  sev -->|medium| ticket[Open ticket]
  sev -->|high| page[Page on-call]
  log --> done([Done])
  ticket --> done
  page --> done`,
      {
        in: [400, 60],
        sev: [400, 190],
        log: [160, 330],
        ticket: [400, 330],
        page: [640, 330],
        done: [400, 470],
      },
    );
    expect(lines[0]?.at(-1)).toEqual([400, 153]);
    expect([lines[1]?.[0], lines[2]?.[0], lines[3]?.[0]]).toEqual([
      [318, 190], // low → left vertex
      [400, 227], // medium → bottom vertex
      [482, 190], // high → right vertex
    ]);
    expect([lines[4]?.at(-1), lines[5]?.at(-1), lines[6]?.at(-1)]).toEqual([
      [340, 470], // log → left
      [400, 442], // ticket → top
      [460, 470], // page → right
    ]);
  });

  it("spreads three arrows into one node over its left, top and right anchors", () => {
    // S7. `notify` is 145x56 at (400, 200). `b` is straight above it, so the top
    // is the only anchor `b` can be approached from and it is resolved first;
    // greedy declaration order would have let `a` take the top and strand `b`.
    const lines = routes(
      `flowchart TD
  a[Build fails] --> notify[Notify author]
  b[Scan fails] --> notify
  c[Deploy fails] --> notify
  notify --> done([Done])`,
      { a: [160, 60], b: [400, 60], c: [640, 60], notify: [400, 200], done: [400, 340] },
    );
    expect([lines[0]?.at(-1), lines[1]?.at(-1), lines[2]?.at(-1)]).toEqual([
      [327.5, 200],
      [400, 172],
      [472.5, 200],
    ]);
  });

  it("fans a five-edge diamond's surplus along its preferred side, on the outline", () => {
    // S6 (defined in #14). `route` is 164x74 at (400, 190) and carries five
    // endpoints: two in, three out.
    const lines = routes(
      `flowchart TD
  in([Request]) --> route{Route?}
  retry[Retry later] --> route
  route -->|a| svc1[Service A]
  route -->|b| svc2[Service B]
  route -->|c| svc3[Service C]
  svc3 --> retry`,
      {
        in: [400, 60],
        retry: [700, 60],
        route: [400, 190],
        svc1: [160, 330],
        svc2: [400, 330],
        svc3: [640, 330],
      },
    );
    const at = [lines[0]?.at(-1), lines[1]?.at(-1), lines[2]?.[0], lines[3]?.[0], lines[4]?.[0]];
    expect(new Set(at.map(String)).size).toBe(5);
    expect(at[0]).toEqual([400, 153]); // in → top vertex
    expect(at[2]).toEqual([318, 190]); // a → left vertex
    expect(at[3]).toEqual([400, 227]); // b → bottom vertex
    // The right side carries two — `retry -->` claimed it and `--> svc3` fanned
    // onto it — and both sit on the diamond's slanted edges, not off the box.
    expect([at[1], at[4]]).toEqual([
      [454.7, 177.7],
      [454.7, 202.3],
    ]);
  });

  it("draws no two edges on top of each other in the retry-loop scenario", () => {
    // The old one-port-per-side router gave `queue --> start` the same left port
    // `rate --> queue` had just arrived at, and 73px of the way back was drawn
    // twice, arrowhead stranded in the middle of the other line.
    const graph = parse(`flowchart TD
  start([Request arrives]) --> rate{Rate limited?}
  rate -->|yes| queue[Queue request]
  rate -->|no| allow[Open room]
  queue --> start`);
    const svg = toSvg(graph, {
      start: { x: 320, y: 60 },
      rate: { x: 320, y: 190 },
      queue: { x: 620, y: 190 },
      allow: { x: 320, y: 330 },
    });
    expect(retraced(graph, svg)).toEqual([]);
    // And the loop back really leaves upward and enters the far side, rather
    // than reversing back down the edge it came in on.
    expect(polylines(svg)[3]).toEqual([
      [620, 162],
      [620, 60],
      [401, 60],
    ]);
  });

  /**
   * Every chart this repo commits, rendered from its stored centres: the two
   * hand-arranged fixtures and the eight-scenario legibility ladder.
   */
  const charts: { name: string; graph: Graph; at: Record<string, Position> }[] = [
    ...FIXTURES.map((name) => ({ name, graph: fixture(name).graph, at: fixture(name).positions })),
    ...(
      JSON.parse(readFileSync(new URL("fixtures/scenarios/scenarios.json", ROOT), "utf8")) as {
        scenarios: { id: string; positions: Record<string, Position> }[];
      }
    ).scenarios.map((s) => ({
      name: s.id,
      graph: parse(readFileSync(new URL(`fixtures/scenarios/${s.id}.mmd`, ROOT), "utf8")),
      at: s.positions,
    })),
  ];

  it("draws mirror-image geometry as mirror-image routes, in every committed chart", () => {
    // Two edges meeting at one node from mirror-image positions have exactly
    // equal claims on the anchors between them, so their routes have to be
    // reflections of each other — that is the whole of #25. The three nodes
    // involved have to mirror as *wholes*, though: an unmirrored third edge on
    // any of them claims an anchor first and breaks the symmetry legitimately,
    // which is why `lint --> gate` and `unit --> gate` are not in the list
    // below — `gate`'s two exits are not mirror images.
    const found: string[] = [];
    for (const { name, graph, at } of charts) {
      const box = new Map(graph.nodes.map((n) => [n.id, boxOf(n, at[n.id] as Position)]));
      const lines = polylines(toSvg(graph, at));
      /** One box as a reflection-comparable key, `flip` reflecting it about `axis`. */
      const key = (id: string, axis: number, flip: boolean): string => {
        const b = box.get(id);
        return b === undefined ? id : `${flip ? 2 * axis - b.cx : b.cx},${b.cy},${b.w},${b.h}`;
      };
      /** Everything attached to one node, as those keys, in a fixed order. */
      const around = (id: string, axis: number, flip: boolean): string =>
        graph.edges
          .flatMap((e) => (e.from === id ? [e.to] : e.to === id ? [e.from] : []))
          .map((other) => key(other, axis, flip))
          .sort()
          .join(" ");
      for (let i = 0; i < graph.edges.length; i++) {
        for (let j = i + 1; j < graph.edges.length; j++) {
          const a = graph.edges[i]!;
          const b = graph.edges[j]!;
          const hub = a.to === b.to ? a.to : a.from === b.from ? a.from : null;
          const [u, v] = hub === a.to ? [a.from, b.from] : [a.to, b.to];
          const axis = box.get(hub ?? "")?.cx;
          if (hub === null || axis === undefined || u === v) continue;
          if (key(u!, axis, true) !== key(v!, axis, false)) continue;
          if (around(hub, axis, false) !== around(hub, axis, true)) continue;
          if (around(u!, axis, true) !== around(v!, axis, false)) continue;
          const flipped = (lines[i] ?? []).map(([px, py]) => [2 * axis - (px ?? 0), py] as Pt);
          expect(flipped, `${name}: ${a.from}->${a.to} vs ${b.from}->${b.to}`).toEqual(lines[j]);
          found.push(`${name}: ${a.from}->${a.to} ~ ${b.from}->${b.to}`);
        }
      }
    }
    // Pinned, so the check cannot quietly stop finding anything to check.
    expect(found).toEqual([
      "deploy: push->lint ~ push->unit",
      "s2-branch-merge: d->b1 ~ d->b2",
      "s2-branch-merge: b1->e ~ b2->e",
    ]);
  });
});

// ---------------------------------------------------------------------------
// D24 — a backward edge routes through a gutter
// ---------------------------------------------------------------------------

describe("D24: a backward edge clears the boxes between its ends", () => {
  // S4. The mid-y elbow of `fix --> push` used to run the full width of the
  // chart at y=190, straight through `unit` (162..218) — the corridor is blind
  // to what sits in it, which is the whole of issue #14.
  const S4 = `flowchart TD
  push([Push]) --> lint[Lint] & unit[Unit tests]
  lint & unit --> gate{All green?}
  gate -->|no| fix[Fix]
  fix --> push
  gate -->|yes| ship[Ship it]`;
  const S4_AT: Record<string, [number, number]> = {
    push: [360, 60],
    lint: [220, 190],
    unit: [500, 190],
    gate: [360, 320],
    fix: [640, 320],
    ship: [360, 460],
  };

  it("takes `fix --> push` out of the corridor `unit` is standing in", () => {
    const back = routes(S4, S4_AT)[5] as Pt[];
    expect(crossings(back, S4, S4_AT)).toEqual([]);
    // The band between the two turn points (y 98..282) holds `lint` and `unit`
    // only, so the corridor clears `unit`'s right edge by half a MARGIN — a
    // cheaper detour than going round `lint` on the left.
    // It arrives on `push`'s bottom at the midpoint: the two fan-out edges are
    // mirror images about x=360 and step off the bottom onto `push`'s two side
    // anchors (D23), so nothing shares the bottom with this one.
    expect(back.map(([x]) => x)).toEqual([640, 640, 570, 570, 360, 360]);
  });

  // S6. The endpoints' x-ranges overlap, so the midpoint of a *horizontal*
  // corridor would lie inside both boxes. With D23's anchors it does not arise;
  // this pins that, and that D24 leaves a clean backward edge alone.
  const S6 = `flowchart TD
  in([Request]) --> route{Route?}
  retry[Retry later] --> route
  route -->|a| svc1[Service A]
  route -->|b| svc2[Service B]
  route -->|c| svc3[Service C]
  svc3 --> retry`;
  const S6_AT: Record<string, [number, number]> = {
    in: [400, 60],
    retry: [700, 60],
    route: [400, 190],
    svc1: [160, 330],
    svc2: [400, 330],
    svc3: [640, 330],
  };

  it("keeps `svc3 --> retry` out of every box, its own two included", () => {
    const back = routes(S6, S6_AT)[5] as Pt[];
    expect(crossings(back, S6, S6_AT)).toEqual([]);
    // And it never turns back down: the phantom this scenario was reported for
    // was the route re-crossing its own source, which reads as a reversed edge.
    expect(back.every(([, y], i) => i === 0 || y <= (back[i - 1] as Pt)[1])).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// D25 — a self-loop is drawn outside its node
// ---------------------------------------------------------------------------

describe("D25: a self-loop loops outside its node", () => {
  /** An edge label's anchor point, read back off the one text at that size. */
  const edgeLabel = (svg: string, text: string): Pt => {
    const re = new RegExp(
      `<text x="([^"]+)" y="([^"]+)"[^>]*font-size="${DEFAULT_THEME.edgeFontSize}"[^>]*>${text}</text>`,
    );
    const m = re.exec(svg);
    return [Number(m?.[1]), Number(m?.[2])];
  };

  // S8. `a --> a` is valid mermaid and the parser takes it, but both ends land
  // on the same box, where the dogleg has no counterpart to aim at: it drew the
  // loop as a line along the node's own top border, arrowhead buried in the
  // border it arrived at — an edge the reader cannot see at all.
  const S8 = `flowchart TD
  a[Poll] --> a`;
  const S8_AT: Record<string, [number, number]> = { a: [200, 100] };

  it("leaves the right anchor and returns into the top, clear of the box", () => {
    const loop = routes(S8, S8_AT)[0] as Pt[];
    // `a` is 120x56 centred on (200, 100) — box 140..260 by 72..128 — so the
    // right anchor is (260, 100), the top one (200, 72), and the loop turns
    // half a MARGIN past the top-right corner, at (270, 62).
    expect(loop).toEqual([
      [260, 100],
      [270, 100],
      [270, 62],
      [200, 62],
      [200, 72],
    ]);
    expect(crossings(loop, S8, S8_AT)).toEqual([]);
    // The arrowhead is the last segment, and it approaches from *outside*:
    // 10px straight down onto the top border, not out of the node's middle.
    expect(loop.at(-2)).toEqual([200, 62]);
  });

  it("puts a label on the loop's outer run, not inside the node", () => {
    const svg = toSvg(parse(`flowchart TD
  a[Poll] -->|poll| a`), { a: { x: 200, y: 100 } });
    // The outer run (270, 62)–(200, 62) is the longest segment of the loop, so
    // `labelPos` lands there; the baseline sits `edgeFontSize / 3` below it and
    // still well above the box's top border at y=72.
    expect(edgeLabel(svg, "poll")).toEqual([235, 66.3]);
  });

  it("keeps two self-loops on one node apart", () => {
    const two = `flowchart TD
  a[Poll] --> a
  a --> a`;
    const loops = routes(two, S8_AT);
    const first = loops[0] as Pt[];
    const second = loops[1] as Pt[];
    // Nothing special-cases the second loop: both exits contest the right side
    // and both entries the top, so D23's fan puts them at 1/3 and 2/3 along it,
    // in declaration order, and the two routes come out distinct.
    expect(first).toEqual([
      [260, 90.7],
      [270, 90.7],
      [270, 62],
      [180, 62],
      [180, 72],
    ]);
    expect(second).toEqual([
      [260, 109.3],
      [270, 109.3],
      [270, 62],
      [220, 62],
      [220, 72],
    ]);
    expect(crossings(first, two, S8_AT).concat(crossings(second, two, S8_AT))).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// D26 — one corridor per edge
// ---------------------------------------------------------------------------

describe("D26: distinct edges share no segment", () => {
  it.each(FIXTURES)("%s: no two edges are drawn on top of each other", (name) => {
    const { graph, positions } = fixture(name);
    expect(retraced(graph, toSvg(graph, positions, { title: titleOf(name) }))).toEqual([]);
  });

  // The whole legibility ladder, straight off disk — the same eight charts the
  // acceptance gallery is looked at in, so the property is pinned where routing
  // changes are reviewed. S5 and S7 are the merges: their edges have to share
  // neither an anchor (D23) nor a corridor (D26).
  const scenarios = (
    JSON.parse(readFileSync(new URL("fixtures/scenarios/scenarios.json", ROOT), "utf8")) as {
      scenarios: { id: string; title: string; positions: Record<string, Position> }[];
    }
  ).scenarios;

  it.each(scenarios.map((s) => [s.id, s] as const))("%s: no two edges share a run", (id, s) => {
    const graph = parse(readFileSync(new URL(`fixtures/scenarios/${id}.mmd`, ROOT), "utf8"));
    expect(retraced(graph, toSvg(graph, s.positions, { title: s.title }))).toEqual([]);
  });

  it("gives the deploy fixture's two merge edges two corridors", () => {
    // The defect this rule exists for: `fail` (bottom anchor at y=313) and
    // `block` (at y=633) are both centred on x=1030, so both doglegs ran down
    // that one line — 94.5px of it drawn twice — before splitting to `notify`'s
    // two fanned top anchors. The elbows now sit at the anchors' own fan
    // fractions of the gap, 1/3 and 2/3, so the first turns off well above the
    // second starts.
    const { graph, positions } = fixture("deploy");
    const lines = polylines(toSvg(graph, positions, { title: titleOf("deploy") }));
    expect(lines[5]).toEqual([
      [1030, 313],
      [1030, 589.3], // 313 + (1142 - 313) / 3
      [1005.8, 589.3],
      [1005.8, 1142],
    ]);
    expect(lines[10]).toEqual([
      [1030, 633],
      [1030, 972.3], // 633 + (1142 - 633) * 2 / 3
      [1054.2, 972.3],
      [1054.2, 1142],
    ]);
  });

  it("leaves an unfanned edge on the midpoint the spike drew", () => {
    // `f` is 0.5 for every endpoint that has its side to itself, so the elbow
    // is the midpoint and nothing outside a fan moves at all.
    expect(routes("flowchart TD\n  a[A] --> b[B]", { a: [100, 100], b: [400, 300] })[0]).toEqual([
      [100, 128],
      [100, 200],
      [400, 200],
      [400, 272],
    ]);
  });
});

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
  });

  it("slides a chip that would cross the near edge, and moves no node doing it", () => {
    // The near edge is the origin's, and the origin is measured from node boxes
    // (D18): this chip is wider than the gutter in front of the two boxes it
    // sits between, so unclamped it would start left of the canvas and lose its
    // first characters. It slides instead — the chip keeps its size, the label
    // rides on it, and nothing about the nodes changes (D9, #10).
    const long = "a label far wider than either of the two boxes it sits between";
    const pos = { a: { x: 200, y: 100 }, b: { x: 200, y: 400 } };
    const meta = svgMeta(pair(long), pos);
    const svg = toSvg(pair(long), pos);

    // The chip is the only `rx="4"` rect the renderer draws.
    const found = /<rect x="([^"]+)" y="([^"]+)" width="([^"]+)" height="([^"]+)" rx="4"/.exec(svg);
    const [x = 0, y = 0, w = 0] = found?.slice(1).map(Number) ?? [];
    expect(found).not.toBeNull();
    // Unclamped it starts left of the origin; clamped it starts exactly on it.
    expect(200 - w / 2).toBeLessThan(meta.originX);
    expect(x).toBe(meta.originX);
    expect(y).toBeGreaterThanOrEqual(meta.originY);

    // The label travelled with its chip and sits centred on it, so no character
    // is cut off at the edge.
    const text = new RegExp(`<text x="([^"]+)"[^>]*>${long}</text>`).exec(svg);
    expect(Number(text?.[1])).toBe(x + w / 2);

    // And the nodes are drawn exactly where the short-label chart drew them.
    expect(nodeCoords(svg)).toEqual(nodeCoords(toSvg(pair("ok"), pos)));
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

// ---------------------------------------------------------------------------
// the dark preset
// ---------------------------------------------------------------------------

/**
 * WCAG 2.1 relative luminance, so the palette is checked by arithmetic and not
 * by eye. The `**` on the sRGB linearisation is fine here: D21 bans
 * approximated `Math` in `src/` — the render path whose bytes must match
 * across engines — not in a test's own assertions.
 */
const channels = (hex: string): [number, number, number] => {
  const n = Number.parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

const luminance = (hex: string): number => {
  const lin = (c: number): number => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  const [r, g, b] = channels(hex);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
};

const contrast = (a: string, b: string): number => {
  const [x, y] = [luminance(a), luminance(b)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
};

describe("DARK_THEME", () => {
  /** Every foreground on the canvas, then the label on each of the five fills. */
  const PAIRS: readonly (readonly [string, string, string])[] = [
    ["stroke on background", DARK_THEME.stroke, DARK_THEME.background],
    ["text on background", DARK_THEME.text, DARK_THEME.background],
    ["edge on background", DARK_THEME.edge, DARK_THEME.background],
    ["edgeText on background", DARK_THEME.edgeText, DARK_THEME.background],
    ["accent on background", DARK_THEME.accent, DARK_THEME.background],
    ["text on fillProcess", DARK_THEME.text, DARK_THEME.fillProcess],
    ["text on fillRounded", DARK_THEME.text, DARK_THEME.fillRounded],
    ["text on fillStadium", DARK_THEME.text, DARK_THEME.fillStadium],
    ["text on fillDecision", DARK_THEME.text, DARK_THEME.fillDecision],
    ["text on fillCircle", DARK_THEME.text, DARK_THEME.fillCircle],
  ];

  it("clears WCAG AA (4.5:1) on every foreground pair", () => {
    expect(PAIRS.filter(([, fg, bg]) => contrast(fg, bg) < 4.5).map(([name]) => name)).toEqual([]);
  });

  it("keeps accent unmistakable against edge and stroke", () => {
    // Contrast is the wrong instrument here: an amber and a blue-grey of the
    // same luminance sit at ~1.2:1 and still read as different colours. So
    // channel distance, out of a possible 765 — the palette's is ~275.
    const apart = (a: string, b: string): number => {
      const [p, q] = [channels(a), channels(b)];
      return Math.abs(p[0] - q[0]) + Math.abs(p[1] - q[1]) + Math.abs(p[2] - q[2]);
    };
    expect(apart(DARK_THEME.accent, DARK_THEME.edge)).toBeGreaterThanOrEqual(150);
    expect(apart(DARK_THEME.accent, DARK_THEME.stroke)).toBeGreaterThanOrEqual(150);
  });

  it("changes nothing but the palette", () => {
    // The render-twice contract is two palettes, not two geometries: a chart
    // rendered dark must land pixel-for-pixel where the light one did.
    const { graph, positions } = fixture("auth");
    expect(nodeCoords(toSvg(graph, positions, { theme: DARK_THEME }))).toEqual(
      nodeCoords(toSvg(graph, positions)),
    );
  });
});
