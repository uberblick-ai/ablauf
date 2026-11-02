# Sequence playback prototype (reference only, not for merging)

A standalone page that plays `spike/examples/claim.flow` with the 0.3.0 player
and controls. `build.ts` renders the example, adds part wrappers and overlays by
post-processing the SVG, and inlines the real player and controls with types
stripped: `node build.ts <repo> out.html`. Open `sequence-playback.html` and
press Play. Treatment C is the chosen one; the side column with the step list is
the chosen controls layout for tall figures.
