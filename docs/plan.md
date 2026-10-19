# Diagrams in Uberblick: plan v3 (author-placed flow)

Revised 2026-10-13. Replaces plan v2 after the owner's direction:
don't re-implement Mermaid. The agent that writes the diagram decides how it
looks, the way an agent draws an artifact by hand. The text format only has to
persist those decisions abstractly, so that another agent can read and edit
the diagram without looking at the picture.

## The idea in one paragraph

The source names the parts and records the author's layout choices on a coarse
grid: which column and row each node sits in, which side each edge leaves and
enters, and in which order edges share a side. The renderer turns that into
SVG in the house style. It measures text, sizes columns and rows, draws the
elbows the chosen sides imply, and reports every overlap or crossing with a
line number. It never moves anything to fix a problem; the author does that.

## Example

The loop figure from the ub-agents explainer (hand-drawn: [spike/reference/loop.svg](../spike/reference/loop.svg)):

```
flow v0
columns rework main stop

section "Issue"
text start col=main "A maintainer adds the first label"
pill needs-preparation tone=muted
box issue-preparer "writes scope and criteria"
pill ready tone=done

section "Pull request"
box implementer "codes, checks, opens the PR"
pill needs-review tone=agent
box reviewer "reviews the exact head SHA"
pill ready-to-merge tone=done
box integrator "updates base, checks, merges"
end merged "Merged · issue closed"

pill needs-changes col=rework row=reviewer tone=rework

panel human col=stop row=needs-review span=3 tone=stop
  pill needs-human
  muted "or an Action needed comment"
  rule
  strong "A person decides"
  text "adds the trigger of any role"
  muted "blocked, same role: retry"

start --> needs-preparation
needs-preparation --> issue-preparer : trigger
issue-preparer --> ready : prepared
ready --> implementer
implementer --> needs-review : handed-off
needs-review --> reviewer
reviewer --> ready-to-merge : approved
ready-to-merge --> integrator
integrator --> merged : merged

reviewer --> needs-changes tone=rework : changes-requested
ready-to-merge -.-> needs-changes tone=rework to=bottom.2 : on-conflict · launcher
integrator --> needs-changes tone=rework to=bottom.1 : changes-requested
needs-changes --> implementer tone=rework from=top to=left label=end : revise the same PR

issue-preparer --> human tone=stop to=top.2 : needs-human
implementer --> human tone=stop to=top.1 : blocked
reviewer --> human tone=stop : blocked
integrator --> human tone=stop : maintainer-merge, blocked
```

## Who decides what

| The author decides | The renderer decides |
| --- | --- |
| Named columns, left to right | Column widths and gaps, from node and label widths |
| Rows: each node starts a new row unless `row=<id>` joins another node's row; `span=` covers several rows | Row heights; a spanning node fills the rows it covers, so each of them can meet it with a straight edge |
| Optional `gap=N` on a node requests more space after its covered rows | Row-boundary gaps, satisfying the largest minimum from labels, requests and sections |
| Sections (the horizontal bands) | Band shading and labels |
| Node kind (`text`, `pill`, `box`, `end`, `panel`) and tone | Shapes, colours, fonts, light and dark |
| Which side an edge leaves and enters (`from=`, `to=`) and its slot on that side (`bottom.2`) | The elbow those sides imply: straight, one bend (L) or two bends (Z), one fixed rule each |
| Edge tone, dashed or solid, and whether the label sits at the start or end | Label position next to that end, port spacing along a side. Where two facing sides overlap, the port on the longer side slides to meet the other end head on, so the edge runs straight; a slot there sets the order, not the exact point. Sides with a reserved main centre keep their ports fixed |
| A legend: which shapes and tones to explain, optional sample text, and what each means | Fine print under the diagram, sizing samples to fit their text and wrapping entries onto further rows |

When the author leaves out `from=` or `to=`, three small rules apply: same
column goes bottom to top, same row goes between facing sides, otherwise the
edge leaves the side facing the target and enters its top or bottom. These are
defaults, not a layout engine; the author overrides them whenever the picture
needs it.

## What the renderer reports

Diagnostics never throw and always name a source line:

- an edge crossing or overlapping another edge
- an edge running through a node
- a label overlapping a node, an edge or another label
- two nodes overlapping
- unknown ids, keys or tones, and edge shapes v0 can't draw

