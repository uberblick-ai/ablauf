// The demo page: the host-integration contract (docs/spec/layout-store.md)
// implemented literally, in vanilla DOM, over the library's own build output.
// No framework, no bundler, no CDN, no dependency of any kind — the only
// things this file reaches for are `../dist/` and the repo's own fixtures.
//
// The one rule worth reading the file for: a drag is ONE `at` directive
// through `snap`. The page never writes a coordinate of its own into the
// store — every coordinate that reaches it came out of `snap`, which is the
// only thing that keeps the store on the grid, in bounds and free of movable
// overlaps. It renders `result.positions` (the whole picture) and persists
// `result.writes` (only what changed): a keyed store must not be rewritten
// where it is already right (D27).
import { DARK_THEME, boxOf, jsonStore, parse, snap, svgMeta, toSvg } from "../dist/index.js";

const NAMES = ["auth", "deploy"];
// Must match test/render.test.ts: the goldens were rendered with these titles.
const TITLES = { auth: "Room auth flow", deploy: "Deploy pipeline" };
const $ = (id) => document.getElementById(id);
const text = async (url) => (await fetch(url)).text();

/**
 * The reader's colour scheme, which is the only input to which theme is drawn:
 * dark is a second render with a second palette, not an adaptive SVG
 * (`src/render/theme.ts`, D5/D21). Listening for `change` re-renders live, so a
 * host toggling its scheme never shows a stale palette — this page's own chrome
 * follows the same query in CSS (`index.html`).
 */
const dark = matchMedia("(prefers-color-scheme: dark)");

const seeds = JSON.parse(await text("../fixtures/spike/positions.json"));
const graphs = {};
for (const name of NAMES) graphs[name] = parse(await text(`../fixtures/text/${name}.mmd`));

let name = "auth";
let store = jsonStore();
let positions = {};
let meta = { originX: 0, originY: 0, width: 0, height: 0 };

/** Rendered pixel of every node: `store − origin` (D18). The freeze rule, felt. */
const pixels = () =>
  Object.entries(positions)
    .map(([id, p]) => `${id}@${p.x - meta.originX},${p.y - meta.originY}`)
    .sort();

const draw = (directives) => {
  const before = pixels();
  const graph = graphs[name];
  const result = snap(graph, store.snapshot(), directives);
  for (const [id, p] of Object.entries(result.writes)) store.set(id, p);
  positions = result.positions;
  const opts = { title: TITLES[name], debugGrid: $("grid").checked, ...(dark.matches ? { theme: DARK_THEME } : {}) };
  meta = svgMeta(graph, positions, opts);
  $("paper").innerHTML = toSvg(graph, positions, opts);
  $("warnings").textContent = result.warnings.length
    ? result.warnings.map((w) => `${w.code}: ${w.message}`).join("\n")
    : "no warnings";
  const moved = directives.map((d) => d.id);
  const others = pixels().filter((p) => !moved.includes(p.split("@")[0]));
  const stayed = others.filter((p) => before.includes(p)).length;
  $("freeze").textContent = directives.length
    ? `froze ${stayed}/${others.length} other nodes at the same rendered pixel`
    : "";
};

const seed = () => {
  const cold = $("cold").checked;
  store = jsonStore(cold ? null : { version: 1, nodes: seeds[name] });
  positions = {};
  draw([]);
};

// --- the drag ---------------------------------------------------------------

const chart = $("chart");
const ghost = $("ghost");
let drag = null;

const paper = () => $("paper").firstElementChild;

/**
 * Pointer → store, the only mapping a host must not re-derive by hand: the
 * SVG's own screen CTM, inverted, maps both axes through the real display
 * transform and lands in the SVG's user space — and the viewBox *starts* at
 * the origin, so that already **is** a store coordinate (D18). Nothing to add.
 */
const pointAt = (event) =>
  new DOMPoint(event.clientX, event.clientY).matrixTransform(paper().getScreenCTM().inverse());

/** The same transform the other way: store → CSS pixel inside `#chart`. */
const pixelAt = (x, y) => {
  const p = new DOMPoint(x, y).matrixTransform(paper().getScreenCTM());
  const rect = chart.getBoundingClientRect();
  return { x: p.x - rect.left, y: p.y - rect.top };
};

/** Which node is under the point. Reverse document order: last drawn is on top. */
const hit = (point) => {
  for (const node of [...graphs[name].nodes].reverse()) {
    const b = boxOf(node, positions[node.id]);
    if (point.x >= b.x && point.x <= b.x + b.w && point.y >= b.y && point.y <= b.y + b.h) {
      return { id: node.id, w: b.w, h: b.h };
    }
  }
  return null;
};

const moveGhost = (event) => {
  if (!drag) return;
  const p = pointAt(event);
  const cx = p.x - drag.dx;
  const cy = p.y - drag.dy;
  const a = pixelAt(cx - drag.w / 2, cy - drag.h / 2);
  const b = pixelAt(cx + drag.w / 2, cy + drag.h / 2);
  ghost.style.display = "block";
  ghost.style.left = `${a.x}px`;
  ghost.style.top = `${a.y}px`;
  ghost.style.width = `${b.x - a.x}px`;
  ghost.style.height = `${b.y - a.y}px`;
};

chart.addEventListener("pointerdown", (event) => {
  const point = pointAt(event);
  const found = hit(point);
  if (!found) return;
  const p = positions[found.id];
  drag = { ...found, dx: point.x - p.x, dy: point.y - p.y };
  chart.setPointerCapture(event.pointerId);
  moveGhost(event);
});

chart.addEventListener("pointermove", moveGhost);

chart.addEventListener("pointerup", (event) => {
  if (!drag) return;
  const point = pointAt(event);
  const at = { x: point.x - drag.dx, y: point.y - drag.dy };
  const { id } = drag;
  drag = null;
  ghost.style.display = "none";
  // The whole host contract, in one line.
  draw([{ id, at }]);
});

chart.addEventListener("pointercancel", () => {
  drag = null;
  ghost.style.display = "none";
});

// --- the in-browser golden assertion (D21) ----------------------------------
// The only check in this repo that runs on a non-V8 engine. It renders the
// fixture from its seed positions — not from the live store — so dragging
// never turns it red.

const checkGolden = async () => {
  const rows = [];
  for (const n of NAMES) {
    const want = await text(`../test/golden/${n}.svg`);
    const got = toSvg(graphs[n], seeds[n], { title: TITLES[n] });
    rows.push(`${n} ${got === want ? "PASS" : `FAIL (${got.length}b vs ${want.length}b)`}`);
  }
  const all = rows.every((r) => r.includes("PASS"));
  $("golden").textContent = rows.join(" · ");
  $("golden").className = all ? "pass" : "fail";
};

$("fixture").addEventListener("change", (event) => {
  name = event.target.value;
  seed();
});
$("cold").addEventListener("change", seed);
$("grid").addEventListener("change", () => draw([]));
// A re-render, not a reload: the store, the drag state and the golden row all
// survive a scheme change, because only the palette changed.
dark.addEventListener("change", () => draw([]));
$("reset").addEventListener("click", seed);

seed();
await checkGolden();
