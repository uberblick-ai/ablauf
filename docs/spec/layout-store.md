# The ablauf layout store and snap pass

Normative for v1. Positions live outside the chart text, keyed by node id
([D4](../decisions.md)); this document says what a position is, what a host
implements to hold one, what a directive may ask for, and what the snap pass
guarantees no matter what it is asked.

The one rule everything else serves:

> **A node that already has a position and is not named by a directive is
> emitted verbatim.** Not clamped, not grid-snapped, not overlap-resolved. No
> exception.

That is the freeze rule ([D6](../decisions.md)). It is a property of the
pipeline, not of a model's good behaviour, which is why a drag, an agent edit,
or a hostile directive list can make a chart ugly and can never scramble it.

## Coordinates

A position is a node **centre**, in px, on a canvas whose origin is the
top-left. Positions the snap pass writes are integers on the grid; positions a
host stores may be anything finite, and are emitted as stored.

### Constants

| Name     | Value | Meaning                                                          |
| -------- | ----- | ---------------------------------------------------------------- |
| `GRID`   | 20    | movable centres are multiples of this on both axes                |
| `COL`    | 200   | one column step: `rel` steps and `cell` columns                   |
| `ROW`    | 120   | one row step: `rel` steps and `cell` rows                         |
| `PAD`    | 14    | clearance two boxes need before they count as clear               |
| `MARGIN` | 20    | the top-left gutter no movable node enters                        |

There is **no maximum bound** ([D9](../decisions.md)). The canvas is derived
from the content, so it grows; the overlap resolver can always search further
out, which is what removes the failure mode behind both of the spike's bugs.

### Node size

Size is a pure function of the label and the kind — no font metrics, no
measurement, no environment ([D5](../decisions.md)):

```
lines   = the label split on every mermaid line break — <br>, <br/> or <br />,
          in either ASCII case and with mermaid's internal whitespace, which is
          the regex /<br\s*\/?>/i and nothing else (format.md, "Line breaks",
          for what that set excludes); a label carrying no break is one line
longest = max over lines of line.length
grown   = (count of lines - 1) * 20
w       = min(250, max(120, round(longest * 8.4) + 36))
decision → { w: w + 44, h: 74 + grown }
otherwise → { w, h: 56 + grown }
```

A line's length is UTF-16 code units. A leading, trailing or repeated break
makes an empty line, counted like any other. These numbers are part of the
determinism contract, not a tuning knob: changing them changes which charts
collide.

Because a broken label is taller, a relabel that adds a break grows a frozen
node's box around a centre that does not move — which is the second half of
[D17](../decisions.md), and reported rather than resolved like any other
frozen overlap.

A node's box is centred on its position: `x = cx - w/2`, `y = cy - h/2`. Two
boxes **overlap** when they are closer than `PAD` on both axes:

```
a.x - pad < b.x + b.w  &&  a.x + a.w + pad > b.x  &&
a.y - pad < b.y + b.h  &&  a.y + a.h + pad > b.y
```

## The store

```json
{ "version": 1, "nodes": { "check": { "x": 380, "y": 170 } } }
```

The interface a host implements — over a `Map`, a `Y.Map`, a row in a
database, whatever it already has:

```ts
interface LayoutStore {
  get(id: string): Position | undefined;
  set(id: string, p: Position): void;
  delete(id: string): void;
  entries(): [string, Position][]; // sorted by id, code-unit order
  snapshot(): Record<string, Position>; // unordered lookup table
}
```

`entries` is sorted by id in code-unit order and is **the ordered surface**, so
no consumer can depend on insertion order and get a different picture on
another replica ([D21](../decisions.md)). `snapshot` is a plain `Record` and
carries **no order**: a JS object enumerates integer-like keys (`"2"`, `"10"`)
numerically however they were defined, and such ids can reach a store as
orphans. Anything that iterates positions iterates `entries` — or sorts the
keys itself; `snapshot` is a lookup table, and it is what `snap` takes as
`prev`, which reads it by id. The JSON binding drops entries that are not a finite
`{x, y}` pair when it loads a document, rather than carrying a non-place into
the geometry.

**Orphans** — ids the store has a position for that the chart has no node for
— are **kept**. Deleting a node and re-adding it under the same id puts it back
where it was. The snap pass reports them as `orphan` warnings and never removes
them; `pruneOrphans(store, graph)` removes them, and nothing calls it
implicitly. Renaming an id is not a rename: it declares a new node and orphans
the old id's position ([D12](../decisions.md)).

