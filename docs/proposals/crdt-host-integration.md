# Integrating ablauf into a CRDT host

**Status:** the reference write-up for a host that wants ablauf diagrams a human
can arrange and an agent can edit, in a collaboratively edited document
([`../decisions.md`](../decisions.md), D22 and "Deliberately deferred").
**Written:** 2026-08-26, from a real integration against a Yjs + Tiptap host.

ablauf is text plus positions in, SVG out. A host renders the diagram source it
already stores, and keeps node positions somewhere the source never sees. What
follows is what that costs, and the four ways it goes wrong — each of which was
found by building it, not by reasoning about it.

Written for a host built on **Yjs and Tiptap**, because that is where it was
measured. The shape generalises to any CRDT host; the specific failure modes in
§3 and §7 are Yjs's, and a host on another CRDT should expect its own.

## 1. What a host needs

Four moving parts, and only the third is more than a few lines:

- **A block whose text is diagram source.** Most document schemas already have
  one — a fenced code block, a `mermaid` block, whatever holds source text
  rather than prose. ablauf does not need a new block type, and adding one is a
  bigger change than the integration itself.
- **A node view that renders.** Parse the block's text, render, put the SVG in
  the view. It must be inert content: not editable, its events stopped before
  they reach the editor, and — in ProseMirror terms — `ignoreMutation` set, so
  the render is never read back as a document change.
- **Somewhere to keep positions.** §3, which is the whole design question.
- **A drag that goes through the snap pass.** §5.

ablauf imports no host SDK — no yjs, no tiptap, no react — and has zero runtime
dependencies, so none of this adds a transitive tree.

**The coordinate transform is an identity.** ablauf's rendered `viewBox` *starts*
at the store origin, so a coordinate in the SVG's own user space already is a
store coordinate (D18). Pointer → store is the SVG's inverted screen CTM and
nothing else; there is no offset to add and a host that adds one has a bug.

## 2. The objection worth answering first

A host whose document model is "the text is the only representation" will have
ruled out rendering diagrams for that reason, and it is the right instinct. It
does not apply here, for two reasons worth stating explicitly before the work
starts:

- **The SVG is derived, never stored.** ablauf renders from the text on every
  paint. There is no cached picture and nothing to fall out of sync; deleting
  the render changes nothing about the document. The text remains the only
  representation of the diagram's *meaning*.
- **Positions are not a representation of the text.** They are information the
  text has never carried and — by ablauf's central design decision — must never
  carry (D4/D2). Storing them is not duplicating the block.

If a host disagrees, the honest consequence is a read-only render and no
dragging. Worth settling before building the store, not after.

## 3. Where positions live

The load-bearing question, and the one with a measured answer.

Assume the host has a **per-block content revision** — a hash of the block's
text and attributes, handed to a caller so it can detect that the block changed
under it. Most collaborative document systems with an agent-facing API have one.
Whatever the layout store is, **the revision must not cover it**: a drag that
changed the revision would invalidate every in-flight edit an agent had prepared
against that block.

| Option | Verdict |
|---|---|
| Positions in the block text (`%% @pos` comments) | **Rejected.** Changes the text, so every drag changes the revision and invalidates prepared edits — and rewrites the block for every collaborator. This is ablauf D2, and it is why `%% @pos` is an export format only. |
| Positions as a JSON blob in one block attribute | **Rejected.** Measured: a whole-blob write means two people dragging *different* nodes resolve last-write-wins and one drag is silently lost. |
| A CRDT map keyed by node id | **Recommended**, with the caveat below. |

So: a map keyed by node id, living outside the document's text structure —
alongside it, not inside it. Positions merge per node, and the block revision
never moves.

### The two ways the map still loses data

Both measured against Yjs 13.6.32, two documents synced by update exchange.
Neither is obvious and both cost a node or a drag:

**Write only what changed.** Writing back ablauf's full `positions` on every
drop rewrites unchanged nodes, and those rewrites compete with a concurrent drag
of those nodes on another replica:

