// Regenerates the SVGs the README embeds (docs/assets/readme-*.svg) —
// nothing hand-drawn. Run after any renderer change:
// `pnpm build && node scripts/readme-images.mjs`, then commit the diff
// (or the absence of one).
//
// Every frame is written twice, once per shipped theme: `readme-v1.svg` beside
// `readme-v1-dark.svg`. Dark is a second render and never an adaptive SVG
// (`src/render/theme.ts`, D5/D21), so the README picks between the two files
// with a `<picture>` — which this script asserts is still how each frame is
// embedded, alongside the guards below.
//
// The base chart is the README's own example — the exact text and store the
// reader just saw as code blocks, which this script asserts are still in the
// README verbatim. The two edit steps demonstrate the README's claim:
// successive versions of a chart are not byte-identical — the canvas grows,
// nodes appear — but every node that existed before is drawn at exactly the
// coordinates it had, which this script asserts before writing anything. An
// image that would contradict the README kills the run instead — as does one
// that is illegible as a drawing: every frame is checked for an edge through a
// box and for two edges drawn as one line before it is written.
import { mkdirSync, writeFileSync } from "node:fs";
import { DARK_THEME, MARGIN, boxOf, parse, snap, toSvg } from "../dist/index.js";
import { ROOT, applyOps, read } from "./graph.mjs";

const SNIPPET = `flowchart TD
  start([Request arrives]) --> check{Valid token?}
  check -->|no| reject[401 Unauthorized]
  check -->|yes| rate{Rate limited?}
  rate -->|no| allow[Open room]`;

const STORE = {
  start: { x: 380, y: 60 },
  check: { x: 380, y: 170 },
  reject: { x: 140, y: 300 },
  rate: { x: 380, y: 300 },
  allow: { x: 380, y: 540 },
};

/**
 * The evolution frames: each edits the previous graph and places only what it
 * added. `name` is the frame, not a filename — every frame becomes two files.
 */
const STEPS = [
  {
    name: "readme-v2",
    title: "Auth flow + retry queue",
    ops: [
      { op: "addNode", id: "queue", label: "Queue request", kind: "process" },
      { op: "addEdge", from: "rate", to: "queue", label: "yes" },
      { op: "addEdge", from: "queue", to: "start" },
    ],
    // Beside the rate limiter, not below it: the queue is a detour off that
    // decision's right vertex and the retry goes back to where requests come
    // in, so `right` is the placement the edit means.
    directives: [{ id: "queue", rel: { of: "rate", dir: "right" } }],
  },
  {
    name: "readme-v3",
    title: "Auth flow + audit trail",
    ops: [
      { op: "addNode", id: "audit", label: "Write audit log", kind: "process" },
      { op: "addNode", id: "done", label: "Done", kind: "stadium" },
      { op: "addEdge", from: "allow", to: "audit" },
      { op: "addEdge", from: "audit", to: "done" },
    ],
    directives: [
      { id: "audit", rel: { of: "allow", dir: "below" } },
      { id: "done", rel: { of: "audit", dir: "below" } },
    ],
  },
];

const OUT = new URL("docs/assets/", ROOT);
mkdirSync(OUT, { recursive: true });

const fail = (msg) => {
  console.error(`FAIL  ${msg}`);
  process.exit(1);
};

// Drift guard, first half: the hero image must be a render of what the README
// shows. (The second half, further down, checks how the frames are embedded.)
const readme = read("README.md");
if (!readme.includes(SNIPPET)) fail("README.md no longer contains SNIPPET verbatim — update one of them");
for (const [id, p] of Object.entries(STORE)) {
  if (!new RegExp(`"${id}":\\s*\\{ "x": ${p.x}, "y": +${p.y} \\}`).test(readme))
    fail(`README.md's store block no longer places "${id}" at (${p.x}, ${p.y}) — update one of them`);
}

