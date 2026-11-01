`pre-playback.json.gz` contains the exact SVG strings rendered from all 16
examples on main at `04b1458a9b801e4f30c83896b78c183e86fe2c76`, the last
commit before #67 landed. (It was first captured at `a718934`; #102 then
changed `claim.flow` before #67 merged, so it was re-captured at `04b1458`.)
Each example has auto, light and dark output, with its filename stem as
`idPrefix`, in that order. Node's `gzipSync` compressed the JSON without
altering the strings. `spike/playback.test.ts` decompresses and compares these
strings byte for byte. These are historical fixtures, not outputs to
regenerate with the current renderer. A deliberate static change, such as a
palette value, updates the expected strings in the test, not this file.
