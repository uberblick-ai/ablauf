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
from the boxes (D18). Near-edge decoration that outgrows that gutter splits by
what it is anchored to (owner, 2026-08-26): an **edge-label chip slides** — it
is clamped to start at the origin, keeping its size and carrying its text, so
no character is ever cut — while decoration anchored to a node's geometry
(a highlight ring, the outer half-stroke at `margin: 0`) cannot slide without
moving the node, so **whatever it reaches past the gutter is cropped**, and
that is the accepted boundary: at most the ring pad plus half the node stroke,
which is 8px at the default theme and scales with `nodeStrokeWidth` — cosmetic,
never text.

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

**D23. One endpoint per anchor; a diamond has one entry, at its top vertex, and
its exits leave through the others (owner, 2026-08-26).** Every node has four anchors — the side
midpoints, which on a decision node *are* its four vertices — and each edge
endpoint claims one, first come first served, in the order the next two
paragraphs fix. An endpoint prefers the side that best faces its counterpart: the dot
product of
the side's outward normal with the direction to the counterpart, scaled per
axis by the node's own extents, so a wide, short box keeps a top-down chart
flowing down rather than swinging out sideways. A **decision is the exception**
and scores unscaled, which is the flowchart convention the owner cited (one
entry on the top vertex, up to three exits, binary outcomes on opposite sides):
a branch whose target sits to the left leaves through the left vertex, to the
right through the right, straight below through the bottom. Assignment is
geometric and never label-based — sniffing `yes`/`no` was rejected, because the
positions are the user's (D4).

A side is only eligible when it is **clear** — the counterpart's centre is past
that side's plane — because the dumb router would otherwise reach a far-side
anchor by crossing the box from the inside and strand the arrowhead pointing
back out of it. A node therefore resolves its own endpoints **fewest options
first**, counting the clear sides, with declaration order breaking the tie: an
endpoint whose counterpart is straight above has exactly one side it can be
approached from at all, and resolving in text order alone lets a diagonal
neighbour that had a second choice take it first — which is how three arrows
into one node ended up two-on-the-top instead of on its left, top and right.
The loser of a contested anchor takes the nearest free one *by facing*, with an
exact tie going clockwise from the top; a blind clockwise scan is what the
scenario review rejected, since it sends `reject --> audit` in the `auth`
fixture around to the target's right side when its left one is free and facing.
When no clear side is free, the endpoint takes a share of its
best-facing side: `n` endpoints on one side sit at `1/(n+1) … n/(n+1)` along it
in declaration order, which is the midpoint when `n` is 1, and on a diamond the
fanned point slides along the slanted edge instead of hanging in the empty
corner beside it. The other four shapes keep their bounding box, which is never
more than a few px off the outline they draw.

Declaration order breaks a tie only between **equal preferences**, and never
hands the first-declared endpoint a better anchor than its mirror twin (owner,
2026-08-26). Two endpoints whose counterparts sit mirrored about the side they
both want face it exactly equally, and awarding it first-come drew the same
geometry as two different shapes: in the S2 scenario `b1 --> e` took `e`'s top
while `b2 --> e` was pushed onto its right, a mid-y dogleg and an L for two
sources placed symmetrically about `e`. Such a pair steps aside from the
contested anchor instead — each onto the mirrored side it ranks next — so the
anchor is left to an endpoint that has nowhere else to go, or to no one, and
the two routes come out as reflections of each other. A twin pair with no other
clear side steps aside from nothing and fans onto the shared side, which is
symmetric already. Only an *exact* mirror steps aside: every other contest is
settled by the resolution order above, and a third endpoint that does not
mirror can still claim an anchor between two that do — the symmetry is a
property of symmetric input, not something the router imposes.

A **decision node takes the single-entry rule** the owner cited, and it is the
one place two edges may be drawn as one line (owner, 2026-08-26). A diamond's
entry is its **top vertex**; every inbound edge routes to a **junction** on the
vertical above that vertex and then runs the trunk down into it, so two or more
inbounds arrive as one drawn line with a junction on it — a merge — instead of
fanning onto the diamond's slopes. The review case is S6: `retry --> route`
arrived at (454.7, 177.7), a fanned point on the upper-right slope, while
`--> svc3` left the lower-right one and the right *vertex* sat unused. The top
vertex is therefore held for the entry however many edges merge there, which
leaves the left, bottom and right vertices to the exits and puts the boundary
fan back where the convention wants it: only past three exits.