| Both replicas write the full position set | `n1` moved, **`n2`'s drag lost** |
| :-- | :-- |
| **Each writes only the node that changed** | **both survive** |

`snap` returns a minimal write set for exactly this reason: **render from
`positions`, persist only `writes`.** A frozen node emitted unchanged is never
in `writes`, so the safe thing is the easy thing.

**Materialising a per-block map is a parent-key write.** If the store is nested
— a map of blocks, each holding a map of nodes — then the first write to a block
that has no layout yet *creates* the inner map, and two replicas doing that
concurrently conflict on the outer key: one inner map is discarded, with
everything in it.

| Two replicas write different nodes, both starting from an empty layout | only one node survives |
| :-- | :-- |

That path runs once per block, so a test seeded from an existing document never
sees it. Two ways out, and a host should pick deliberately:

- **A flat composite key** (`"blockId/nodeId"` → position) has no parent-key
  creation step, so the failure cannot occur. Harder to get wrong.
- **A nested map**, if the host wants per-block grouping, with a stated
  first-materialisation protocol — and a test that starts two replicas from an
  empty layout, not from a seeded one.

Neither the key shape nor the first-materialisation protocol is ablauf's to
choose; it hands over `writes` and never learns what the storage looks like.

**Two tests, before claiming concurrent drags survive.** Both states a real
document passes through, and reading the code proves neither:

1. **An already-materialised layout.** The block's positions exist on both
   replicas. A drags one node, B drags another, no sync in between; after sync,
   both drags are present. This is the case persisting only `writes` fixes.
2. **Two replicas from an empty layout.** Neither replica has any layout for the
   block yet; both drag a node, both materialise the layout, then sync. Both
   nodes must survive. This is the case a nested map does not give you for free,
   and the one a seeded fixture never reaches.

Passing (1) while skipping (2) is exactly how a lost node ships.

**Orphans.** ablauf keeps positions for ids the chart no longer contains, on
purpose: delete a node, re-add it under the same id, and it returns to where it
was. `snap` reports them as `orphan` warnings and never removes them;
`pruneOrphans(store, graph)` is explicit and nothing calls it implicitly. Most
hosts should never call it — the cost is a few bytes and the benefit is that an
undo puts the node back.

## 4. The binding

`LayoutStore` is five members over whatever the host already has:

```ts
import type { LayoutStore, Position } from "@uberblick/ablauf";

export const crdtLayoutStore = (nodes: CrdtMap): LayoutStore => {
  const read = (id: string): Position | undefined => {
    const p = nodes.get(id);
    if (p === undefined) return undefined;
    const [x, y] = [p.get("x"), p.get("y")];
    // A half-written entry is not a place: drop it rather than let NaN reach
    // the geometry, which is what ablauf's own `jsonStore` does on load.
    return typeof x === "number" && typeof y === "number" && Number.isFinite(x) && Number.isFinite(y)
      ? { x, y }
      : undefined;
  };
  return {
    get: read,
    set: (id, p) => nodes.set(id, p),          // inside one transaction — §5
    delete: (id) => nodes.delete(id),
    // Sorted by id, code-unit order: `<`/`>`, never `localeCompare`.
    entries: () => {
      const out: [string, Position][] = [];
      for (const id of [...nodes.keys()].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))) {
        const p = read(id);
        if (p !== undefined) out.push([id, p]);
      }
      return out;
    },
    snapshot: () => Object.fromEntries(
      [...nodes.keys()].flatMap((id) => {
        const p = read(id);
        return p === undefined ? [] : [[id, p] as const];
      }),
    ),
  };
};
```

Two contract details worth not discovering later
([`../spec/layout-store.md`](../spec/layout-store.md)):

- **`entries()` must be sorted by id in code-unit order.** It is the ordered
  surface; sorting it is what stops two replicas rendering different pictures
  from the same data (D21). Sort with `<`/`>`, not `localeCompare` — ablauf bans
  `localeCompare` and `Intl` in its own source for the same reason, and a host
  that reintroduces them reintroduces the bug.