/**
 * Legibility guard: the two defects a README frame must never show, asked of
 * the bytes about to be written rather than of a human looking at them. Both
 * are the corpus pins `test/render.test.ts` runs over the goldens and the
 * ladder scenarios (`throughBoxes`, `retraced`) — the same predicates, asked
 * here because these three charts are not in either corpus and this script is
 * the only guard they have.
 *
 * Every edge's polyline, in declaration order, read back out of the drawn
 * paths: one `<path>` per edge whose `d` is nothing but `M`/`L` moves
 * (`src/render/svg.ts`), with `</defs>` cutting off the arrow markers.
 */
const polylines = (svg) =>
  [...(svg.split("</defs>")[1] ?? "").matchAll(/<path d="([^"]+)"/g)].map((m) =>
    (m[1] ?? "").split(" ").map((p) => p.slice(1).split(",").map(Number)),
  );

/**
 * Does a segment run through the **interior** of a box — strict on all four
 * sides, the same `through` test the router asks itself (D24), so an anchor on
 * a border or a run along one is not a crossing.
 */
const cuts = (b, [ax, ay], [bx, by]) =>
  Math.min(ax, bx) < b.x + b.w &&
  Math.max(ax, bx) > b.x &&
  Math.min(ay, by) < b.y + b.h &&
  Math.max(ay, by) > b.y;

/** Two axis-aligned segments on the same line sharing more than a single point. */
const retraces = ([a, b], [c, d]) => {
  const spans = (p, q, r, s) => Math.min(p, q) < Math.max(r, s) && Math.min(r, s) < Math.max(p, q);
  return (
    (a[0] === b[0] && c[0] === d[0] && a[0] === c[0] && spans(a[1], b[1], c[1], d[1])) ||
    (a[1] === b[1] && c[1] === d[1] && a[1] === c[1] && spans(a[0], b[0], c[0], d[0]))
  );
};

/**
 * The one exempt overlap (D23's single-entry rule): the trunk from a decision's
 * entry junctions down into its top vertex is one line with a junction on it,
 * drawn by every edge that merges there. Scoped exactly as `retraced()`'s own
 * `trunk` is — same diamond, vertical on its centre x, inside the half-`MARGIN`
 * per inbound edge above the vertex. Nothing else, anywhere, is exempt.
 */
const trunk = (graph, at, ei, ej, [a, b], [c, d]) => {
  if (ei.to !== ej.to) return false;
  const target = graph.nodes.find((n) => n.id === ei.to);
  const centre = at[ei.to];
  if (target?.kind !== "decision" || centre === undefined) return false;
  const box = boxOf(target, centre);
  if (a[0] !== box.cx || a[0] !== b[0]) return false;
  const inbound = graph.edges.filter((e) => e.to === ei.to && e.from !== e.to).length;
  return (
    Math.max(Math.min(a[1], b[1]), Math.min(c[1], d[1])) >= box.y - (inbound * MARGIN) / 2 &&
    Math.min(Math.max(a[1], b[1]), Math.max(c[1], d[1])) <= box.y
  );
};

/** Every defect in one rendered frame, named so the failure says which edge. */
const defects = (graph, at, svg) => {
  const lines = polylines(svg);
  const segments = (i) => (lines[i] ?? []).slice(1).map((p, k) => [lines[i][k], p]);
  const bad = [];
  graph.edges.forEach((e, i) => {
    for (const [k, seg] of segments(i).entries())
      for (const n of graph.nodes) {
        if (cuts(boxOf(n, at[n.id]), seg[0], seg[1])) bad.push(`${e.from}->${e.to}@seg${k} through ${n.id}`);
      }
  });
  for (let i = 0; i < graph.edges.length; i++)
    for (let j = i + 1; j < graph.edges.length; j++)
      for (const p of segments(i))
        for (const q of segments(j)) {
          const [ei, ej] = [graph.edges[i], graph.edges[j]];
          if (retraces(p, q) && !trunk(graph, at, ei, ej, p, q))
            bad.push(`${ei.from}->${ei.to} drawn over ${ej.from}->${ej.to}`);
        }
  return bad;
};