The junction is half a `MARGIN` above the vertex — the same step out of a box
D24's gutter and D25's loop take — and an entry reaches it under D23's ordinary
rules: the best-facing clear side of the junction, treated as a point, and then
the dogleg and the per-edge corridor of D26. Two entries that come in on the
*same* side of the junction would share the whole leg into it, which is a
doubled line and not a merge, so they nest: the *k*-th on a side steps its own
junction `k` half-`MARGIN`s up the vertical, and what they share is only the
trunk below it. That trunk is the **scoped exception** to "no two distinct edges
share a segment" (D26): the retrace detector exempts a shared run only when it
is vertical, on that diamond's own centre x, inside the band the junctions can
occupy, and between two edges into *that* diamond. Everything else, everywhere
else, is still a violation — a shared run into a node that is not a decision
included, which is pinned by its own test.

A junction has **three** ways in, not four. It sits above the top vertex, so an
entry arriving from underneath it has the whole diamond in the way, and D24's
gutter — whose stub steps back along that same normal — lands its last turn *on*
the vertex, which swallows the trunk and leaves a zero-length segment behind. So
an entry from **below** the diamond climbs to the junction beside it instead: its
own x picks left or right, an exact tie goes clockwise as everywhere else here,
and D24 is still asked the gutter question about that leg, which is what runs it
up half a `MARGIN` clear of the diamond's side. The junction distance is also a
**constant**, which fixes one boundary rather than searching: a source parked
closer than half a `MARGIN` above the diamond — which the snap pass never does,
`ROW` being 120, so only a drag can — gets a leg that steps back into its own box
by that difference. That degrades to ugly, never to scrambled (D7), and the merge
is still one line into one vertex.

Scope, deliberately: **decisions only** — merging into any other shape stays
distinct anchors, which is the S5/S7 rendering the owner approved. The entry
vertex is the top one because the charts are `TD`, and the renderer does not read
`graph.direction` at all; an `LR` chart mirroring this rule is a change to make
when `LR` layouts are real, not a guess to encode now. A **backward** inbound
keeps D24 for its leg up to the junction — the gutter question is asked about
that leg exactly as before, and only its far end moved — and a **self-loop** on a
diamond is not an entry at all and keeps D25. Nothing here avoids obstacles
either: the entry is out of the diamond's own slopes, which is why S6 stopped
crossing `route` and the acceptance branch set stopped crossing `mfa` and `rate`,
but that is a consequence, not a rule.

Determinism (D5/D21) comes from three fixed orders and nothing else: edges in
declaration order, sides in a clockwise list, and a resolution order that is a
count plus that declaration order. The entry junction adds no fourth either: its
distance is a constant, its side is the same preference test asked about a point,
and its nesting is that same declaration order counted per side — no search over
what is standing above it, which is also what keeps one unrelated source moving
from dragging the trunk and every merging edge with it. The step-aside pass adds no fifth: it walks
the same declaration order over pairs, and its test is exact equality between
two endpoints' scores — arithmetic on the stored coordinates, with no tolerance
and nothing measured. The snap pass writes integer centres (`src/geometry.ts`),
so a grid-placed mirror is always detected exactly; a host that stores sub-pixel
centres of its own gets the mirror only where the two differences come out
bit-identical, which is a boundary on the *symmetry*, never on determinism — the
same positions still draw the same picture everywhere. Nothing here avoids
obstacles — that stays deferred (below), and a fallback anchor can still route
across whatever happens to be in the way, except for the one edge class D24
names.

**D24. A backward edge whose corridor is occupied takes a gutter (owner-reviewed
scenarios, 2026-08-26).** The dogleg parks its corridor at the midpoint between
the two nodes and is blind to what is standing there: `fix --> push` in the
review's S4 scenario ran the width of the chart straight through `Unit tests`,
and where two endpoints' x-ranges overlap the corridor lands *inside both boxes*
and the arrow reads reversed. So: an edge is **backward** when its target's
centre is above its source's, and a backward edge whose dogleg would cross the
interior of any node box is re-routed through a gutter instead. Both ends first
step half a `MARGIN` out along their anchor's outward normal, so the route
leaves and arrives the way the arrowhead points; those two turn points fix the
**band**, the y-range the corridor spans, and every positioned box whose own
y-range meets that band — the source's and the target's included, since those
are exactly the ones a midpoint corridor lands inside — is what the corridor
clears: a vertical run at half a `MARGIN` beyond the rightmost of their right
edges, or beyond the leftmost of their left edges, whichever costs less
horizontal travel (`|g - sx| + |g - tx|`), an exact tie going right. The canvas
grows to hold it, because everything painted counts and edges now count too
(D9). Only a *backward* edge asks the question, so the gutter cannot silently
become the general router; and the gutter is taken only if it is itself clear,
so the rule can never make a chart worse than the dogleg already drew it.