A diagram is finished when it renders with no diagnostics. An agent can get
there from the text and the diagnostics alone, without seeing the image.

## Format rules

- The first line is `flow v0`. A newer version renders as the newest known one,
  with a warning, never an error.
- Line grammar in wireframe-md's style: `kind id "text" key=value`, two-space
  indent for panel contents, `#` comments.
- Edges are spelled like Mermaid (`-->`, `-.->`, `: label`), because agents
  already know that spelling. Nothing else is Mermaid.
- Ids are the labels people read (`reviewer`, `needs-changes`) unless `title=`
  says otherwise, so the source reads like the picture.
- `row=<id>` must name another node. An empty value is diagnosed on the
  node's line, and the node starts a new row.
- A `legend` has indented entries: `kind tone=done "meaning"`. Shape entries
  (`pill`, `box`, `end`, `panel`) also accept `sample=ready` or
  `sample="two words"`, drawn inside the sample with its shape and tone.
  The meaning in quotes is still required alongside it. Samples without text
  keep their small size. `edge` and `dashed` stay line samples and diagnose
  `sample=` on their source line. An empty `sample=` or `sample=""` on a shape
  entry reports a diagnostic and draws the small sample.
- Wherever `tone=` is supported (nodes, edges and legend entries), it accepts
  `ink`, `muted`, `neutral`, `agent`, `system`, `done`, `rework` or `stop`. `neutral` gives
  boxes, panels and end states a grey fill distinct from the surface and
  section bands, with a neutral foreground for titles, outlines, edges,
  arrowheads and pill dots. Legend samples use the same styles as the diagram.
  `ink` and `muted` keep surface-filled boxes and panels; defaults are unchanged.
- Slots count left to right on a top or bottom, top to bottom on a left or
  right. Explicit slots are assigned first. Without a reserved centre,
  unnumbered ends fill gaps in source order, and ports are evenly spaced along
  the side using the larger of the number of ends and the highest explicit slot.
- A same-column edge leaving the bottom and entering the top, with neither
  end numbered, reserves the shared column centreline at both ends. It stays
  straight there, within pixel rounding, even when other edges share a side.
  On each such side, the other ends use separate slots: round their slot
  count up to an even number, at least two, and space them evenly with a gap
  for the centre. Half the slots sit on each side of the centre; with two
  slots, `top.1` is left and `top.2` is right. Unnumbered ends use free slots
  on the half facing their other node's column, in source order within each
  half. Increase the even slot count until both halves have room. Ends whose
  other node is in the same column then fill remaining gaps in source order.
  Numbering either end of the main edge opts out of the centre reservation.
  Return edges use the same ports; their sides and loop paths remain the
  author's choice.
- Inserting a step is two new lines in the source and nothing else changes.
  In pixels, everything below the insert moves down by one row. Nothing moves
  sideways unless a wider node widens its column.

### System steps

Use `box id tone=system title="Title" "explanatory text"` for an automated
system step, such as a launcher. For example:

```
box loop col=main tone=system title="The loop" "claims eligible items in order"
```

Like any box, its id supplies the title unless `title=` overrides it, and the
quoted text supplies the subtitle. It supports the existing `col=`, `row=`,
`span=`, incoming/outgoing edges, sides and slots without changing layout rules.
The default box tone remains `agent`.

The `system` tone draws a blue title and border on a tinted background in both
light and dark. It distinguishes automated system steps from teal agent boxes,
red person panels, label pills with a coloured dot, and neutral muted panels used
as notes. Colours use `--ab-system` and `--ab-system-bg` host overrides. Like the
other tones, `system` also works on edges and legend entries. A matching sample
is `box tone=system "automated system step"` inside a `legend`.

[system-steps.flow](../spike/examples/system-steps.flow) compares these styles
in one small diagram for light/dark review in the playground's document column.

## Rendering rules

- Ordinary row gaps have a 30px minimum; a change of section has a 52px
  minimum. A node's optional `gap=N` requests a minimum gap of N pixels
  after its last covered row: after its own row by default, or after the
  final row of `span=N`. It affects the entire boundary across all columns,
  including nodes joined with `row=`, rather than adding padding to that
  node. Omission makes no request. Values must be non-negative whole decimal
  numbers representable as safe integers; `gap=0` keeps the other minimums.
  Requests from nodes sharing that boundary, automatic label clearance and
  ordinary or section minimums combine by maximum, never addition. A request
  after the diagram's final row is inapplicable and produces a diagnostic
  on that node's line. Invalid values are diagnosed and ignored; `gap=` on
  an edge is an unknown key. A span past the final row is still diagnosed
  and clipped before its gap request is evaluated.
