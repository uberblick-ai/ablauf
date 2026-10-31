# Playback spike

Can a flow be played back, lighting its steps one at a time? This spike says
yes with two small pieces and no change to the flow format.

1. **The renderer marks its parts.** `render(source, { targets: true })` puts
   `data-node="id"` on each node and `data-from`/`data-to` on each edge path,
   arrow and label. Without the option the SVG keeps its exact bytes.
2. **A `.play` script names the order.** It points at a flow and lists the
   nodes to light, each with an optional time and caption:

   ```
   play v0
   flow ../examples/loop.flow
   tempo 1.6s
   step reviewer 2.4s "changes requested: P1 in the parser"
   step needs-changes
   ```

   The edge between two consecutive steps lights on its own, so a script never
   names edges. A step with no edge from the one before is reported, like an
   unknown node.

`node spike/play/play.ts spike/play/loop.play` writes `loop.html`: the SVG, a
play/pause button, a scrubber and a log. The player only toggles `on` and
`done` classes; CSS fades what hasn't happened yet, rings the current node and
runs dashes along the edge just taken.

## Open questions

- Should the script live in its own file, or as a `play` section at the end of
  the `.flow`?
- When two edges join the same pair of nodes, which one lights? Today both do.
- Highlight colour: one accent, or each node's own tone?
- Where does the player live: in the package (so Uberblick can embed it), or
  only in the local playground?
