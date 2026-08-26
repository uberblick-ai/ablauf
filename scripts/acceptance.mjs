// The milestone-1 acceptance gate: the whole pipeline, from the committed text
// to the rendered bytes, with the safety properties asserted on the *rendered*
// result rather than only in unit tests (D5/D8/D17/D18).
//
// One run: parse the `.mmd` fixtures and the legibility scenario ladder (no
// JSON shortcut — this is the fresh-clone path), load the committed positions
// as a layout store, apply the
// committed directive sets from `fixtures/acceptance/directives.json` (hostile
// one included), render every result to SVG — twice, once per shipped theme,
// the dark twin under a `-dark` name — write it all to `out/acceptance/`
// with a `manifest.json` of sha256 hashes, and compare that against the last
// *successful* run's. CI runs this twice for exactly that reason. There is no
// PNG and no rasteriser (D20): the browser is the rasteriser when a human opens
// `gallery.html` — written every run, and deliberately not hashed.
//
// ## Reproducing a failure in ten seconds
//
// Uncomment the marked line below (`the deliberate break`) and re-run: it
// shoves one *frozen* node 40px in the snap pass's input, the run dies on the
// store-drift assertion naming that node (the rendered one catches it just as
// independently), and `manifest.json` is left untouched so the next run still
// has a real baseline. Everything else stays green — a frozen node moving is
// its own failure with its own message.
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { DARK_THEME, DEFAULT_THEME, MARGIN, boxOf, jsonStore, overlaps, parse, snap, toSvg } from "../dist/index.js";
import { FIXTURES, ROOT, TITLES, applyOps, read, readJson } from "./graph.mjs";
import { galleryHtml } from "./gallery.mjs";

const OUT = new URL("out/acceptance/", ROOT);
const MANIFEST = new URL("manifest.json", OUT);
const PREVIOUS = new URL("manifest.prev.json", OUT);
const CANDIDATE = new URL("manifest.next.json", OUT);

/** One line per assertion, and the first failure ends the run. */
const check = (ok, name, detail = "") => {
  console.log(`${ok ? "pass" : "FAIL"}  ${name}${detail && !ok ? `\n      ${detail}` : ""}`);
  if (!ok) process.exit(1);
};

const artifacts = new Map();
const emit = (name, text) => {
  artifacts.set(name, text);
  writeFileSync(new URL(name, OUT), text);
  return text;
};
const emitJson = (name, value) => emit(name, `${JSON.stringify(value, null, 2)}\n`);
/**
 * One picture, both shipped themes, both hashed: dark is a second render and
 * never an adaptive SVG (`src/render/theme.ts`, D5/D21), so the twin has to
 * carry its own bytes onto the drift gate. Every assertion below runs on the
 * light one — the goldens and the coordinate probes are written in its palette,
 * and the two renders differ in nothing but colour.
 */
const emitBoth = (name, graph, positions, opts) => {
  emit(`${name}-dark.svg`, toSvg(graph, positions, { ...opts, theme: DARK_THEME }));
  return emit(`${name}.svg`, toSvg(graph, positions, opts));
};
const sha256 = (text) => createHash("sha256").update(text, "utf8").digest("hex");
/** A warning's full identity: its code *and* the nodes it names (D7/D8). */
const identity = (w) => `${w.code}(${w.ids.join(",")})`;

/**
 * Where the renderer drew each node, **viewport-relative**: the text anchor
 * minus the root `viewBox` origin — the offset from the element's top-left
 * corner at natural size, which is what the eye measures. Store coordinates
 * would miss what D18 exists to prevent: an origin derived from content bounds
 * re-translating the whole picture at 0px store drift. Keyed by label, since
 * the renderer emits no id on a node's `<text>` (`src/render/svg.ts`).
 */
const nodeCoords = (svg) => {
  const [, ox, oy] = /^<svg [^>]*viewBox="(-?[\d.]+) (-?[\d.]+) /.exec(svg)?.map(Number) ?? [];
  if (!Number.isFinite(ox)) throw new Error("the rendered SVG has no root viewBox");
  const re = new RegExp(
    `<text x="([^"]+)" y="([^"]+)" text-anchor="middle" font-family="[^"]*" font-size="${DEFAULT_THEME.fontSize}" fill="[^"]*">([^<]*)</text>`,
    "g",
  );
  return new Map([...svg.matchAll(re)].map((m) => [m[3], [+m[1] - ox, +m[2] - oy]]));
};

