# Integrating ablauf into uberblick

**Status:** proposal, for uberblick to accept, amend or reject on its own terms
([`../decisions.md`](../decisions.md), D22 and "Deliberately deferred").
**Written:** 2026-08-26, against `uberblick-2` at `fb28e38`.

ablauf renders the `mermaid` blocks uberblick already has, and makes their nodes
draggable, without a new block type and without a second representation of the
block's text. What it needs from uberblick is one place to keep node positions —
and one decision reversed.

Everything below that describes uberblick was read from the repo and cites the
file, so the host side can check it rather than take it on trust.

## 1. What already fits

Four things make this smaller than the "flowchart block type" that ablauf's own
decision log anticipated:

- **The block type exists.** `mermaid` is already in `BLOCK_TYPES`
  (`packages/schema/src/types.ts`), classed as source text rather than prose, so
  it carries only the `comment` anchor and no inline marks. That is exactly the
  class a diagram source belongs to. **No schema change to the block vocabulary
  is needed.**
- **The NodeView pattern exists.** `Mermaid` is a Tiptap v3 `Node` with
  `addNodeView() { return sourceBlockView(mermaidChrome) }`
  (`packages/web/src/editor/nodes.ts`), and `source-chrome.ts` already shows the
  house style for chrome that is `contenteditable="false"`, stops its own
  events, and uses `ignoreMutation` so ProseMirror does not read its DOM back as
  a document change. An ablauf view is the same shape with an SVG in it.
- **ablauf imports nothing host-specific**, ever — no yjs, no tiptap, no react
  (ablauf `CLAUDE.md`, Hard rules). It is zero-dependency and ships types plus
  functions. Nothing here asks uberblick to take on a transitive dependency.
- **The coordinate transform is an identity.** ablauf's rendered `viewBox`
  *starts* at the store origin, so a coordinate in the SVG's own user space
  already is a store coordinate (ablauf D18). Pointer → store is
  `getScreenCTM().inverse()` and nothing else.

## 2. The decision uberblick has to make

The `Mermaid` node says, in as many words:

> A live mermaid renderer is explicitly out of scope: rendering the diagram
> would mean a second representation of the block's text, and the whole point of
> the model is that the Y.XmlText is the only representation.

That is the right instinct and this proposal asks to reverse it for the narrow
case, because the premise does not hold for ablauf:

- **The SVG is derived, never stored.** ablauf renders from the text on every
  paint; there is no cached picture, no parallel model, nothing to fall out of
  sync. Deleting the render changes nothing about the document. The Y.XmlText
  remains the only representation of the diagram's *meaning*.
- **Positions are not a representation of the text.** They are information the
  text has never carried and — by ablauf's central design decision — must never
  carry (ablauf D4/D2). Storing them is not duplicating the block; it is
  recording something new about it, in a place the block's own revision hash
  does not see (§3).
- **The failure mode the rule guards against is real and ablauf shares it.**
  This is precisely why ablauf refuses to write `%% @pos` hints into the source:
  a drag that rewrites the block text would invalidate every in-flight agent
  edit. uberblick's rule and ablauf's D2 are the same rule.

If uberblick disagrees, the honest consequence is that the integration is a
read-only render at most, and dragging is off the table — worth saying now
rather than after the work.

## 3. Where the layout store lives

This is the load-bearing design question, and uberblick's own code settles it.

A block's `rev` is a hash of **type + text + type-specific attributes**
(`packages/schema/src/rev.ts`, `RevInput`), and it is the optimistic-concurrency
token an agent holds across a read-then-edit. Marks are deliberately excluded so
that annotating a block does not invalidate a prepared edit. Layout has to be
excluded for exactly the same reason: **a drag must not invalidate an agent's
in-flight edit.**

That rules out two of the three candidates:

| Option | Verdict |
|---|---|
| Positions in the block text (`%% @pos`) | **Rejected.** Changes `text`, so every drag changes `rev` and invalidates in-flight edits. Also rewrites the block for every collaborator. This is ablauf D2, now confirmed against uberblick's real implementation. |
| Positions as a JSON string in a block attribute | **Rejected.** Attributes are compared verbatim as strings (`nodes.ts`: `equalAttrs` and `updateYFragment` use `!==`, which is why `level` is a string). A whole-blob attribute means two people dragging *different* nodes concurrently resolve last-write-wins and one drag is lost — a data-shaped flaw in a CRDT system. It would also have to be either inside `RevInput` (reintroducing the invalidation problem) or conspicuously outside it. |
| A fourth top-level `Y.Map` | **Recommended.** |

