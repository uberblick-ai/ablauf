# ablauf — decisions

The standing status quo, not a diary: each entry says what was decided and
why, and is edited in place when it changes. Issues carry implementation
detail only and cite this file; they never restate it.

## Where this project came from

Spun out of uberblick, a local-first CRDT document system where humans and
AI agents co-edit the same documents. ablauf will plug into it as a
flowchart block type; it must not depend on it. Three independent design
reviews and one measurement spike (2026-08) shaped everything below; the
load-bearing findings are recorded in the entries themselves, and the
spike's fixtures live on as this repo's test seeds (`fixtures/spike/`).

## Killed, with reasons

**D1. Auto-layout around pinned nodes with elkjs — impossible, not merely
hard.** ELK's `INTERACTIVE` strategies read coordinates as *ordering* hints;
the maintainer's answer to this exact request is "No, this is not possible"
(elkjs#212, ELK#1037, open since 2017). In JS only `cytoscape-fcose` and
`d3-force` honor exact pins, and neither draws a layered flowchart; D2's TALA
is the one engine that bridges both and is proprietary. Consequence: ablauf
has no layout engine at all in v1. Positions come from the store, from
directives, or from a deterministic fallback rule.

**D2. Layout hints as `%% @pos` comments inside the block text — retracted
design.** LikeC4 shipped it and removed it in v1.44.0 for "broken or
distorted diagrams". In a CRDT host it is worse: `editBlock` gates on
whole-block text equality, so a drag that rewrites a hint line invalidates
every in-flight agent edit to that block (probed against the host
product's real block-edit schema). An LLM regenerating the block also destroys or orphans the hints
silently. `%% @pos` survives as an **export** format only.

**D3. `%% @via` edge waypoints — unimplementable as specified.** It keyed an
edge by its target node id; a merge point (two edges into one target) makes
that key ambiguous by construction, and mermaid edges have no identity
unless the author opts into `e1@-->` syntax. Out of v1 entirely.

## The v1 shape

**D4. Semantics in the text, layout in a store, keyed by stable node id.**
The only design that survived every review. The text stays a strict
mermaid-flowchart subset so it renders anywhere; positions live outside it —
a JSON sidecar for plain hosts, a `Y.Map` in a CRDT host. ablauf **never
rewrites the user's semantic text** to store geometry: that is what keeps a
drag from colliding with a concurrent agent edit.

**D5. Rendering is deterministic, and that is a hard requirement.** Two CRDT
replicas rendering the same document must produce the same picture, byte for
byte. No randomness, no clock, no font measurement, no iteration over
unordered structures; node size is a documented pure function of label and
shape. This is what disqualifies force layouts at render time.

**D6. Freeze by pipeline, not by model behaviour.** A node whose id already
has a position keeps it *verbatim* unless a directive names it. Preservation
is therefore a property of the code, not something a model has to remember.
The spike measured this: freezing gives 0px drift on unchanged nodes across
12 mutations, and a frontier vision model scores identically — its only real
contribution is where *new* nodes go.

**D7. Coarse directives + a deterministic snap pass, not absolute
coordinates.** Whoever changes the meaning emits directives for new or
explicitly-moved nodes only (`rel` / `delta` / `cell` / `at`); the snap pass
turns them into coordinates, snaps to grid, rejects unknown ids, and resolves
overlaps. Unmentioned nodes cannot move, so a bad directive set degrades to
*ugly*, never to *scrambled*. Absolute-coordinate mode was measured as equally
accurate at the frontier and structurally unsafe: it re-asserts every
coordinate on every call, with no validator between model and canvas.

**D8. The snap pass is the safety-critical component.** The spike found two
bugs in its prototype, both of the same shape: overlap resolution trading an
overlap for an off-canvas node. It gets the hardest tests in the repo —
property-style checks that no directive sequence can move a frozen node,
overlap two boxes, or escape bounds.

**D9. The canvas grows; it is never clamped.** Half the spike's awkward
placements were its fixed canvas. The rendered canvas is derived from the
content bounding box plus a margin, so "bounds" means only "no negative
space": movable nodes are clamped to a minimum x/y, never a maximum. This
also removes the failure mode behind both snap-pass bugs — the overlap
resolver can always search further out. Width and height grow with everything
*painted* — stroke extents, highlight rings and edge-label chips included — so
nothing is clipped on the far edge, while on the near edge the `MARGIN` gutter
absorbs the half-stroke a box paints outside itself and the origin is measured
from the boxes (D18).

**D10. No runtime intelligence in the library (owner, 2026-08-25).** v1 is
contracts plus enablement: formats, safety code, rendering, and the
"layout-preserving edit" procedure as plain markdown that the user's own LLM
session follows. Zero model dependencies, zero API keys, zero inference cost.
(The standalone-vs-in-tree question is settled separately and honestly in
D22 — removing model dependencies was never the objection to standalone.)

**D11. What the model would have added, measured.** For the record, since it
justifies D6/D7/D10: a frontier vision model preserved layout perfectly (0px
drift, 12/12 scenarios) and placed new nodes better than the 50-line
fallback rule. Locally, `gemma3:4b` failed the controls badly (moved frozen
nodes up to 611px, stacked new nodes on old ones); `qwen3.8` (27B) passed
every control at 0px but needs ~76s with thinking on, ~8.5s with it off and
fallback-grade placement. So: preservation is free from the pipeline,
placement is the only thing worth a model call, and a slow or mediocre
provider is harmless under D6 — worst case, one awkward node.

**D17. Frozen overlaps are preserved, never resolved.** The freeze rule
outranks beauty. Two frozen boxes can overlap — positions already overlapping
in the store, or a relabel growing a box around a fixed centre (size is a
function of the label, D5) — and the pass emits both verbatim with a
`frozen-overlap` warning. The safety properties are therefore scoped to
movable nodes: no **movable** node may overlap anything, escape the minimum
bound, or displace another node. The absolute version ("no two boxes ever
overlap") is unsatisfiable under D6, and a property test written that way
gets "fixed" by weakening the freeze rule or its test generator — the one
failure this project cannot afford, disguised as green CI.

**D18. The render origin is stable; the canvas grows right and down only.**
Deriving the SVG origin from content bounds re-translates the whole picture
whenever the extreme node changes: deleting the leftmost node in the `auth`
fixture shifts every remaining node 230px on screen at 0px store drift — the
exact complaint this project exists to prevent, invisible to every
store-drift gate. So the origin is fixed, and it is measured from the node
**boxes** — geometry, not ink: the viewBox starts at
`(min(0, minBoxX - margin), min(0, minBoxY - margin))` — `(0, 0)` in every
normal case, and exactly because movable nodes are min-clamped to that same
bound; only a frozen node carried below it extends the origin, with a warning.
Measuring the origin from painted extents instead reintroduces the complaint
one pixel at a time: a clamped box's stroke reaches into the gutter, the origin
follows it to -1, and the whole picture moves right at 0px store drift. The
gutter is what holds that stroke; the far edge still grows with painted ink —
D9 stands. `toSvg` exposes its origin and dimensions so
hosts never re-derive the SVG↔store transform by hand.

**D19. Overlap resolution is nearest-free, and order rules are explicit.** A
movable node that would overlap resolves to the nearest free grid position by
increasing distance from its requested point, with a fixed candidate order
per distance ring — never randomised. Right/down-first search is out: it
turns a drop onto a neighbour into a 200px directional shove away from where
the user aimed. Order semantics, decided: duplicate directives for one id —
last one wins, with a warning; directive-list order is otherwise not
significant, because movable nodes are resolved in graph document order, so
two nodes claiming the same spot settle by document order, not list order.

## Grammar and format boundaries (v1)

**D12. Strict subset, loud errors.** Supported: the `flowchart`/`graph`
header with `TD|TB|LR|RL|BT`; five node shapes (`[]` process, `()` rounded,
`([])` stadium, `{}` decision, `(())` circle); edges `-->`, `---`, `-.->`,
`==>` with labels in both mermaid spellings (`A -- yes --> B`, `A -->|yes| B`);
chains (`A --> B --> C`); `&` groups, expanded to one edge per pair; `%%`
comments, skipped. Rejected with a precise, actionable error naming the
construct and the line: `subgraph`, `style`/`classDef`/`class`/`linkStyle`,
`click`, `%%{init}%%`, and any shape outside the five. Node ids match
`[A-Za-z_][A-Za-z0-9_-]*` and are the layout key, so a rename is a new node.

**D13. Round-trip is semantic, not byte-for-byte.** Parsing normalises: the
serializer emits one edge per line in the `|label|` spelling and expands `&`
groups. That is safe because of D4 — ablauf only serializes for export and
for programmatic construction, never to write back over a human's source.

## Toolchain and process

**D14. Single package, `tsc` build, no bundler.** One export, `.` — adapter
subpaths return when adapters do (D22). Core has zero runtime dependencies.
Toolchain: mise-pinned node 26 + pnpm 10, biome lint-only, vitest,
TypeScript strict.

**D15. The licence bar is distribution, not a specific licence (owner,
2026-08-25).** The test a dependency has to pass is that it places no
restriction on distributing this library or anything built with it. MIT and
comparable permissive licences are fine; so is a file-level copyleft licence
that never reaches a distributed artifact. What is disqualified is anything
that constrains distribution — source-available and commercial-key licences
(tldraw, D2's TALA), and licences whose linking terms are unsatisfiable for a
bundled artifact (see the router note under "Deliberately deferred"). Every
dependency names its licence in the PR that adds it.

Under that bar, v1's dev-only dependency is settled: `fast-check` (MIT) for
the snap-pass property tests — a devDependency, not shipped. `@resvg/resvg-js`
(MPL-2.0) was briefly slated for rasterising the acceptance demo and is
removed together with the rasteriser itself (D20). ablauf itself is MIT.

**D20. SVG-only; there is no rasteriser anywhere.** `@resvg/resvg-js` is
removed. PNG existed to feed a vision model, and v1 has no model in the loop
(D10); its hashes were machine-local (system fonts) — a gate that could not
fail meaningfully. Rasterisation is a host capability: an agent whose host
can display images renders the SVG there; the enablement pack phrases
"render and look" as an escalation for hosts that can, never a precondition.

**D21. Determinism means every engine, and the ban list says so.** D5's
replicas are browsers — V8, JavaScriptCore, SpiderMonkey — not one node
build, so a same-machine double-run gate cannot prove the claim by itself.
Banned in `src/` alongside `Math.random` and `Date`: `localeCompare`, `Intl`,
`toLocaleString`, and implementation-approximated `Math` (`hypot`, `pow`,
`sin`, `cos`, `atan2`, `exp`, `log`). Sort by code unit; compare squared
integer lengths. Enforced by a grep check in CI, plus one golden-SVG
assertion that runs in a real browser (the demo page, D22). Note: D12's id
regex excludes integer-like keys, which is what keeps store object key order
insertion-stable — relaxing it is a determinism question, not just a grammar
question.

**D16. Issue → branch → PR, CI-gated.** Replaces "direct commits to main are
fine", which was an escape hatch from the parent project's own process
applied to its least-understood code. See `CLAUDE.md`.

**D22. Adapters wait; the demo page is v1's consumer.** The Tiptap and React
adapters leave v1: what genuinely needs validation there (ProseMirror
transactions, `Y.Map` timing under concurrent edits) is only provable inside
the host product, and building the rest here blind repeats the prose-contract
mistake that killed the first charter. What *is* provable here — the
drag → `at` directive → snap → re-render loop, the SVG↔store transform, the
drop feel (D19), cold start — is exercised by a ~100-line dependency-free
`demo/index.html`, shipped alongside the acceptance gallery and carrying the
in-browser golden assertion (D21). This also restates D10's standalone
rationale honestly: ablauf is standalone because the owner wants a small open
package; the in-tree-first objection (API before consumer) is answered by the
demo page and a written host-integration proposal, not by zero dependencies.

## Deliberately deferred

- **The Tiptap and React adapters** — deferred to the host integration per
  D22. The layout-store spec documents the host
  contract they implement; the demo page proves it runs.
- **Edge routing.** v1 keeps the spike's dogleg router. If a real
  obstacle-avoiding pass is ever needed, the structure is draw.io's:
  layout for nodes, a separate orthogonal routing pass treating every node as
  an obstacle. Router choice carries a licence question under D15:
  `libavoid-js` is the best implementation and is LGPL-2.1, whose §6 relinking
  provisions are awkward-to-unsatisfiable for a bundled WASM artifact — so it
  is a distribution question and needs an explicit owner decision, not a
  shrug. An in-house A\*-visibility-grid router is the Excalidraw-style
  fallback.
- **Subgraphs / clusters.** Rejected by the parser in v1 (D12) rather than
  half-supported.
- **Canvas creation (drawing a chart from scratch on a canvas).** Nine
  person-years of prior evidence says buy, don't build; React Flow (MIT) if
  it ever becomes real.
- **The host product integration** — flowchart block type, `Y.Map`
  binding. ablauf ships the interface; the integration is written up as a
  proposal and handed to the host's side, argued there on its own terms.