/** Every edge's drawn polyline, in declaration order. `</defs>` cuts the markers off. */
const polylines = (svg) =>
  [...(svg.split("</defs>")[1] ?? "").matchAll(/<path d="([^"]+)"/g)].map((m) =>
    m[1].split(" ").map((p) => p.slice(1).split(",").map(Number)),
  );

/**
 * D24, on the rendered bytes: a **backward** edge — target above its source —
 * with a segment through the interior of any node box. Strict on all four
 * sides, since every anchor sits on a border.
 *
 * Deliberately still backward-only, though D24 now asks its question of forward
 * edges too: `KNOWN_BLOCKED` below is a *backward* set, pinned edge by edge
 * because a corridor exists for every one of these but two. A forward edge has
 * no such census — the boxes it can be blocked by are whatever the chart's own
 * columns hold — so the "no new edge-through-box" criterion is carried where a
 * list of names is not needed: the `crossings` assertions over the goldens and
 * the scenario ladder in `test/render.test.ts`.
 */
const backwardThroughBox = (graph, positions, svg) => {
  const boxes = graph.nodes.map((n) => [n.id, boxOf(n, positions[n.id])]);
  const lines = polylines(svg);
  const bad = [];
  graph.edges.forEach((e, i) => {
    if (positions[e.to].y >= positions[e.from].y) return;
    const line = lines[i] ?? [];
    for (let k = 0; k + 1 < line.length; k++) {
      const [ax, ay] = line[k];
      const [bx, by] = line[k + 1];
      for (const [id, b] of boxes) {
        const over =
          Math.min(ax, bx) < b.x + b.w &&
          Math.max(ax, bx) > b.x &&
          Math.min(ay, by) < b.y + b.h &&
          Math.max(ay, by) > b.y;
        if (over) bad.push(`${e.from}->${e.to} segment ${k} through ${id}`);
      }
    }
  });
  return bad;
};

/**
 * The two backward edges D24's corridor cannot clear, pinned exactly the way
 * `expectWarnings` pins a warning: a set that grows a crossing fails, and so
 * does one that loses these, which is the day the deferred router lands.
 *
 * Both are boxed in on *both* sides, so no single corridor exists at any x.
 * `verify --> rate` leaves through `verify`'s left anchor with `queue` in the
 * same row to its left, and the only corridor that would clear `queue` runs back
 * through `verify` itself, so the leg out and the leg in cannot be cleared by
 * the same one. Its *second* crossing is gone: `rate` is a decision with three
 * inbounds, so this edge now ends at `rate`'s entry junction (D23) and its
 * vertical run comes down well clear of `queue` instead of along its edge.
 * `notify --> stray` is the hostile set (D7: a bad directive set degrades to
 * ugly, never to scrambled): `stray` is min-clamped into the top-left corner and
 * entered through its right anchor, and `push` sits in that same row between
 * them. Clearing either needs a staircase, which is the obstacle-avoiding pass
 * this repo defers on purpose.
 */
const KNOWN_BLOCKED = {
  "auth-add-branch": ["verify->rate segment 0 through queue"],
  "deploy-hostile": [
    "notify->stray segment 0 through fail",
    "notify->stray segment 0 through block",
    "notify->stray segment 1 through push",
  ],
};

// --- the run ---------------------------------------------------------------

mkdirSync(OUT, { recursive: true });
// The baseline is the last *successful* run: read here, rotated only at the
// very end. Rotating it now would let a failing run destroy what the next run
// compares against, and "just run it again" would pass. `manifest.prev.json` is
// the fallback for a run interrupted between the two renames.
const baselineAt = existsSync(MANIFEST) ? MANIFEST : existsSync(PREVIOUS) ? PREVIOUS : null;
const previous = baselineAt === null ? null : JSON.parse(readFileSync(baselineAt, "utf8"));