- A label beside a vertical segment gets at least 12px above and below its
  label box (baseline minus 9px through baseline plus 3px), measured to that
  segment's ends: ports or elbows. This automatic guarantee applies only
  between adjacent, non-overlapping row ranges: straight edges, L edges
  whose selected label end is vertical, and Z edges between opposite top
  and bottom sides. It applies in both directions, with default label
  placement or `label=end`. The single boundary between the ranges grows
  as needed. The current midpoint-plus-4px baseline requires a 38px segment;
  a Z requires 76px between endpoint ports because its labeled segment gets
  half the separation. Node insets and side ports can already provide some
  of that space. Horizontal label segments, same-side loops, overlapping
  row ranges and vertical segments crossing multiple boundaries retain
  their existing placement and overlap diagnostics, without this guarantee.
  Boundaries without a qualifying label or author request keep their existing
  spacing. Added space preserves row order, alignment and span coverage;
  it never changes columns, sides, slots or routing choices. Remaining
  overlaps are still diagnosed at their source lines.
- SVG as a string, with no browser and no DOM, and the same bytes for the same input.
- By default, labels use IBM Plex Mono and other text uses IBM Plex Sans,
  with fixed width estimates. Hosts can supply fonts and matching metrics
  through render options, as described below; the flow syntax stays the same.
- At each interior edge crossing, the edge declared later in the source passes
  above the earlier edge. A solid canvas-colour under-stroke, 5.6 px wide
  (4 px wider than the edge), covers up to 6 px along that later edge on each
  side of the crossing, stopping at segment ends. This leaves a short knockout
  break in the earlier edge, with no bridge arc or fade. Swapping declarations
  swaps which edge has the break; routes, tones and dashed styling stay as authored.
- Knockouts use `--ab-bg` (white in light, `#171c24` in dark); over shaded
  section bands they use `--ab-band`. Hosts can override both to match their
  canvas. Arrowheads, section captions, nodes and edge labels draw above the
  knockouts. Knockouts introduce no markers or element ids.
- Crossing diagnostics and their source lines stay unchanged. Shared endpoints
  and collinear overlaps get no knockout. A visible break does not make a
  crossing acceptable: fix every diagnostic before calling the diagram done.
- Panel widths are sized automatically from their contents, with a bounded
  preferred text width so long notes grow downwards. Text-derived widths round
  up to whole pixels so the line that sets the width still fits. Panel `text`,
  `muted` and `strong` lines then wrap at word boundaries within the actual
  panel width, minus 14px padding on each side, using their font metrics or
  default width estimates. A wider child pill gives the text more room.
  Panel height and vertical centring use those same line breaks, including
  when a panel spans rows.
- Box subtitles wrap at word boundaries around 34 characters;
  longer individual words stay intact. Subtitle lines are centered, with 15px
  between baselines. A box keeps its 46px minimum height and grows by 15px for
  each extra subtitle line. Its width is the maximum of 180px, the title width
  plus 32px, and the longest wrapped subtitle line width plus 28px. Boxes in
  one column share the widest box's width. Row sizing and edge ports use the
  resulting box dimensions; box titles do not wrap.
- The canvas includes every drawn section caption, measuring its uppercase
  text with letter spacing. A section without nodes gets a line-numbered
  diagnostic and draws no band or caption.
- Colours use the base `--ab-bg`, `--ab-ink`, `--ab-muted`, `--ab-line`, `--ab-band` and
  `--ab-surface` overrides, plus `--ab-neutral`, `--ab-agent`, `--ab-system`,
  `--ab-done`, `--ab-rework` and `--ab-stop` foregrounds and each tone's `--ab-<tone>-bg` background.
  [Host page themes](theming.md) documents every property and complete CSS
  for root `data-theme="light"` / `data-theme="dark"`. Host overrides update
  inline SVG without rerendering and take precedence over the system theme
  and a pinned `scheme`. Page CSS cannot reach SVGs embedded as images.
  Without overrides, defaults follow `prefers-color-scheme`, or stay fixed
  when the render option `scheme` is explicitly `"light"` or `"dark"`.
  The internal defaults also work when SVGs are shown as images.
  Roots carry `ab ab-auto`, `ab ab-light` or `ab ab-dark`, and palette rules
  target only the matching mode, so inline diagrams keep their palettes
  independently of document order and system theme.
