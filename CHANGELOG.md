# Changelog

## 0.2.1

- Same-column edges into and out of decisions stay on the column centreline
  across odd and even node widths, preserving inline-label clearance.
  ([#82](https://github.com/uberblick-ai/ablauf/issues/82))
- Fan-outs in both styles honour `fonts.mono` for typography, wrapping, ladder
  step sizing and dotted leaders. Omitting fonts preserves the default SVG bytes.
  ([#77](https://github.com/uberblick-ai/ablauf/issues/77))

## 0.2.0 — 2026-10-20

**Breaking change:** 0.2.0 replaces the 0.1.x Mermaid-subset line with a new
routed flow format; 0.1 sources must be rewritten. The 0.1.x line lives in
[uberblick-ai/old-ablauf](https://github.com/uberblick-ai/old-ablauf). ([#1](https://github.com/uberblick-ai/ablauf/pull/1))

### Package

- `import { render } from "@uberblick/ablauf"`: a synchronous ES module for
  Node.js 22.18+, with types and no runtime dependencies. ([#49](https://github.com/uberblick-ai/ablauf/pull/49))
- Host fonts and width metrics through `fonts.mono` and `fonts.text`. ([#48](https://github.com/uberblick-ai/ablauf/pull/48))
- Page themes through `--ab-*` CSS properties, or a fixed `scheme`. ([#35](https://github.com/uberblick-ai/ablauf/pull/35), [#30](https://github.com/uberblick-ai/ablauf/pull/30))
- Distinct `idPrefix` values never collide, so diagrams can share a page. ([#31](https://github.com/uberblick-ai/ablauf/pull/31))

### Flows

- `flow v0`: nodes on a grid the author lays out, routed edges, tones,
  legends and line-numbered diagnostics. ([#1](https://github.com/uberblick-ai/ablauf/pull/1))
- `decision` nodes and `label=inline` edge labels for classic flowcharts. ([#61](https://github.com/uberblick-ai/ablauf/pull/61))
- `system` and `neutral` tones, and quieter default tone colours. ([#33](https://github.com/uberblick-ai/ablauf/pull/33), [#39](https://github.com/uberblick-ai/ablauf/pull/39), [#60](https://github.com/uberblick-ai/ablauf/pull/60))
- Box and panel text wraps to fit. ([#37](https://github.com/uberblick-ai/ablauf/pull/37), [#34](https://github.com/uberblick-ai/ablauf/pull/34))
- Section captions fit the canvas; empty sections are diagnosed. ([#32](https://github.com/uberblick-ai/ablauf/pull/32))
- Main arrows stay centred when other edges share a side. ([#38](https://github.com/uberblick-ai/ablauf/pull/38))
- Room around vertical edge labels, and `gap=N` for extra space below a node. ([#46](https://github.com/uberblick-ai/ablauf/pull/46))
- Gaps where edges cross. ([#41](https://github.com/uberblick-ai/ablauf/pull/41))
- Text in legend samples with `sample=`; repeated keys warn. ([#40](https://github.com/uberblick-ai/ablauf/pull/40), [#54](https://github.com/uberblick-ai/ablauf/pull/54))

### Fan-outs

- `fan-out v0`: one step and its ordered outcomes, each with a reason and a
  destination. ([#47](https://github.com/uberblick-ai/ablauf/pull/47))
- Curved branches into toned outcome boxes, or a compact `style ladder`. ([#55](https://github.com/uberblick-ai/ablauf/pull/55))

### Docs

- The [ablauf.uberblick.ai](https://ablauf.uberblick.ai) site, with a page per kind and guides, and a one-page
  [authoring primer](https://github.com/uberblick-ai/ablauf/blob/main/spike/PRIMER.md). ([#56](https://github.com/uberblick-ai/ablauf/pull/56), [#57](https://github.com/uberblick-ai/ablauf/pull/57), [#58](https://github.com/uberblick-ai/ablauf/pull/58), [#62](https://github.com/uberblick-ai/ablauf/pull/62))