// 1 + 2. Parse the committed text and load the committed positions as a store.
const stored = readJson("fixtures/spike/positions.json");
const base = new Map();
for (const name of FIXTURES) {
  const graph = parse(read(`fixtures/text/${name}.mmd`));
  const store = jsonStore({ version: 1, nodes: stored[name] });
  const svg = emitBoth(name, graph, store.snapshot(), { title: TITLES[name] });
  emitJson(`${name}.layout.json`, store.toJSON());
  check(
    svg === read(`test/golden/${name}.svg`),
    `${name}: rendered SVG is byte-identical to the committed golden`,
    `${sha256(svg)} vs ${sha256(read(`test/golden/${name}.svg`))}`,
  );
  const routed = backwardThroughBox(graph, store.snapshot(), svg);
  check(routed.length === 0, `${name}: no backward edge routed through a box (D24)`, routed.join(", "));
  base.set(name, { graph, store, svg });
}

// The legibility scenario ladder (`fixtures/scenarios/`): eight fixed charts of
// growing structural complexity, down the same parse → store → render → hash
// path as the two fixtures above and with no directives — they are charts, not
// snap sets. The one thing they skip is the golden comparison: the ladder
// exists to be *looked at* in the gallery when routing changes (D20), and the
// double run's manifest already pins it against silent drift.
for (const s of readJson("fixtures/scenarios/scenarios.json").scenarios) {
  const graph = parse(read(`fixtures/scenarios/${s.id}.mmd`));
  const store = jsonStore({ version: 1, nodes: s.positions });
  const svg = emitBoth(s.id, graph, store.snapshot(), { title: s.title });
  const routed = backwardThroughBox(graph, store.snapshot(), svg);
  check(routed.length === 0, `${s.id}: no backward edge routed through a box (D24)`, routed.join(", "));
}

