// The milestone-1 acceptance gate: the whole pipeline, from the committed text
// to the rendered bytes, with the safety properties asserted on the *rendered*
// result rather than only in unit tests (D5/D8/D17/D18).
//
// One run: parse the `.mmd` fixtures (no JSON shortcut — this is the
// fresh-clone path), load the committed positions as a layout store, apply the
// committed directive sets from `fixtures/acceptance/directives.json` (hostile
// one included), render every result to SVG, write it all to `out/acceptance/`
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
import { DEFAULT_THEME, MARGIN, boxOf, jsonStore, overlaps, parse, snap, toSvg } from "../dist/index.js";
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
  const svg = emit(`${name}.svg`, toSvg(graph, store.snapshot(), { title: TITLES[name] }));
  emitJson(`${name}.layout.json`, store.toJSON());
  check(
    svg === read(`test/golden/${name}.svg`),
    `${name}: rendered SVG is byte-identical to the committed golden`,
    `${sha256(svg)} vs ${sha256(read(`test/golden/${name}.svg`))}`,
  );
  base.set(name, { graph, store, svg });
}

// 3 + 4. The committed directive sets, hostile one included.
for (const set of readJson("fixtures/acceptance/directives.json").sets) {
  const { graph: baseGraph, store, svg: baseSvg } = base.get(set.fixture);
  const prev = store.snapshot();

  // --- the deliberate break (see the header) -------------------------------
  // if (set.id === "auth-add-leaf") prev.audit = { x: prev.audit.x + 40, y: prev.audit.y };

  const graph = applyOps(baseGraph, set.ops);
  const { positions, warnings } = snap(graph, prev, set.directives);
  const svg = emit(`${set.id}.svg`, toSvg(graph, positions, { title: set.title }));
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
