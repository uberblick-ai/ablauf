// Regenerates the SVGs the README embeds (docs/assets/readme-*.svg) from the
// committed fixtures and the committed directive sets — nothing hand-drawn.
// Run after any renderer change: `pnpm build && node scripts/readme-images.mjs`,
// then commit the diff (or the absence of one).
//
// The images are the README's claim, demonstrated: three versions of the same
// chart (base → +leaf → +branch, the `auth-add-leaf` and `auth-add-branch`
// sets applied cumulatively). Successive versions are not byte-identical —
// the canvas grows, nodes appear — but every node that existed before is drawn
// at exactly the coordinates it had, which this script asserts before writing
// anything. An image that would contradict the README kills the run instead.
import { mkdirSync, writeFileSync } from "node:fs";
import { jsonStore, parse, snap, toSvg } from "../dist/index.js";
import { ROOT, TITLES, applyOps, read, readJson } from "./graph.mjs";

const OUT = new URL("docs/assets/", ROOT);
mkdirSync(OUT, { recursive: true });

const fail = (msg) => {
  console.error(`FAIL  ${msg}`);
  process.exit(1);
};

const sets = new Map(readJson("fixtures/acceptance/directives.json").sets.map((s) => [s.id, s]));
const steps = [sets.get("auth-add-leaf"), sets.get("auth-add-branch")];

let graph = parse(read("fixtures/text/auth.mmd"));
let positions = jsonStore({ version: 1, nodes: readJson("fixtures/spike/positions.json").auth }).snapshot();

const files = [["readme-auth.svg", toSvg(graph, positions, { title: TITLES.auth })]];
for (const set of steps) {
  const prev = positions;
  graph = applyOps(graph, set.ops);
  ({ positions } = snap(graph, prev, set.directives));
  for (const id of Object.keys(prev)) {
    if (JSON.stringify(positions[id]) !== JSON.stringify(prev[id]))
      fail(`${set.id}: frozen node "${id}" moved — the README's claim would be a lie`);
  }
  files.push([`readme-${set.id}.svg`, toSvg(graph, positions, { title: set.title })]);
}

for (const [name, svg] of files) {
  writeFileSync(new URL(name, OUT), svg);
  console.log(`wrote docs/assets/${name}`);
}