- Marker ids carry a prefix, so several diagrams can share a page. Hosts must
  supply distinct `idPrefix` values for diagrams on the same page; the default
  is `ab`. Prefixes containing only `[A-Za-z0-9_-]`, including the empty prefix,
  stay unchanged. Each other UTF-16 code unit becomes `.` followed by four
  lowercase hexadecimal digits, including literal dots, so the encoding is
  reversible and distinct prefixes never collide. For example, `doc.1`,
  `doc:1` and `doc-1` become `doc.002e1`, `doc.003a1` and `doc-1`. Routes and
  legend samples reference the same encoded marker ids.
- Legend sample text uses monospace and the existing themed text colours.
  Sample widths and row heights grow to fit it; entry wrapping includes both
  the sample and its meaning, and the canvas fits the widest entry.

### Host fonts and width metrics

`render(source, { fonts })` accepts two independent roles: `fonts.mono` for
box titles, pills, edge labels, section captions and legend sample text, and
`fonts.text` for standalone text, end labels, box subtitles, panel text and
legend descriptions.
Each configured role requires both `family` and `measureText`; an omitted role
keeps its existing font stack and estimates. Omitting `fonts` (or passing `{}`)
preserves the existing geometry and SVG bytes, including the historical panel
and caption diagnostic estimates.

`family` is one literal font family name, always quoted in the SVG. It may
contain Unicode letters and numbers, ASCII spaces, underscores and hyphens,
and must contain a non-space character. It is not a CSS declaration or a list
of fallback families: quotes, commas, escapes, punctuation, markup and URLs
are rejected with `TypeError`. A configured role replaces its default stack.
Font loading and any glyph fallback remain the host's responsibility.

`measureText(text, { fontSize, fontWeight })` synchronously returns the full
string's horizontal advance in SVG pixels. Sizes are 11, 12 or 13px; weights
are 400 (regular) or 600 (bold). It must be a pure, deterministic function of
these arguments: no installed-font lookup, browser, DOM or asynchronous work
is performed by the renderer. A host can precompute font advances or use its
own synchronous font metrics implementation. Measure the actual string,
including spaces, Unicode glyphs, kerning and any fallback glyphs. Return
the width without letter spacing; the renderer uppercases section captions
before measurement and adds their `.08em` spacing (0.88px per character).
Fractional custom widths round up to whole pixels to keep containers large
enough. Widths must be finite numbers from 0 through 1,000,000 pixels per
string; invalid results throw `RangeError` before an SVG is returned. Exceptions
from the callback propagate. These are caller configuration errors rather
than diagnostics attached to source lines.

Custom metrics govern node sizing, all wrapped panel and subtitle lines,
panel pills, edge gaps and label bounds, captions, legend rows and canvas
bounds. The overlap checks use those same widths; in particular, custom
captions use the same uppercase, letter-spaced width for bounds and diagnostics.
Box subtitles still wrap at 34 characters, and automatic panel widths keep
their 34-character preferred text width. Panel lines wrap at the panel's
measured inner width. Vertical spacing stays fixed. Choose fonts whose
vertical extents fit the existing line heights, and match metrics to the
font the host actually loads at each rendered size and weight. Box titles use
13px/600; end labels and strong panel lines use 12px/600; pills and standalone
text use 12px/400; everything else uses 11px/400. Changing CSS fonts after
rendering requires rerendering with matching metrics.

For example, to use IBM Plex Mono throughout, after making its regular and
semibold faces available to the SVG (its glyph advance is 0.6em):

```ts
import { render } from "./spike/flow/index.ts";

const plexMono = {
  family: "IBM Plex Mono",
  measureText: (text: string, { fontSize }: { fontSize: number }) =>
    [...text].length * fontSize * 0.6,
};
const { svg, diagnostics } = render(source, {
  fonts: { mono: plexMono, text: plexMono },
});
```

This metric assumes each character uses that face's fixed advance at both
weights. If a diagram uses combining marks, emoji or glyphs absent from the
loaded font, supply metrics for their actual advances and fallback faces.
For proportional fonts, sum or shape the glyph advances for the complete
string at the requested size and weight instead of counting characters.

