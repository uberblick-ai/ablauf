# Changelog

## 0.2.0 — 2026-10-20

**Breaking change:** 0.2.0 replaces the 0.1.x Mermaid-subset line with the
routed flow format. Sources written for 0.1 do not carry over and must be
rewritten. The 0.1.x line lives in
[uberblick-ai/old-ablauf](https://github.com/uberblick-ai/old-ablauf).
([#1](https://github.com/uberblick-ai/ablauf/pull/1))

### Package and integration

- Import the synchronous ES module entry point with
  `import { render } from "@uberblick/ablauf"`. Requires Node.js 22.18 or newer;
  ships compiled JavaScript and TypeScript declarations without runtime
  dependencies or a TypeScript loader. `render(source, options?)` returns
  `{ svg, diagnostics, layout }`; diagnostics include a source line, severity
  and message. The package also exports option and diagnostic types and the
  `LIGHT` and `DARK` default palettes.
  ([#49](https://github.com/uberblick-ai/ablauf/pull/49))
- Supply host fonts through `fonts.mono` and `fonts.text`, each with a literal
  font family and synchronous `measureText` callback. Matching metrics drive
  text sizing, wrapping, canvas bounds and overlap checks. Omitting fonts
  preserves the default font stacks and geometry.
  ([#48](https://github.com/uberblick-ai/ablauf/pull/48))
- Integrate page theme switches through documented `--ab-*` CSS properties;
  host overrides update inline SVGs without rerendering. Defaults follow the
  system theme or an explicit `scheme: "light"` / `"dark"` option. Inline
  diagrams keep independent palettes regardless of document order.
  ([#35](https://github.com/uberblick-ai/ablauf/pull/35),
  [#30](https://github.com/uberblick-ai/ablauf/pull/30))
- Distinct `idPrefix` values remain distinct even with punctuation or Unicode,
  preventing marker collisions between inline diagrams. Supply a distinct
  prefix for each diagram sharing a page.
  ([#31](https://github.com/uberblick-ai/ablauf/pull/31))

### Routed flows

- Author `flow v0` diagrams with named columns, sequential or shared rows,
  row spans and section bands. Use `text`, `pill`, `box`, `end` and compound
  `panel` nodes, solid or dashed edges, explicit sides and numbered ports,
  start/end label placement, tones and legends. The renderer sizes the grid
  and draws deterministic, escaped, themed SVG without moving nodes or
  rerouting edges. Source and geometry problems produce line-numbered
  diagnostics while the diagram still draws.
  ([#1](https://github.com/uberblick-ai/ablauf/pull/1))
- Add blue `tone=system` styling for automated steps, including edges and
  legend samples, and filled grey `tone=neutral` shapes with matching pill
  dots, edges and legends. Both tones support host colour overrides.
  ([#33](https://github.com/uberblick-ai/ablauf/pull/33),
  [#39](https://github.com/uberblick-ai/ablauf/pull/39))
- Wrap box subtitles at word boundaries and grow boxes and rows to fit;
  panel text wraps at its actual inner width, including the extra room from
  wide child pills.
  ([#37](https://github.com/uberblick-ai/ablauf/pull/37),
  [#34](https://github.com/uberblick-ai/ablauf/pull/34))
- Include uppercase, letter-spaced section captions in canvas sizing;
  diagnose empty sections instead of drawing an orphan band or caption.
  ([#32](https://github.com/uberblick-ai/ablauf/pull/32))
- Keep unnumbered bottom-to-top main arrows centred in their column when
  additional edges share either side; other ports occupy separate slots.
  ([#38](https://github.com/uberblick-ai/ablauf/pull/38))
- Reserve clearance around labels on qualifying vertical segments between
  adjacent row ranges. A node's optional `gap=N` requests a minimum pixel gap
  after its covered rows, combined by maximum with automatic and section
  spacing. Invalid values and requests after the final row are diagnosed.
  An empty `row=` is also diagnosed, and the node starts a new row.
  ([#46](https://github.com/uberblick-ai/ablauf/pull/46))
- Draw local knockout gaps at interior edge crossings: the later declared
  edge passes above the earlier one, using the canvas or section background.
  Crossing diagnostics remain, and routes stay as authored.
  ([#41](https://github.com/uberblick-ai/ablauf/pull/41))
- Put text inside legend shape samples with `sample=`, sizing and wrapping
  entries to fit. Blank or whitespace-only samples produce a diagnostic and
  retain a small sample. Repeated keys on a node, edge or legend-entry line
  warn even when values match; valid repeated values still use the last value.
  ([#40](https://github.com/uberblick-ai/ablauf/pull/40),
  [#54](https://github.com/uberblick-ai/ablauf/pull/54))

### Outcome fan-outs

- Add standalone `fan-out v0` diagrams with one `step` and ordered
  `entry "outcome" to="destination" because="reason"` declarations. Entries
  remain separate even when destinations match. Malformed source produces
  line-numbered diagnostics and remains visible in the output.
  ([#47](https://github.com/uberblick-ai/ablauf/pull/47))
- Draw the default fan-out as curved branches from the step into outcome
  boxes, with arrows to destinations and reasons. Optional entry `tone=`
  colours outcomes (`stop` also dashes their borders); `style ladder` draws
  a compact rail of tone dots with right-aligned destinations instead.
  ([#55](https://github.com/uberblick-ai/ablauf/pull/55))

### Authoring tools, examples and documentation

- Provide a one-page authoring primer, diagnostic checker, batch renderer,
  insertion measurement tool, deploy/checkout/delivery-loop examples and a
  local playground with live rendering, clickable diagnostics, light/dark
  and document-width toggles, node-box overlay and a hand-drawn reference.
  ([#1](https://github.com/uberblick-ai/ablauf/pull/1))
- Serialize playground saves and preserve confirmed saved state when edits,
  renders or saves overlap. Group the sidebar by Flow and Fan-out kind, with
  examples before trials.
  ([#29](https://github.com/uberblick-ai/ablauf/pull/29),
  [#55](https://github.com/uberblick-ai/ablauf/pull/55))
- Document separately authored wide and narrow layouts with a worked pair
  and host selection guidance; add an issue-preparer launcher flow example.
  ([#36](https://github.com/uberblick-ai/ablauf/pull/36),
  [#53](https://github.com/uberblick-ai/ablauf/pull/53))
- Add the ablauf.uberblick.ai site and showcase, then dedicated Flow and
  Fan-out pages with Displayed/Source tabs, colour and Tiptap integration
  guides, and motivation and Uberblick integration pages.
  ([#56](https://github.com/uberblick-ai/ablauf/pull/56),
  [#57](https://github.com/uberblick-ai/ablauf/pull/57))
- Add a maintainer release command with a read-only preflight, dated changelog
  parsing, trusted npm publishing workflow and recovery documentation.
  ([#51](https://github.com/uberblick-ai/ablauf/pull/51))