- **`snapshot()` carries no order** and is a lookup table only. It is what
  `snap` takes as `prev`.

## 5. The drag loop

One directive, one call, and the host never invents a coordinate:

```ts
const { positions, writes, warnings } = snap(graph, store.snapshot(), [{ id, at: point }]);
transact(() => {
  for (const [nodeId, p] of Object.entries(writes)) store.set(nodeId, p);
});
render(positions);
```

- **Hosts never write coordinates directly.** Writing back what `snap` returned
  is the only thing that keeps the store on the grid, in bounds, and free of
  overlaps between movable nodes — and it is the identical validation path an
  agent's directives take, which is the point.
- **Render from `positions`, persist `writes`** — §3, and the difference between
  a concurrent drag surviving and not.
- **One transaction per drop**, so the whole drop is one undo step and one sync
  message rather than one per node.
- **`warnings` are worth surfacing** at least in development: `min-clamped`,
  `displaced`, `orphan`, `unknown-node` each name the ids they concern.
- `demo/demo.js` in this repo is the entire loop in vanilla DOM, including the
  pointer transform — the fastest way to read the contract is to read that file.

## 6. Degrading on the source ablauf does not speak

ablauf parses a **strict subset** of mermaid flowchart and rejects the rest
loudly rather than half-supporting it: other diagram families, and flowcharts
using `subgraph`, raise `ParseError` (D12). So the node view must be additive,
never a replacement:

```ts
try {
  graph = parse(block.text);             // ablauf view: SVG, drag, positions
} catch (e) {
  if (e instanceof ParseError) { /* the host's existing source view, unchanged */ }
}
```

Every block that renders today keeps rendering exactly as it does today; only
blocks ablauf fully understands gain a picture. Catch `ParseError` precisely, not
with a bare `catch` — otherwise a real bug looks like an unsupported diagram.

This also means the integration can ship before any grammar question is settled,
and widen later without a migration.

## 7. Undo, which is easy to miss

If the host's undo is scoped to its document structure — as it is by default in
y-prosemirror, whose `yUndoPlugin()` builds an `UndoManager` over the editor's
fragment alone — then **a layout store outside that structure is not in the undo
stack, and a drag is not undoable.**

The fix is small but must be deliberate: construct the undo manager over both
scopes, and check that whatever excludes remote changes from a local undo still
does. It is invisible until the first drag and awkward to retrofit, so it
belongs in the same change as the store rather than the one that adds dragging.

## 8. What ablauf will not do

Stated plainly so the boundary is not rediscovered in review:

- **No host SDK, ever.** ablauf will not import yjs, tiptap or react. An adapter,
  if one is ever wanted, lives on the host side or in a separate package; this
  core stays text-plus-positions in, SVG out.
- **No layout engine.** Positions come from the store, from directives, or from
  a deterministic fallback. Nothing auto-arranges a chart.
- **The grammar subset is deliberately narrow**, because "renders as valid
  mermaid elsewhere" is a promise to keep.
- **Edge routing has a documented ceiling.** The router is a dogleg with anchor
  assignment, a backward-edge gutter, per-edge corridors and an in-column forward
  gutter. A general obstacle-avoiding pass is deferred, so an edge boxed in on
  both sides can still cross a box. It degrades to *ugly*, never to *wrong*.

## 9. Suggested sequencing

Each step is separately useful and separately shippable:

1. **Read-only render.** Node view renders the SVG for parseable blocks, the
   existing source view for the rest. No store, no drag, no schema change. This
   alone answers whether §2 was decided correctly.
2. **The layout store**, its binding, and the undo scope (§3, §7).
3. **Drag** (§5).
4. **The agent surface.** Directives over whatever API agents use, so an agent
   that adds a node can say where it goes — the `rel`/`delta`/`cell`/`at`
   vocabulary in [`../spec/layout-store.md`](../spec/layout-store.md), and the
   written procedure in
   [`../../agent/layout-preserving-edit.md`](../../agent/layout-preserving-edit.md).