## Directives

Four forms, one per node, all keyed by node id ([D7](../decisions.md)):

```ts
{ id, rel: { of: string, dir: Dir, steps?: number } }  // steps default 1
{ id, delta: { dx: number, dy: number } }
{ id, cell: { col: number, row: number } }
{ id, at: { x: number, y: number } }                   // pixel escape hatch
```

`Dir` is one of `above`, `above-left`, `above-right`, `below`, `below-left`,
`below-right`, `left`, `right`, `up`, `down`; `up` and `down` alias `above` and
`below`.

- `rel` is `steps` multiples of `COL`/`ROW` off the anchor's centre. The anchor
  may be any node this pass has already placed, including another node this
  same pass is placing — chains resolve iteratively.
- `delta` moves a node from its **previous** position.
- `cell` is the coarse grid: `x = COL/2 + col*COL`, `y = ROW/2 + row*ROW`.
- `at` is a pixel point. It exists because the coarse vocabulary provably
  cannot express some correct answers, and because a drag is a pixel event.

**Order rules** ([D19](../decisions.md)):

- Duplicate directives for one id: **last one wins**, with a
  `duplicate-directive` warning.
- The directive list's order is otherwise **not significant**. Movable nodes
  are resolved in graph document order, so two nodes claiming the same spot
  settle by document order, not by who was listed first.

## The freeze rule, exactly

- A node is **frozen** iff it has a position in the store **and** no directive
  names it. Frozen coordinates are emitted verbatim.
- A node is **movable** iff a directive names it, or it has no position in the
  store. Movable nodes are the only ones the pass may write.
- A directive naming an id the chart has no node for is ignored, with an
  `unknown-node` warning.
- A directive that is malformed still **names** its node, so that node is
  movable; its request falls back to its previous position if it has one, and
  to the placement rule if it does not.
- A new node with no directive is placed by the fallback rule: one row below
  its first placed parent, else one row above its first placed child, else the
  origin cell — then snapped, clamped and resolved like any other movable node.

### Frozen overlaps are preserved

Two frozen boxes may overlap: positions that already overlapped in the store,
or a relabel growing a box around its fixed centre. Both are emitted verbatim
and reported with a `frozen-overlap` warning naming both ids. They are never
resolved ([D17](../decisions.md)) — the freeze rule outranks beauty. A frozen
position whose box enters the gutter — `x < MARGIN + w/2` or `y < MARGIN + h/2`,
the geometric bound, not the grid-rounded one movable nodes clamp to — is
likewise emitted as stored, with a `frozen-out-of-bounds` warning.

## The snap pass

```ts
snap(graph, prev, directives): { positions, writes, warnings }
```

`prev` is the store's snapshot. The pass **never throws for bad input**: an
unusable directive produces a warning and a safe layout. It throws only when
one of its own invariants is broken — no free position within the search
bound, or a graph node it failed to place.

Per movable node, in graph document order:

1. **Resolve** the directive, iteratively, so a directive can chain off another
   node this same pass is placing. An anchor chain that never resolves (a
   cycle, or an anchor that is not a node) is a warning and falls through to
   the fallback rule.
2. **Snap** to `GRID`.
3. **Clamp to the minimum only**: `x >= MARGIN + w/2`, `y >= MARGIN + h/2`,
   rounded up to the grid. There is no maximum. The clamp applies to every
   movable node, not only to the ones that collide.
4. **Resolve overlaps** to the nearest free grid position, by increasing
   distance from the requested point, with a fixed candidate order inside each
   distance and no randomness ([D19](../decisions.md)). Candidates that break
   the minimum bound are skipped, never clamped, so the resolver can never
   trade an overlap for an escape.

A movable node may never be placed overlapping any other node.

### `positions` and `writes`

Two different jobs, and conflating them is a bug a host cannot see locally
([D27](../decisions.md)):

- **`positions`** is **every** graph node's centre — the whole picture, and
  what a host renders. It is complete on every call, whatever changed.
- **`writes`** is the **minimal set to persist**: exactly the graph nodes whose
  entry in `prev` is absent, is not a finite point, or differs numerically on
  either axis from the emitted position. Nothing else is in it.

A node that was already stored at the position it is emitted at is **not** in
`writes` — whether it was frozen, or a directive happened to resolve back to
the coordinate it already had. Orphans and ids the chart has no node for are
never in `writes` either; it is keyed by graph node, in graph document order.