/** One frame, both shipped themes. Same graph, same positions — only the palette differs. */
const frame = (name, graph, positions, title) => {
  const files = [
    [`${name}.svg`, toSvg(graph, positions, { title })],
    [`${name}-dark.svg`, toSvg(graph, positions, { title, theme: DARK_THEME })],
  ];
  // Asked of each file, not of the frame: the two themes are one geometry, and
  // a palette that ever stopped agreeing about that is itself the bug.
  for (const [file, svg] of files) {
    const bad = defects(graph, positions, svg);
    if (bad.length > 0) fail(`${file}: ${bad.join("; ")}`);
  }
  console.log(`ok      ${name}: no edge through a box, no two edges drawn as one`);
  return files;
};

let graph = parse(SNIPPET);
let positions = STORE;
const names = ["readme-v1", ...STEPS.map((s) => s.name)];
const files = frame("readme-v1", graph, positions, "Auth flow");
for (const step of STEPS) {
  const prev = positions;
  graph = applyOps(graph, step.ops);
  let warnings;
  ({ positions, warnings } = snap(graph, prev, step.directives));
  if (warnings.length > 0) fail(`${step.name}: unexpected warnings ${warnings.map((w) => w.code).join(", ")}`);
  for (const id of Object.keys(prev)) {
    if (JSON.stringify(positions[id]) !== JSON.stringify(prev[id]))
      fail(`${step.name}: frozen node "${id}" moved — the README's claim would be a lie`);
  }
  files.push(...frame(step.name, graph, positions, step.title));
}

/**
 * Drift guard, second half: a frame the README embeds without its dark twin is
 * a frame half the readers see in the wrong palette. `<picture>` is GitHub's
 * mechanism, and this asks for its exact shape per frame — a `<source>`
 * carrying *both* the dark media query and the dark file, then the `<img>` on
 * the light file with non-empty alt.
 *
 * The lookaheads are why each attribute is pinned to its own element rather
 * than to the block: a `<source>` that lost its `media` matches every scheme,
 * and a `srcset` that slid onto the `<img>` is never consulted at all — both
 * serve one palette to everyone while a substring search still says yes.
 * Attribute *order* inside an element stays free.
 */
const shapeOf = (name) =>
  new RegExp(
    `<source(?=[^>]*\\bmedia="\\(prefers-color-scheme: dark\\)")(?=[^>]*\\bsrcset="docs/assets/${name}-dark\\.svg")[^>]*>` +
      `\\s*<img(?=[^>]*\\bsrc="docs/assets/${name}\\.svg")(?=[^>]*\\balt="[^"]+")[^>]*>`,
  );

const pictures = readme.match(/<picture>[\s\S]*?<\/picture>/g) ?? [];
for (const name of names) {
  // Every `<picture>` naming the frame has to be a good one, so a malformed
  // embed cannot hide beside a correct one further down the page.
  const mentions = pictures.filter((p) => p.includes(`docs/assets/${name}`));
  const good = mentions.filter((p) => shapeOf(name).test(p));
  if (good.length === 0)
    fail(
      `README.md has no well-formed <picture> for ${name} — needs <source media="(prefers-color-scheme: dark)" ` +
        `srcset="docs/assets/${name}-dark.svg"> followed by <img src="docs/assets/${name}.svg" alt="…">`,
    );
  if (good.length < mentions.length)
    fail(`README.md has ${mentions.length - good.length} <picture> element(s) naming ${name} that are not that shape`);
}
// Markdown's `![…]()` cannot carry a `<picture>`, so a leftover one is a
// light-only frame and fails too.
const bare = readme.match(/!\[[^\]]*\]\(docs\/assets\/[^)]+\)/g) ?? [];
if (bare.length > 0) fail(`README.md still embeds ${bare.join(", ")} as a markdown image — use a <picture>`);

for (const [file, svg] of files) {
  writeFileSync(new URL(file, OUT), svg);
  console.log(`wrote docs/assets/${file}`);
}
