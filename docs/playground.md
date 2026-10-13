# ablauf playground: plan

Draft for review, 2026-10-13. Modelled on wireframe-md's playground
(`playground/` there, `mise run playground`). It goes into the fresh
`uberblick-ai/ablauf` repository once the spike's direction is accepted.

## Status

A first cut runs on the spike branch: `mise run playground`. It has the
sidebar, the editor beside a live render, clickable diagnostics, Save, the
light/dark and 710 px toggles, a node-box overlay, and the hand-drawn
reference beside the loop. Approval, entry pages, hover links and the
what-moved view are still to come.

## What it is for

It is a local page for people to review flows. You write or paste a flow, see
it render in light and dark beside its source, click a problem to jump to its
line, and approve the examples that should become golden figures. Agents use
`check` and the tests; the playground is for the human eye.

## What carries over from wireframe-md unchanged

- `mise run playground` installs dependencies and serves `localhost:4620`. It
  takes a free port if that one is busy. It renders from sources on each
  request, so there's no build step.
- Examples live at `examples/FAMILY/ENTRY/NAME.flow`. The sidebar has
  collapsible families of entries, ordered the same way: a leading number sets
  the order and stays out of the label.
- An entry page shows all its examples, each with its source beside its render
  and a compact bar: name, status, unsaved mark, **Save**, **Approve** and
  **Review**. Ctrl+S or ⌘S saves.
- Diagnostics show only when there are any. Clicking one selects its line.
- Toggles switch light and dark, and the bare page and Uberblick's 710 px
  document column.
- Each family has an overview of tiles. Addresses work the same way:
  `#flows/1-loop`, `#flows/1-loop/insert`, `#flows/` and `#scratch`. Scratch has
  an Add form.
- **Approval belongs to people.** Only the Approve control writes
  `examples/approvals.json`, and agents never touch it. Each fingerprint is the
  SHA-256 of the saved source and the rendered SVG. The SVG carries its own
  styles, so there is no separate stylesheet to cover. Review shows the
  approved SVG source, or a diff against the current one.

## What a flow needs on top

1. **Grid overlay.** A toggle draws the author's grid over the render: column
   names, row lines, section boundaries, and numbered ports on each side. That
   makes the text-to-picture mapping visible, and it's where slot and span
   choices get checked.
2. **Hover links source and picture.** Hovering a node or edge line in the
   source highlights it in the render, and the other way round. Hovering a
   diagnostic highlights every element it names.
3. **Reference beside the render.** An example can have
   `NAME.reference.svg`, for example the hand-drawn loop. A third pane then
   shows it, with a slider overlay for comparing the two.
4. **What moved.** Any two examples in one entry can be compared, such as the
   loop and the loop with a role inserted. The view shows `measure.ts`'s table,
   and outlines the moved nodes and routes in the render.
5. **Copy as Markdown.** One button copies the ```` ```ablauf ```` fenced
   block, ready to paste into a corpus doc.

## Starting families

| Family | Entries |
| --- | --- |
| Flows | the ub-agents loop, the loop with a role inserted, the primer example |
| Parts | text, pill, box, end, panel, and each tone |
| Edges | the four elbow shapes, slots on a top or bottom, spans with straight edges, dashed edges, label at start or end |
| Diagnostics | one example per diagnostic: crossing, through a node, each label overlap, overlapping nodes, unknown ids |
| Trials | the ten agent files from the spike, kept as found |

## Build order

Each step is one small PR:

1. **Package skeleton.** Move `spike/flow` to `src/` and adopt wireframe-md's
   tooling (pnpm, Biome, tsc, the test runner, mise tasks). The examples
   become `examples/` and the tests run every example.
2. **Playground core.** Copy wireframe-md's server, catalog, editor and
   approval files, swap its renderer for ours, and fingerprint the SVG. Use
   Node's built-in type stripping, so no TypeScript dependency is needed at
   runtime.
3. **Grid overlay and hover links.** These need the renderer to tag SVG
   elements with node and edge ids (`data-id`), which also helps tests.
4. **Reference pane and what-moved view.**
5. **A showcase site** (later, as in wireframe-md): a static page built only
   from approved examples.

## Left out on purpose

- Drag editing. The text stays the only source.
- Running agent trials from the page.
- An AI assistant panel.
- Any layout or routing help beyond showing problems.

## Questions for you

- Port 4620, beside wireframe-md's 4610?
- Should approvals cover light and dark with one fingerprint, as in wireframe-md?
- Should the showcase site wait until there are three kinds, or ship with flows alone?