What it deliberately does not do: it moves no node (D6), it re-chooses no anchor
(D23), it does not touch forward edges, and it searches nothing — one corridor
is computed and either taken or not. A backward edge boxed in on both sides has
no single corridor at any x and keeps its dogleg; two such edges exist in the
acceptance sets, pinned by name in `scripts/acceptance.mjs` so a regression
fails the gate and so does the day they start routing cleanly. Clearing them
needs a staircase, which is the obstacle-avoiding pass below. Determinism
(D5/D21) is the band's two turn points, a min and a max over the node boxes in
document order, and one comparison of two absolute differences — no search
order to depend on and no approximated math.

**D25. A self-loop is drawn as a loop outside its node (owner-reviewed
scenarios, 2026-08-26).** `a --> a` is valid mermaid and the parser takes it
(D12), but both of its ends land on the same box, where every anchor rule in
D23 degenerates: the counterpart *is* the node, so no side faces it and no side
is clear. The router drew the result as a line along the node's own top border
with the arrowhead buried in it — the mermaid-contract chart silently losing an
edge, which D4 does not allow. So a self-loop is routed by rule instead of by
geometry: the source end is aimed at the **right** side and the target end at
the **top**, each with that one side both best-facing and clear, and `claim`
then treats them like any other endpoint — the side when it is free, and a fan
along it (D23) when something claimed it first, which is also the only thing
that separates two self-loops on one node. Both ends step half a `MARGIN` out
along their own normal, exactly as D24's gutter does, and the loop turns at the
corner those two stubs meet at: half a `MARGIN` past the box's nearest corner,
the top-right one in the default pair. No segment enters the box, the arrowhead
arrives from outside onto the border, and the label lands on the outer run
because it is the longest segment — `w/2 + MARGIN/2` against the vertical run's
`h/2 + MARGIN/2`, and every node box is wider than it is tall (D5).

What it deliberately does not do: it asks D24's question not at all — a
self-loop is neither forward nor backward, has no corridor and no midpoint to
park one at — and it does not separate the *detours* of two self-loops on one
node, which share the outer corner and overlap along it. Their anchors differ,
so the routes do; spacing the detours as well needs a per-loop depth and is not
worth the rule. Determinism (D5/D21) is two constants and the anchors D23
already fixed: no search, no measurement, no approximated math.

**D26. One corridor per edge, in the target's fan order (owner, 2026-08-26).**
D23 makes the *attachment points* distinct; the corridor between them was still
chosen blind, at the midpoint of the gap, so two edges could be drawn one on top
of the other however far apart their anchors were. In the `deploy` fixture
`Report failure --> Notify author` and `Block release --> Notify author` leave
two boxes that are centred on the same x, so both doglegs ran down that one line
— 94.5px of it drawn twice — before splitting to their two fanned anchors, and a
trunk that forks reads as half a merge, which is exactly the merge rendering D23
was chosen against. Documenting the shared trunk as deliberate was rejected for
that reason.

So a **forward** edge's elbow sits at the target end's own fan fraction `f` of
the gap between the two anchors — `s + (t - s) · f`, on y for an upright pair
and on x for the mirrored one — instead of at its midpoint. `f` is D23's ladder
and nothing new: `1/(n+1) … n/(n+1)` for the `n` endpoints sharing a side, and
exactly `0.5` for every endpoint that has its side to itself. What that
guarantees is therefore small and exact: an **unfanned** edge keeps the midpoint
corridor the spike drew, so nothing outside a fan moves at all; and the edges
into **one fanned side** get nested corridors at that side's own fractions, in
declaration order, so they no longer share a run where they used to. `f` is
strictly between 0 and 1, so the elbow is strictly between the two anchors and
cannot leave the gap — the bound is the rule's own arithmetic, not a clamp.

