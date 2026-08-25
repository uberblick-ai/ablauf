# Spike fixtures

From the measurement spike (2026-08) that shaped this library's design —
the LLM-as-layout-preserver experiment: two hand-arranged graphs (8-node
auth flow, 18-node deploy pipeline), hand-tuned positions, and twelve graph
mutations — two of which are controls whose correct answer is zero
movement.

They are kept as test seeds because they are the only realistic
hand-arranged layouts this project has: `graphs.json` + `positions.json`
seed renderer and snap-pass tests, and `scenarios.json` gives the twelve
mutations that the freeze rule has to survive. The spike's measured findings
are summarised in `docs/decisions.md` (D11).

Shapes, verbatim from the spike harness:

- `graphs.json` — `{ [graphId]: { title, canvas: {w,h}, nodes: [{id,label,kind}], edges: [{from,to,label?}] } }`.
  `kind` is one of `process | decision | terminal`. `canvas` is a spike-only
  field: the spike had a fixed canvas, and half its awkward placements were
  that artifact. ablauf grows the canvas instead, so ignore it.
- `positions.json` — `{ [graphId]: { [nodeId]: {x,y} } }`, node *centres*.
- `scenarios.json` — `[{ id, base, mutation, note?, ops: [...] }]` with ops
  `addNode | delNode | addEdge | delEdge | relabel`.