The reason is storage that merges per key. Rewriting a node whose stored
coordinate is already correct is a competing write, and in a CRDT store a
competing write can defeat a concurrent drag of that node on another replica —
measured, two Yjs replicas, one drag lost. `writes` is therefore the safe write
set, computed once here rather than rediscovered by every host.

This does not soften the freeze rule. A frozen node is emitted verbatim in
`positions`; it is absent from `writes` because the store already holds exactly
that coordinate. Same fact, said twice.

### Warnings

| Code                   | Means                                                                     |
| ---------------------- | ------------------------------------------------------------------------- |
| `orphan`               | the store holds a position for an id the chart has no node for; kept       |
| `invalid-position`     | a store entry is not a finite point; its node counts as unplaced           |
| `unknown-node`         | a directive names an id the chart has no node for; ignored                 |
| `duplicate-directive`  | more than one directive for one id; the last one won                       |
| `invalid-directive`    | a directive is malformed or unusable; the node was auto-placed             |
| `unresolvable-anchor`  | a `rel` chain never resolves; the node was auto-placed                     |
| `min-clamped`          | a movable node was moved out of the top-left gutter                        |
| `displaced`            | a movable node's requested point was occupied; it took the nearest free    |
| `frozen-overlap`       | two frozen boxes overlap; both emitted verbatim (D17)                      |
| `frozen-out-of-bounds` | a frozen position is outside the minimum bound; emitted as stored          |

Warnings are data: branch on `code`, read `ids`, show `message`.

## The four properties

These are the claims the snap pass is tested against, for arbitrary graphs,
arbitrary previous positions and arbitrary directive lists — including
malformed directives, unknown ids, absurd coordinates, cyclic `rel` chains and
hundreds of directives at once ([D8](../decisions.md)):

1. **Frozen nodes never move.** Every node that is frozen per the rule above
   has a byte-identical position in the output. No exceptions, no tolerance.
2. **No movable overlaps.** No movable node's box in the output overlaps any
   other node's box, counting `PAD`. Frozen↔frozen overlaps are preserved and
   reported (D17).
3. **Movable nodes never escape.** Every movable output position satisfies the
   minimum bound. A frozen position below the bound is emitted verbatim, with a
   warning.
4. **Determinism.** The same `(graph, prev, directives)` produces a deep-equal
   result on repeated calls, and permuting the directive list does not change
   the outcome except through the last-one-wins rule for duplicate ids.

### Determinism ban list

Nothing in the core may use `Math.random`, the clock, `localeCompare`, `Intl`,
`toLocaleString`, or the implementation-approximated `Math` functions
(`hypot`, `pow`, `sin`, `cos`, `atan2`, `exp`, `log`). Two replicas are two
browser engines, not one machine run twice ([D21](../decisions.md)). Sort by
code unit; compare squared integer lengths. A test greps the whole of `src/`
for these and fails the build on any of them.

## The host-integration contract

What a host implements, and all it implements ([D22](../decisions.md)):

1. **Parse the block text** into a `Graph` (`parse`, see
   [format.md](format.md)).
2. **Implement `LayoutStore`** over your storage — about five lines over a
   `Map`, about fifteen over a `Y.Map`. The core ships `jsonStore` for plain
   hosts and never imports a host SDK.
3. **A drag is one call:**

   ```ts
   const { positions, writes, warnings } = snap(graph, store.snapshot(), [{ id, at: point }]);
   render(positions);
   for (const [id, p] of Object.entries(writes)) store.set(id, p);
   ```

   The human and the agent go through the identical validation path. A drop
   onto an occupied spot resolves nearest-free from the drop point; a drop out
   of bounds is min-clamped, with a warning. **Hosts never write coordinates
   into the store directly** — every coordinate that reaches the store came out
   of `snap`, which is the only thing that keeps the store on the grid, in
   bounds and free of movable overlaps.

   **Render `positions`; persist `writes`.** Looping the full `positions` into
   the store is what a keyed CRDT store cannot afford ([D27](../decisions.md)):
   it rewrites nodes that did not change, and one of those redundant writes can
   land on top of another replica's concurrent drag. For a single-writer store
   the two loops reach the same document; for a shared one they do not.

A host that renders is also holding the SVG↔store transform; the renderer
exposes its origin and dimensions so nothing re-derives it by hand
([D18](../decisions.md)).
