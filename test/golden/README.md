The six renderer-output checks in this directory are `loop.svg`, `deploy.svg`
and the four compressed compatibility fixtures. `mise run ci` reads them
without needing `out/`. `mise run render` writes generated examples to ignored
`out/` and refreshes `docs/images/`; it never writes here.

For an intentional rendering change, run `mise run render`, then explicitly
copy the matching freshly rendered `out/loop.svg` or `out/deploy.svg` here.
Changes to these goldens or `docs/images/` require maintainer figure review in
light and dark under the [loop policy](../../.agents/ub_agents.md#merging).
Keep compressed fixtures as historical captures and adjust expected strings
in their tests instead of regenerating them.

`pre-playback.json.gz` contains the exact SVG strings rendered from all 16
examples on main at `04b1458a9b801e4f30c83896b78c183e86fe2c76`, the last
commit before #67 landed. (It was first captured at `a718934`; #102 then
changed `claim.flow` before #67 merged, so it was re-captured at `04b1458`.)
Each example has auto, light and dark output, with its filename stem as
`idPrefix`, in that order. Node's `gzipSync` compressed the JSON without
altering the strings. `test/playback.test.ts` decompresses and compares these
strings byte for byte. These are historical fixtures, not outputs to
regenerate with the current renderer. A deliberate static change, such as a
palette value, updates the expected strings in the test, not this file.

`claim.flow` is a sequence diagram, which playback does not touch. Its entry
was re-rendered when the sequence spacing was tightened (#108); the 15 flow
examples keep their `04b1458` strings.

`pre-sequence-playback.json.gz` captures all 19 examples at
`3751cb9c22ae8c9682b645c2b396427fee2d692a`, before sequence playback (#141).
`test/sequence-playback.test.ts` and `test/sequence-travel.test.ts` compare
these historical SVG strings with their documented test-side adjustments.
