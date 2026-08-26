# Legibility scenario ladder

Eight charts of growing structural complexity, from the 2026-08-26 owner
review that found the four routing defects (#13, #14, #17 and the label
pile-ups). None of them was visible in the spike fixtures, which are
tree-shaped and forward-flowing — so the ladder is committed here and every
future renderer change is judged against it, not only against `auth` and
`deploy`.

- S1 linear · S2 diamond branch/merge · S3 side branch with a retry loop ·
  S4 fan-out with a back edge · S5 ternary decision · S6 five-edge diamond
  with an overlapping-span back edge · S7 triple merge · S8 self-loop.

Shape: one `<id>.mmd` per scenario (valid mermaid, like every text fixture)
plus `scenarios.json` — `{ version, scenarios: [{ id, title, note,
positions: { [nodeId]: {x,y} } }] }`, node *centres*, the same coordinates
`fixtures/spike/positions.json` uses. They live here rather than in the
spike files because they are not the spike's: their provenance is the
review, and mixing them into `fixtures/spike/` would make that file claim
two different origins.

They are **fixed charts, not snap sets**: `scripts/acceptance.mjs` renders
each from its stored positions with no directives, hashes the SVG into the
manifest, and asserts D24 on the rendered bytes; `scripts/gallery.mjs` puts
all eight into `gallery.html`, which is where a human judges them (D20 —
the browser is the rasteriser). There are deliberately no goldens: the
ladder's job is to be *looked at* when routing changes, and the manifest's
double run already pins it against silent drift.