## Standalone fan-out v0

A fan-out records one step and its ordered possible outcomes without edges.
Use it when the reason for each outcome matters as much as its destination.
It is a separate diagram kind, not a node embedded in a routed flow.

```
fan-out v0
step "Check whether approval permits the run"

outcome "Approved" reason="A maintainer started it and the input is unchanged" destination="Start the run"
outcome "Outside input" reason="The input has not been cleared by a maintainer" destination="Ask a maintainer"
outcome "Edited since" reason="The input changed after the maintainer started it" destination="Ask a maintainer"
```

- The first non-blank, non-comment line is `fan-out v0`. A newer version
  warns and renders as v0. Blank lines and whole-line `#` comments are ignored.
- Declare exactly one `step "text"` before the entries, then one or more
  `outcome "text" reason="text" destination="text"` lines. All three entry
  fields and the step text are required and non-empty. `reason=` and
  `destination=` may appear in either order, exactly once each. Indentation
  is optional; there are no ids, separately authored edges or layout keys.
- Every value is a double-quoted JSON string on one source line. Use `\"`
  for a quote and `\\` for a backslash. Destinations are display text, never
  links or node references.
- The renderer shows the step once, then aligned Outcome, Reason and
  Destination columns. Entries keep their source order; matching destinations
  never combine entries or reasons. Each row grows to fit its tallest cell.
- The canvas is 678 px wide, within the playground's 710 px document column.
  Cells use 12 px monospace text with 18 px leading and widths of 142, 258
  and 182 px. Text wraps at word boundaries, splitting individual long words
  when necessary. The step wraps at 13 px in a 614 px text area. There is no
  route search, node placement or overlap correction.
- Malformed, incomplete, duplicate and unknown declarations produce
  diagnostics on their own source lines and still render. Missing step or
  entries are diagnosed at the header. Partial entries show missing-field
  placeholders and their original source; other invalid lines are printed
  below the entries. The first step and first value of a duplicate field win,
  with the rejected source still visible. All text is escaped.
- Fan-outs share the flow SVG's scoped styles, `--ab-*` palettes and render
  options (`title`, `scheme`, `idPrefix`; no marker ids are needed here).
  Their returned layout has canvas dimensions and diagnostics, with empty
  routed-flow nodes, routes and bands, so the grid overlay has nothing to draw.
  Save them as `.flow` files for the existing check, render and playground tools.

See [approvals](../spike/examples/approvals.flow) and
[run endings](../spike/examples/run-endings.flow) for the review examples.

## The spike (now)

In the fresh `uberblick-ai/ablauf` repository, on a branch, with no
dependencies:

1. Render the loop figure above and compare it with the hand-drawn SVG, in light and dark.
2. Insert a role in the middle and measure what moved.
3. Give five fresh agents per model only a one-page primer and a description
   of the loop, and have them write it, then insert a role. Record
   diagnostics, retries and tokens.
4. If Pikchr's single C file builds, draw the loop in it too, as a baseline.

The spike passes when the loop renders with no diagnostics and looks as good
as the hand-drawn figure, and when most trial agents reach zero diagnostics.

## After the spike

1. Write the primer (`AUTHORING.md`, in wireframe-md's style) and publish
   `@uberblick/ablauf` 0.2.0. The npm name is ours; 0.1.0 was the old project.
2. Add a ```` ```ablauf ```` code block to uberblick-2 with a rendered view, an
   MCP help topic pointing at the primer, and Markdown export as the fenced
   source. Nothing goes into uberblick-2 before the spike passes.
3. Turn the ub-agents loop explainer into the first corpus doc that uses it.
4. Add further kinds on the same grid: architecture (boxes in groups), class,
   and data model. Standalone fan-out v0 is implemented above; other kinds
   without edges remain: decision ladder, steps, timeline, tree and grid.

## Non-goals

Automatic layout, route search, Mermaid compatibility or export, drag editing,
and pixel coordinates in the source.

## Open questions

- Are sides and slots enough for agents to avoid crossings using diagnostics
  alone, or do they also need a coarse text preview of the grid?
- Panels with content are the first compound node. Where do compound nodes
  stop growing?
- How much of the hand-drawn polish, such as a label below its line, should
  the format expose?
