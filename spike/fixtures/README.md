`pre-playback.json.gz` contains the exact SVG strings rendered from all 16
examples on main at `a7189341e0db26658e82a3b610be8716228bb00a`, before
implementing #67. Each example has auto, light and dark output, with its
filename stem as `idPrefix`, in that order. Node's `gzipSync` compressed the
JSON without altering the strings. `spike/playback.test.ts` decompresses and
compares these strings byte for byte. These are historical fixtures, not
outputs to regenerate with the current renderer.