It is a **heuristic, accepted as one** (owner, 2026-08-26): correct it when real
charts demand it, not before. Two limits are known and accepted. Stacked sources
into one target hold only while **declaration order matches vertical order** —
the corridors are laid out in the order the edges are written, so declaring the
lower source first hands it the shorter corridor and the two runs overlap again.
And **fan-out** is not separated at all: one fanned source into two targets
stacked in the same column still runs one corridor over the other, because the
fraction comes from the target's side and those are two different sides. Both
are the same missing input — the rule reads one edge's own two anchors and never
another edge — and both are for the obstacle-avoiding pass below, or for a later
correction against a real chart.

What it deliberately does not do: it moves no node (D6), re-chooses no anchor
(D23), and does not touch a **backward** edge, whose corridor is D24's — moving
that elbow would change which backward edges the gutter is asked about, and
that question is answered against the boxes rather than against the other
edges. It is not obstacle avoidance either: the corridors are separated from
each other, not from the boxes. The `deploy` edge above still crosses `Block
release` on its way down — it did before, at x=1030 through the middle of it —
and now turns its corner inside that box rather than below it, which is the
accepted price: an elbow cannot be kept out of a box by a rule that never looks
at one, and a chart reads worse with two edges drawn as one than with one edge
crossing a box it was already crossing. The retrace detector over both goldens
and all eight scenarios of the legibility ladder (`test/render.test.ts`) is a
**corpus pin, not a proof**: it fails the day one of those charts starts
drawing two edges as one, and it says nothing about the layouts above. It carries
exactly one exemption, and D23 scopes it: the trunk a decision's entries share
below their junctions is one line with a junction on it, not two lines drawn on
top of each other. Nothing else is exempt — a shared run into a node that is not
a decision is still a violation, and a test says so.
Determinism (D5/D21) is one multiply-add on a fraction D23 already fixed: no
search, no measurement, no approximated math.

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
- **Edge routing.** v1 keeps the spike's dogleg router, with the per-node
  anchor assignment of D23 in front of it, the backward-edge gutter of D24
  behind it, the self-loop of D25 beside it, and the per-edge corridor offset
  of D26 inside it. What those do not add up to
  is a router: a **forward** edge
  still runs wherever its corridor puts it, obstacles included — D26 separates
  the corridors from each other, never from the boxes; a
  backward edge gets exactly one alternative corridor and keeps its dogleg when
  that one is blocked too, so an edge boxed in on both sides still draws through
  a box; and nothing anywhere searches, backtracks, or bends an edge more than
  twice. If a real obstacle-avoiding pass is ever needed, the structure is
  draw.io's:
  layout for nodes, a separate orthogonal routing pass treating every node as
  an obstacle. Router choice carries a licence question under D15:
  `libavoid-js` is the best implementation and is LGPL-2.1, whose §6 relinking
  provisions are awkward-to-unsatisfiable for a bundled WASM artifact — so it
  is a distribution question and needs an explicit owner decision, not a
  shrug. An in-house A\*-visibility-grid router is the Excalidraw-style
  fallback.
- **Subgraphs / clusters.** Rejected by the parser in v1 (D12) rather than
  half-supported.
- **Theming past two presets.** What ships is a pair of complete token sets —
  `DEFAULT_THEME` and `DARK_THEME` — and the render-twice contract: colours are
  written literally into the SVG, so a consumer that wants light and dark
  renders once per theme and picks between the files (`prefers-color-scheme` in
  a `<picture>`, or the host passing the tokens it already knows). An adaptive
  `<style>` inside the SVG is not the mechanism: the output has to stay
  self-contained wherever it is dropped, and a tool that ignores the style block
  would silently pick the fallback palette (D5, D21). Everything past the pair —
  a theme API, a named-theme registry, palette derivation, per-node or per-edge
  style overrides, further presets — is wanted later and deliberately not
  designed now (owner, 2026-08-26). An agent that finds itself building a
  theming layer while editing `theme.ts` has left its issue's scope.
- **Canvas creation (drawing a chart from scratch on a canvas).** Nine
  person-years of prior evidence says buy, don't build; React Flow (MIT) if
  it ever becomes real.
- **The host product integration** — flowchart block type, `Y.Map`
  binding. ablauf ships the interface; the integration is written up as a
  proposal and handed to the host's side, argued there on its own terms.