A document is currently one Y.Doc with exactly three top-level types — meta,
the blocks `Y.XmlFragment`, and the annotations `Y.Map`
(`packages/schema/src/doc.ts`). The proposal is a fourth:

```
layout: Y.Map< blockId , Y.Map< nodeId , { x, y } > >
```

- **Concurrent drags of different nodes both survive** — the merge is per node
  id, which is the whole reason to use a `Y.Map` rather than a blob.
- **`rev` never moves**, so agent edits and human drags do not fight.
- **It mirrors a pattern uberblick already has**: annotations are plain JSON in
  a top-level `Y.Map` keyed by id (`packages/schema/src/annotations.ts`).
- **Positions stay outside the text**, satisfying ablauf D4 without ablauf
  knowing anything about Yjs.

This *is* a `packages/schema` change, so it lands in uberblick's stricter gate
lane (its `CLAUDE.md` requires a Codex round for `packages/schema`). That is
appropriate for a new top-level document type.

**Orphans.** ablauf keeps positions for ids the chart no longer contains, on
purpose: delete a node and re-add it under the same id and it returns to where
it was. `snap` reports them as `orphan` warnings and never removes them;
`pruneOrphans(store, graph)` is explicit and nothing calls it implicitly. A host
should decide when — if ever — it prunes, most likely never, since the cost is a
few bytes and the benefit is that an undo puts the node back in place.

## 4. The binding

ablauf's `LayoutStore` is five members. The spec estimates "about fifteen
lines over a `Y.Map`", which is true of the binding itself; the version below is
longer because it validates what it reads, and a shared document is exactly
where that earns its keep:

```ts
import type { LayoutStore, Position } from "ablauf";

/** One block's node positions. `blockLayout` is `layout.get(blockId)`. */
export const yLayoutStore = (blockLayout: Y.Map<Y.Map<number>>): LayoutStore => {
  const read = (id: string): Position | undefined => {
    const p = blockLayout.get(id);
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
    set: (id, p) => {
      const m = new Y.Map<number>();
      m.set("x", p.x);
      m.set("y", p.y);
      blockLayout.set(id, m);              // inside one transaction — see §5
    },
    delete: (id) => blockLayout.delete(id),
    // Sorted by id, code-unit order: `<`/`>`, never `localeCompare`.
    entries: () => {
      const out: [string, Position][] = [];
      for (const id of [...blockLayout.keys()].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))) {
        const p = read(id);
        if (p !== undefined) out.push([id, p]);
      }
      return out;
    },
    snapshot: () => Object.fromEntries(
      [...blockLayout.keys()].flatMap((id) => {
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
  from the same data (ablauf D21). Sort with `<`/`>`, not `localeCompare` —
  ablauf bans `localeCompare` and `Intl` in its own source for the same reason,
  and a host that reintroduces them reintroduces the bug.
- **`snapshot()` carries no order** and is a lookup table only. It is what
  `snap` takes as `prev`.

## 5. The drag loop

One directive, one call, and the host never invents a coordinate:

```ts
const { positions, warnings } = snap(graph, store.snapshot(), [{ id, at: point }]);
ydoc.transact(() => {
  for (const [nodeId, p] of Object.entries(positions)) store.set(nodeId, p);
});
```

- **Hosts never write coordinates directly.** Writing back what `snap` returned
  is the only thing that keeps the store on the grid, in bounds, and free of
  movable overlaps — and it is the same validation path an agent's directives
  take, which is the point.
- **One `ydoc.transact`** per drop, so the whole drop is one undo step and one
  sync message rather than one per node.
- **`warnings` are worth surfacing** at least in development: `min-clamped`,
  `displaced`, `orphan`, `unknown-node` each name the ids they concern.
- `demo/demo.js` in this repo is the entire loop in 175 lines of vanilla DOM,
  including the pointer transform — the fastest way to read the contract is to
  read that file.

## 6. Degrading on the mermaid ablauf does not speak

ablauf parses a **strict subset** of mermaid flowchart, and rejects the rest
loudly rather than half-supporting it: `sequenceDiagram`, `subgraph` and the
other diagram families raise `ParseError` (ablauf D12; the owner's standing
decision as of 2026-08-26 is to keep subgraphs rejected and revisit after this
integration).

So the node view must be additive, never a replacement:

```ts
try {
  graph = parse(node.textContent);       // ablauf view: SVG, drag, positions
} catch (e) {
  if (e instanceof ParseError) { /* today's source view, unchanged */ }
}
```

Every mermaid block that renders today keeps rendering exactly as it does today.
Only blocks ablauf fully understands gain a picture. This also means the
integration can ship before the grammar question is settled, and widen later
without a migration.

## 7. The sharp edge: undo

`yUndoPlugin()` is installed with no arguments
(`packages/web/src/editor/collaboration.ts`), so its `Y.UndoManager` is scoped
to the ProseMirror fragment alone — and the keymap deliberately routes `Mod-z`
to the Yjs manager because "undoing a ProseMirror step would revert remote
changes interleaved with local ones".

**A layout `Y.Map` outside that fragment is therefore not in the undo stack: a
drag would not be undoable with Cmd-Z.** For a direct-manipulation gesture that
is a poor result and users will report it as a bug.

The fix is small but must be deliberate: construct the `UndoManager` over both
scopes and hand it to the plugin —

```ts
const undoManager = new Y.UndoManager([fragment, layoutMap], { trackedOrigins });
yUndoPlugin({ undoManager });
```

— which needs care about `trackedOrigins` so that remote drags are not undone by
a local Cmd-Z. This is uberblick's call and its code; it is flagged here because
it is invisible until the first drag and awkward to retrofit.

## 8. What ablauf will not do

Stated plainly so the boundary is not rediscovered in review:

- **No host SDK, ever.** ablauf will not import yjs, tiptap or react. The
  adapter — if one is ever wanted — lives on the host side or in a separate
  package; this repo's core stays text-plus-positions in, SVG out.
- **No layout engine.** Positions come from the store, from directives, or from
  a deterministic fallback. Nothing auto-arranges a chart.
- **The grammar subset is fixed for now.** Widening it is a Tier 3 decision in
  ablauf precisely because "renders as valid mermaid elsewhere" is a promise to
  keep.
- **Edge routing has a documented ceiling.** The router is a dogleg with anchor
  assignment, a backward-edge gutter, per-edge corridors, and an in-column
  forward gutter. A general obstacle-avoiding pass is deferred on an unresolved
  licence question, so an edge boxed in on both sides can still cross a box. It
  degrades to *ugly*, never to *wrong*.

## 9. Suggested sequencing

Each step is separately useful and separately shippable:

1. **Read-only render.** Node view renders the SVG for parseable blocks, source
   view for the rest. No schema change, no store, no drag. This alone answers
   whether the rendering decision in §2 was right.
2. **The `layout` Y.Map** in `packages/schema` plus the `LayoutStore` binding,
   with the undo scope handled (§7).
3. **Drag.** The loop in §5.
4. **The agent surface.** Directives over MCP, so an agent that adds a node can
   say where it goes — the `rel`/`delta`/`cell`/`at` vocabulary in
   [`../spec/layout-store.md`](../spec/layout-store.md), and the written
   procedure in [`../../agent/layout-preserving-edit.md`](../../agent/layout-preserving-edit.md).

**Filed as issues** in `uberblick-ai/uberblick-2` on 2026-08-26, unlabeled and
in this order: [#272](https://github.com/uberblick-ai/uberblick-2/issues/272)
(read-only render), [#273](https://github.com/uberblick-ai/uberblick-2/issues/273)
(the `layout` map, binding and undo scope),
[#274](https://github.com/uberblick-ai/uberblick-2/issues/274) (drag),
[#275](https://github.com/uberblick-ai/uberblick-2/issues/275) (the agent
surface). Step 1 is deliberately first and deliberately alone: the owner's call
(2026-08-26) is to settle §2 on the strength of a running render rather than on
this argument, so #273–#275 declare a dependency on it and none of them start
until that question has an answer.

## 10. Open questions for uberblick

1. §2 — is the "no live renderer" position reversed for a derived,
   deterministic render?
2. §3 — is a fourth top-level `Y.Map` the right home, or does uberblick prefer
   layout to hang off the annotations map or a per-block substructure?
3. §7 — who owns the undo-scope change, and is `trackedOrigins` already doing
   something this would disturb?
4. Does the MCP surface need to read or write positions in v1, or is step 4 of
   §9 genuinely later?
