// Regenerates the SVGs the README embeds (docs/assets/readme-*.svg) —
// nothing hand-drawn. Run after any renderer change:
// `pnpm build && node scripts/readme-images.mjs`, then commit the diff
// (or the absence of one).
//
// The base chart is the README's own example — the exact text and store the
// reader just saw as code blocks, which this script asserts are still in the
// README verbatim. The two edit steps demonstrate the README's claim:
// successive versions of a chart are not byte-identical — the canvas grows,
// nodes appear — but every node that existed before is drawn at exactly the
// coordinates it had, which this script asserts before writing anything. An
// image that would contradict the README kills the run instead.
import { mkdirSync, writeFileSync } from "node:fs";
import { parse, snap, toSvg } from "../dist/index.js";
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

/** The evolution frames: each edits the previous graph and places only what it added. */
const STEPS = [
  {
    file: "readme-v2.svg",
    title: "Auth flow + queue",
    ops: [
      { op: "addNode", id: "queue", label: "Queue request", kind: "process" },
      { op: "addEdge", from: "rate", to: "queue", label: "yes" },
      { op: "addEdge", from: "queue", to: "allow" },
    ],
    directives: [{ id: "queue", rel: { of: "rate", dir: "below-right" } }],
  },
  {
    file: "readme-v3.svg",
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

// Drift guard: the hero image must be a render of what the README shows.
const readme = read("README.md");
if (!readme.includes(SNIPPET)) fail("README.md no longer contains SNIPPET verbatim — update one of them");
for (const [id, p] of Object.entries(STORE)) {
  if (!new RegExp(`"${id}":\\s*\\{ "x": ${p.x}, "y": +${p.y} \\}`).test(readme))
    fail(`README.md's store block no longer places "${id}" at (${p.x}, ${p.y}) — update one of them`);
}

let graph = parse(SNIPPET);
let positions = STORE;
const files = [["readme-v1.svg", toSvg(graph, positions, { title: "Auth flow" })]];
for (const step of STEPS) {
  const prev = positions;
  graph = applyOps(graph, step.ops);
  let warnings;
  ({ positions, warnings } = snap(graph, prev, step.directives));
  if (warnings.length > 0) fail(`${step.file}: unexpected warnings ${warnings.map((w) => w.code).join(", ")}`);
  for (const id of Object.keys(prev)) {
    if (JSON.stringify(positions[id]) !== JSON.stringify(prev[id]))
      fail(`${step.file}: frozen node "${id}" moved — the README's claim would be a lie`);
  }
  files.push([step.file, toSvg(graph, positions, { title: step.title })]);
}

for (const [name, svg] of files) {
  writeFileSync(new URL(name, OUT), svg);
  console.log(`wrote docs/assets/${name}`);
}
