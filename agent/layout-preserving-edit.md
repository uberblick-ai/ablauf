---
name: layout-preserving-edit
description: Change the meaning of an ablauf flowchart (mermaid-subset text plus a JSON layout store) without disturbing its layout. Use whenever you edit a chart whose node positions live outside the text.
---

# Layout-preserving edit

A chart is two things: **text** carrying the meaning (a strict
mermaid-flowchart subset) and a **layout store** carrying the geometry, keyed
by node id. You edit the text and you emit *directives*; `snap` is the only
thing that ever writes a position. Never put coordinates in the text, and
never write a coordinate you computed yourself into the store.

The rule that makes this safe: **a node that has a position and is not named
by a directive is emitted verbatim** — not nudged, not re-snapped, not
re-laid-out. So the worst a bad directive set can do is make one corner ugly.

Everything below uses this chart and this store. Positions are node *centres*
in px; origin top-left, x right, y down.

```
flowchart TD
  start([Request arrives]) --> check{Valid token?}
  check -->|no| reject[401 Unauthorized]
  check -->|yes| rate{Rate limited?}
  rate -->|yes| queue[Queue request]
  rate -->|no| allow[Open room]
  queue --> allow
  allow --> audit[Write audit log]
  reject --> audit
  audit --> done([Done])
```

```json
{ "version": 1, "nodes": {
  "start":  { "x": 380, "y": 60  }, "check": { "x": 380, "y": 170 },
  "reject": { "x": 140, "y": 300 }, "rate":  { "x": 380, "y": 300 },
  "queue":  { "x": 680, "y": 420 }, "allow": { "x": 380, "y": 540 },
  "audit":  { "x": 380, "y": 660 }, "done":  { "x": 380, "y": 770 } } }
```

## The procedure

1. **Read both** — the text and the store.
2. **Make the semantic change in the text**, leaving the ids of untouched
   nodes untouched: an id *is* the layout key, so renaming `check` to
   `validate` declares a new node and orphans the old position. Changing a
   *label* (`check{Valid token?}` → `check{Token valid?}`) is free — same id,
   same place.
3. **Emit directives for new or deliberately moved nodes only**, one per node,
   keyed by id. **Emitting `[]` is a valid and often the correct answer**: a
   relabel needs none, and an edge added between two placed nodes needs none.
   If you added no node and decided to move none, emit nothing.
4. **Run `snap` and read its warnings.** `snap(graph, store.snapshot(),
   directives)` returns `{ positions, warnings }`. Warnings are data — branch
   on `code`, read `ids`, show `message`. `displaced`, `min-clamped`,
   `unknown-node`, `invalid-directive` and `unresolvable-anchor` each mean your
   request was not honoured as written: revise and run again.
5. **Escalate only if the warnings and the positions leave you unsure** — they
   usually do not; positions plus labels tell you what is where. If a picture
   would settle it *and* your host can display images, render the SVG and
   look. Rasterisation is a host capability: never a precondition for this
   procedure, and never a reason to refuse the edit.

Then write back exactly what `snap` returned.

## The four directive forms

`snap` accepts these and nothing else. Every result below is real output.

**`rel` — column/row steps off an anchor.** One step is 200px across, 120px
down; `dir` is `above`/`below`/`left`/`right`, a diagonal like `below-right`,
or the `up`/`down` aliases; `steps` defaults to 1. The anchor may be a node
this same pass is placing, so chains work.

Text edit: `queue -->|full| retry[Retry later]`, then `retry --> allow`.

```json
[{ "id": "retry", "rel": { "of": "queue", "dir": "right" } }]
```
→ `retry` at `{ "x": 880, "y": 420 }`, no warnings.

**`delta` — move a node from its previous position.** For deliberate nudges of
nodes that already have a place.

```json
[{ "id": "queue", "delta": { "dx": -80, "dy": 0 } }]
```
→ `queue` `680,420` → `{ "x": 600, "y": 420 }`, no warnings; nothing else moved.

**`cell` — the coarse grid**, `x = 100 + col*200`, `y = 60 + row*120`.

```json
[{ "id": "metrics", "cell": { "col": 4, "row": 3 } }]
```
→ `metrics` at `{ "x": 900, "y": 420 }`, no warnings.

**`at` — a pixel point.** The escape hatch, and what a human drag produces.

```json
[{ "id": "mfa", "at": { "x": 640, "y": 180 } }]
```
→ `mfa` at `{ "x": 640, "y": 180 }`, no warnings.

## Three ways this goes wrong

**A new node lands on top of an existing one.** Adding an MFA branch off
`check` by reaching for the obvious step:

```json
[{ "id": "mfa", "rel": { "of": "check", "dir": "below-right" } },
 { "id": "challenge", "rel": { "of": "mfa", "dir": "below" } }]
```
```json
[{ "code": "displaced", "ids": ["mfa"],
  "message": "(580, 300) was occupied; \"mfa\" moved to the nearest free cell (600, 300)" },
 { "code": "displaced", "ids": ["challenge"],
  "message": "(600, 420) was occupied; \"challenge\" moved to the nearest free cell (600, 500)" }]
```
Nothing was scrambled — `rate` and `queue` did not move — but you did not get
what you asked for. `displaced` is the cue to pick a real spot.

**The coarse vocabulary cannot express the right answer.** Here the free column
is around `x = 640`: `rel` off `check` offers only 180/380/580, `cell` only
100/300/500/700, and `delta` needs a previous position, which a new node has
not got. That is what `at` is for. Use it instead of fighting the grid.

**A directive names a label instead of an id.** The id is the left-hand token
in the text (`mfa`), never the text inside the brackets.

```json
[{ "id": "MFA required?", "cell": { "col": 3, "row": 1 } }]
```
```json
[{ "code": "unknown-node", "ids": ["MFA required?"],
  "message": "directive for \"MFA required?\" ignored: the chart has no such node" }]
```
The directive is dropped and the node auto-placed as if you had said nothing.
When a directive seems to have had no effect, check this first.

## What you cannot break

`snap` never throws on bad input; it warns and returns a safe layout. It
always refuses to move a **frozen** node (one with a position that no
directive names), to place a movable node **overlapping** anything, and to
place a movable node in **negative space** — there is a minimum bound at the
top-left (`min-clamped`) and no maximum, because the canvas grows.

**Frozen overlaps are the exception, and they are legal.** Box width is a
function of the label, so a relabel can grow a box across a neighbour with
nothing having moved. Relabelling `rate{Rate limited?}` to
`rate{Rate limited for this tenant?}`, no directives:

```json
[{ "code": "frozen-overlap", "ids": ["reject", "rate"],
  "message": "\"reject\" and \"rate\" overlap; both are frozen, so both are left where they are" }]
```
Both stay exactly where they were: the freeze rule outranking beauty, not a
failure. Leaving it is defensible. If it is worth fixing, the fix is a
directive deliberately naming one of the pair —

```json
[{ "id": "reject", "delta": { "dx": -20, "dy": 0 } }]
```
→ `reject` `140,300` → `{ "x": 120, "y": 300 }`, no warnings.

Two warnings you may see without having caused them: `orphan` (the store holds
a position for an id the chart has no node for — kept, in case the node comes
back) and `invalid-position` (a store entry that is not a finite point).

## One edit, end to end

**Before**: the chart and store at the top of this file. **The change**: an MFA
branch between `check` and `rate`.

```
flowchart TD
  start([Request arrives]) --> check{Valid token?}
  check -->|no| reject[401 Unauthorized]
  check -->|yes| mfa{MFA required?}
  mfa -->|yes| challenge[Send challenge]
  mfa -->|no| rate{Rate limited?}
  challenge --> verify[Verify code]
  verify --> rate
  rate -->|yes| queue[Queue request]
  rate -->|no| allow[Open room]
  queue --> allow
  allow --> audit[Write audit log]
  reject --> audit
  audit --> done([Done])
```

Three new ids — `mfa`, `challenge`, `verify` — and every other id byte-identical,
so every other node is frozen. The stepwise attempt above came back `displaced`
twice, so: put the head of the branch in the free column at `x = 640` with
`at`, chain the rest off it with `rel`, and move `queue` out of the branch's
way with `delta` — a deliberate choice, not a requirement.

```json
[{ "id": "mfa", "at": { "x": 640, "y": 180 } },
 { "id": "challenge", "rel": { "of": "mfa", "dir": "below" } },
 { "id": "verify", "rel": { "of": "challenge", "dir": "below" } },
 { "id": "queue", "delta": { "dx": 200, "dy": 0 } }]
```

**Warnings**: `[]`. **After** — write this back verbatim:

```json
{ "version": 1, "nodes": {
  "start":     { "x": 380, "y": 60  }, "check":  { "x": 380, "y": 170 },
  "reject":    { "x": 140, "y": 300 }, "mfa":    { "x": 640, "y": 180 },
  "challenge": { "x": 640, "y": 300 }, "rate":   { "x": 380, "y": 300 },
  "verify":    { "x": 640, "y": 420 }, "queue":  { "x": 880, "y": 420 },
  "allow":     { "x": 380, "y": 540 }, "audit":  { "x": 380, "y": 660 },
  "done":      { "x": 380, "y": 770 } } }
```

Four nodes named, three of them new; `queue` moved because you said so, and
every other node sits where it did, to the pixel.
