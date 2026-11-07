# Package JavaScript size

Run `mise run size` from the checkout. It installs frozen development dependencies,
builds the package, measures both entries, and exits nonzero when playback exceeds
**12,288 gzip bytes (12 KiB)**. A result at or below the limit passes. Core has no
size budget. The existing `mise run measure` command measures layout movement.

The GitHub `lint, typecheck and tests` job runs the same `mise run size` command.
Both results appear in its log and job summary before the budget check fails.

The measurement uses **esbuild 0.28.2**, pinned as a development dependency, with
no other bundler or minifier. It measures separate ESM consumers containing
`export * from "@uberblick/ablauf/playback";` and
`export * from "@uberblick/ablauf";`. Package self-reference resolution follows
`package.json` exports into the freshly built `dist/` JavaScript. Re-exporting
retains every runtime export, including both `createPlayer` and `mountPlayback`
(player and built-in controls), and all of core's runtime API.

- Raw bytes: esbuild `--bundle --format=esm`, without minification.
- Minified bytes: the identical consumer and settings, with `--minify`.
- Gzip bytes: the minified bytes compressed by Node's zlib at level 9.
- Other esbuild settings use the pinned version's defaults, including browser
  platform, default tree shaking and no target override. The API uses `write: false`
  to measure in memory and `metafile: true` to collect evidence; neither changes
  the bundle. There are no plugins, external modules or source maps.
- Byte counts are UTF-8 output lengths; KiB means bytes divided by 1024. Displayed
  KiB values are rounded to three decimal places; the gate compares integer bytes.

Each report records the measured Git revision and whether the working tree has
changes, the Node/esbuild/zlib versions, measurement settings, and raw/minified/gzip
sizes. Use the pinned mise toolchain and frozen lockfile to compare revisions;
compression implementations and esbuild versions can affect results.

For both raw and minified bundles the report lists all esbuild metafile inputs
and output runtime exports. The command also fails if either core bundle includes
`dist/player.js` or `dist/controls.js`, either playback bundle omits those modules,
or either entry loses its expected runtime exports. This makes core isolation
verifiable from the published report. Runtime exports newly added to either entry
are automatically retained by `export *`.

`mise run ci` exercises under-budget, exact-boundary and over-budget results,
publication on failure, isolation failures, and the real build/measurement command.
It also checks that the local mise task and CI job call the same command.