// 3 + 4. The committed directive sets, hostile one included.
for (const set of readJson("fixtures/acceptance/directives.json").sets) {
  const { graph: baseGraph, store, svg: baseSvg } = base.get(set.fixture);
  const prev = store.snapshot();

  // --- the deliberate break (see the header) -------------------------------
  // if (set.id === "auth-add-leaf") prev.audit = { x: prev.audit.x + 40, y: prev.audit.y };

  const graph = applyOps(baseGraph, set.ops);
  const { positions, warnings } = snap(graph, prev, set.directives);
  const svg = emitBoth(set.id, graph, positions, { title: set.title });
  emitJson(`${set.id}.json`, { id: set.id, fixture: set.fixture, positions, warnings });

  // The hostile set's warnings are asserted, not ignored — and the clean sets
  // assert the absence of one just as strictly, so a set that grows a warning
  // fails too.
  const got = warnings.map(identity).sort();
  const want = [...set.expectWarnings].sort();
  check(
    got.join(" ") === want.join(" "),
    `${set.id}: warnings are exactly [${want.join(", ")}]`,
    `got [${got.join(", ")}]`,
  );

  // D6: the freeze rule in the *store*, first, so a stored position that moved
  // can never be mistaken for the viewport check below passing. The baseline is
  // the committed store, re-read rather than the `prev` handed to the pass —
  // tampering with that input has to show as drift.
  const named = new Set(set.directives.map((d) => d.id));
  const frozen = graph.nodes.filter((n) => prev[n.id] !== undefined && !named.has(n.id));
  const committed = store.snapshot();
  const moved = frozen
    .filter((n) => JSON.stringify(positions[n.id]) !== JSON.stringify(committed[n.id]))
    .map((n) => `${n.id}: stored ${JSON.stringify(positions[n.id])}, was ${JSON.stringify(committed[n.id])}`);
  check(moved.length === 0, `${set.id}: all ${frozen.length} frozen nodes byte-identical in the store`, moved.join("\n      "));

  // D6/D18: every pre-existing node at 0px drift, measured in the viewport, on
  // every set with no exception of any kind. There used to be one — a declared
  // (1, 0)px shift on `deploy-hostile`, where a min-clamped node's stroke
  // dragged the render origin to -1 — and both the declaration and the
  // mechanism that allowed it are gone with that fix (D18: the origin is
  // measured from node boxes). A shift here is a bug, not something to declare.
  const before = nodeCoords(baseSvg);
  const after = nodeCoords(svg);
  const drifted = frozen
    .map((n) => [n.id, before.get(n.label) ?? [], after.get(n.label) ?? []])
    .filter(([, b, a]) => a[0] !== b[0] || a[1] !== b[1])
    .map(([id, b, a]) => `${id}: drawn at ${a}, was ${b}`);
  check(
    drifted.length === 0,
    `${set.id}: all ${frozen.length} frozen nodes at 0px viewport drift in the rendered SVG`,
    drifted.join("\n      "),
  );

  // D17 scopes the geometry properties to movable nodes: two frozen boxes may
  // overlap and are emitted verbatim with a warning, which `expectWarnings`
  // above already pins.
  const movable = graph.nodes.filter((n) => named.has(n.id) || prev[n.id] === undefined);
  const boxes = new Map(graph.nodes.map((n) => [n.id, boxOf(n, positions[n.id])]));
  const hits = [];
  for (const n of movable) {
    for (const m of graph.nodes) {
      if (m.id !== n.id && overlaps(boxes.get(n.id), boxes.get(m.id))) hits.push(`${n.id} × ${m.id}`);
    }
  }
  check(hits.length === 0, `${set.id}: no movable node overlaps anything`, hits.join(", "));

  const escaped = movable
    .filter((n) => boxes.get(n.id).x < MARGIN || boxes.get(n.id).y < MARGIN)
    .map((n) => `${n.id} at ${JSON.stringify(positions[n.id])}`);
  check(escaped.length === 0, `${set.id}: every movable node inside the minimum bound`, escaped.join(", "));

  // D24: the corridor a backward edge takes has to be empty. The sets are where
  // this bites — a directive that lands a node in the old midpoint corridor is
  // exactly how the blind router drew a line through a box.
  const routed = backwardThroughBox(graph, positions, svg);
  const known = KNOWN_BLOCKED[set.id] ?? [];
  check(
    routed.join(" | ") === known.join(" | "),
    `${set.id}: backward edges through a box are exactly the ${known.length} known (D24)`,
    `got [${routed.join(", ")}]`,
  );
}

// 8. The gallery — written every run and uploaded with everything else, but
// deliberately **not** in the manifest: a *rendering of* the pipeline's output,
// not one of its artifacts, and hashing it would put a page of prose on the
// determinism gate's critical path. The SVGs and layout JSON behind it are
// hashed, and that is the claim CI makes.
writeFileSync(new URL("gallery.html", OUT), galleryHtml());

// 5 + 6. The candidate manifest, and the drift check against the baseline. It
// goes *beside* the baseline, never over it — see the rotation below.
const hashes = [...artifacts.keys()].sort().map((name) => [name, sha256(artifacts.get(name))]);
const manifest = { version: 1, artifacts: Object.fromEntries(hashes) };
writeFileSync(CANDIDATE, `${JSON.stringify(manifest, null, 2)}\n`);

if (previous === null) {
  const n = Object.keys(manifest.artifacts).length;
  console.log(`note  no previous manifest: wrote ${n} hashes. Run again — that run is the drift check.`);
} else {
  const names = [...new Set([...Object.keys(previous.artifacts ?? {}), ...Object.keys(manifest.artifacts)])].sort();
  const drift = names
    .filter((n) => previous.artifacts?.[n] !== manifest.artifacts[n])
    .map((n) => `${n}: ${previous.artifacts?.[n] ?? "(absent)"} -> ${manifest.artifacts[n] ?? "(absent)"}`);
  check(drift.length === 0, `no drift against the previous run (${names.length} artifacts)`, drift.join("\n      "));
}
// 7. Everything passed, so this run *becomes* the baseline — and only now.
if (existsSync(MANIFEST)) renameSync(MANIFEST, PREVIOUS);
renameSync(CANDIDATE, MANIFEST);

console.log(`\nacceptance: green — ${OUT.pathname}`);
