# Changelog

## Unreleased

- Add optional `mountPlayback(..., { expand: true })` and host-called `mount.expand()`:
  a full-screen native modal keeps natural-size figure scrolling above persistent
  playback controls and captions, preserves the active player and dwell, retains
  themes and reduced motion, and restores focus and host content on close or teardown.
  ([#127](https://github.com/uberblick-ai/ablauf/issues/127))

## 0.3.0 — 2026-11-02

### Playback

- Resolve named flow `play` sections into `timelines`, with JSON strings, line-numbered diagnostics,
  current/played SVG parts and theme tokens; diagrams without playback retain their SVG bytes. ([#67](https://github.com/uberblick-ai/ablauf/issues/67))
- Ship `@uberblick/ablauf/playback` with JavaScript and TypeScript declarations. Its headless `createPlayer`
  supports timing, scenarios, navigation, looping and reduced motion; importing either entry is DOM-free. ([#69](https://github.com/uberblick-ai/ablauf/issues/69))
- Add `mountPlayback` with accessible scenario tabs, buttons, a native step range, captions, announcements
  and teardown, plus playground integration and browser fixtures for schemes, shadow roots and remounts. ([#94](https://github.com/uberblick-ai/ablauf/issues/94))
- Choosing a scenario tab plays it from its first step, unless the reader prefers reduced motion.
- Fade unplayed flow parts to 0.3, preserving opaque label gaps and crossing knockouts; expose
  `ab-in-progress` for hosts and add browser fade fixtures. ([#112](https://github.com/uberblick-ai/ablauf/issues/112))
- Glow the current step in its own tone with a heavier stroke, keeping every part's colours, dashes and arrowheads;
  `--ab-play-glow` sets the blur (`6px`, or `0` to disable).
  `ab-playing` enables forward edge dashes and 0.35s easing; reduced motion disables both. ([#113](https://github.com/uberblick-ai/ablauf/issues/113))
- Make controls compact, with underlined scrolling tabs, reserved counter and actor/caption space,
  and a seekable segmented bar; preserve native range access and the glow override. ([#116](https://github.com/uberblick-ai/ablauf/issues/116))
- Add `mountPlayback(..., { autoplay: true })`: play once the figure is half in view, pause off screen and
  resume on return unless the reader paused; reduced motion keeps it idle.

### Diagrams and host themes

- Draw `sequence v0` with ordered UML participants, lifelines, requests, responses and self-messages
  in bounded 678px lanes, with host mono fonts and line-numbered diagnostics. ([#74](https://github.com/uberblick-ai/ablauf/issues/74))
- Add sequence groups (`alt`, `opt`, `loop`, `group`), notes over lifelines and sections, with wrapping,
  recovery and per-layer `groundOpacities` in the host paint contract. ([#79](https://github.com/uberblick-ai/ablauf/issues/79))
- Show Sequence on the site and in the playground and README, with a short claim example;
  tighten sequence spacing and size single-lifeline notes to their text. ([#80](https://github.com/uberblick-ai/ablauf/issues/80))
- Export the text paint contract (`TOKENS`, `Token`, `Palette`) and DOM-free `checkPalette` for host contrast
  checks, with a [Test your integration](https://ablauf.uberblick.ai/guides/testing) guide; the checker does not alter rendering. ([#76](https://github.com/uberblick-ai/ablauf/issues/76))
- Darken LIGHT rework from `#826954` to `#806752` so every built-in text pair reaches 4.5:1,
  including labels on bands and inline gaps; DARK and geometry stay unchanged. ([#86](https://github.com/uberblick-ai/ablauf/issues/86))
- Keep same-column decision edges on the column centreline across odd and even widths,
  preserving inline-label clearance. ([#82](https://github.com/uberblick-ai/ablauf/issues/82))
- Honour `fonts.mono` in both fan-out styles for typography, wrapping, ladder sizing and dotted leaders;
  omitting fonts preserves default SVG bytes. ([#77](https://github.com/uberblick-ai/ablauf/issues/77))

### Docs and development

- Separate the authoring primer from renderer internals and add explicit editing guidance and authoring trials. ([#71](https://github.com/uberblick-ai/ablauf/pull/71))
- Give the site a three-column Projects, Learn and GitHub footer and update Uberblick links. ([#72](https://github.com/uberblick-ai/ablauf/pull/72))
- Add a security policy with private reporting, response times, supported versions and vulnerability scope. ([#73](https://github.com/uberblick-ai/ablauf/pull/73))
- Record the shared playback design and release boundaries; sequence and fan-out playback remain follow-up work. ([#104](https://github.com/uberblick-ai/ablauf/pull/104))
- Shorten the README into a product page with light/dark PNGs and playback GIFs; move API details to `docs/api.md`
  and add `mise run media` for captures. ([#93](https://github.com/uberblick-ai/ablauf/pull/93), [#114](https://github.com/uberblick-ai/ablauf/pull/114))
- Bind the ablauf corpus and register both project corpora for MCP, including Codex and Claude access. ([#90](https://github.com/uberblick-ai/ablauf/pull/90), [559775a](https://github.com/uberblick-ai/ablauf/commit/559775a))
- Refresh the pre-playback SVG test baseline to include sequence annotations. ([#107](https://github.com/uberblick-ai/ablauf/pull/107))

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
