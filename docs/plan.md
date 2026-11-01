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
| Node kind (`text`, `pill`, `box`, `end`, `panel`, `decision`) and tone | Shapes, colours, fonts, light and dark |
| Which side an edge leaves and enters (`from=`, `to=`) and its slot on that side (`bottom.2`) | The elbow those sides imply: straight, one bend (L) or two bends (Z), one fixed rule each |
| Edge tone, dashed or solid, and whether the label sits at the start, the end or inline in the edge | Label position next to that end, port spacing along a side. Where two facing sides overlap, the port on the longer side slides to meet the other end head on, so the edge runs straight; a slot there sets the order, not the exact point. Sides with a reserved main centre keep their ports fixed |
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

- [spike/PRIMER.md](../spike/PRIMER.md) is the self-contained authoring and
  editing guide; this plan also records renderer mechanics and host contracts.
- The first line is `flow v0`. A newer version renders as the newest known one,
  with a warning, never an error.
- Line grammar in wireframe-md's style: `kind id "text" key=value`, two-space
  indent for panel contents and legend entries, blank lines and whole-line
  `#` comments. Each declaration occupies one source line. Double quotes group
  spaces in text and values such as `title="The loop"`; flow strings have no
  escape syntax and backslashes stay literal. Edge labels are unquoted text
  after the colon. Fan-out strings instead use JSON escaping, described below.
- Declare `columns` once before nodes, with names in left-to-right order.
  A node's omitted `col=` inherits the previously declared node's column;
  the first node needs an explicit column. Rows follow node declaration order,
  not edge order. Each node without `row=` starts the next row; `span=N` covers
  N rows downward, defaulting to 1. A `section "Title"` starts a horizontal band
  for the nodes declared after it.
- Node keys are `col`, `row`, `span`, `gap`, `tone` and `title`.
  Node defaults are `muted` for text and pills, `agent` for boxes, `done` for
  ends, `stop` for panels and `neutral` for decisions. Text defaults to the id,
  except that boxes use the id as title and have no subtitle, and panels draw
  only their children, not the node's label or title. `title=` overrides
  the visible title on other kinds; combining it with quoted text on a non-box
  warns and keeps the title. Panel children are `pill`, `text`, `muted`, `strong` and
  `rule`; they have no grid placement or independent tone keys.
- Repeating a key on one node, edge or legend-entry line warns with the key
  name, even when its values are identical. Valid repeated values still use the
  last value; existing invalid-value fallbacks are unchanged. Reusing a key on
  separate lines is allowed.
- Edges are spelled like Mermaid (`-->`, `-.->`, `: label`), because agents
  already know that spelling. Nothing else is Mermaid.
  Keys precede the colon: `tone` (default `ink`), `from`, `to` and `label`.
  `label=start` is the default and places text beside the source segment;
  `label=end` selects the target segment instead. Facing sides give a straight
  route when their row ranges overlap, side-to-top/bottom gives one bend,
  otherwise there are two bends.
- Ids are the labels people read (`reviewer`, `needs-changes`) unless `title=`
  says otherwise, so the source reads like the picture.
- `row=<id>` must name another node. An empty value is diagnosed on the
  node's line, and the node starts a new row.
- A `decision` is a label box laid over a small diamond, wider than the
  diamond, so the diamond's tips show above and below the box and the box's
  sides reach past the diamond. The question wraps around 26 characters and
  the box grows. Each side has one port at its middle (the tips on top and
  bottom); an explicit slot above 1 is diagnosed and drawn at that port.
  The diamond takes the node's tone. The box has the tone's border over a
  mostly opaque surface fill, so the diamond shows through faintly.
  Default tone `neutral`.
- `label=inline` on an edge draws its label in small capitals, tracked and
  bold in the edge's tone, centred on the edge's longest segment in a gap
  that takes the canvas colour (`--ab-bg`, or `--ab-band` on a shaded
  section). It wraps around 22 characters. A straight edge between adjacent
  columns or adjacent rows grows that gap to keep 18px of line on both sides;
  otherwise a segment shorter than the label plus that clearance is
  diagnosed. The label's own edge does not count as overlapping it.
- A `legend` has indented entries: `kind tone=done "meaning"`. Shape entries
  (`pill`, `box`, `end`, `panel`, `decision`) also accept `sample=ready` or
  `sample="two words"`, drawn inside the sample with its shape and tone.
  The meaning in quotes is still required alongside it. Samples without text
  keep their small size. `edge` and `dashed` stay line samples and diagnose
  `sample=` on their source line. Empty or whitespace-only sample text on a
  shape entry (including `sample=`, `sample=""` and `sample=" "`) reports
  `sample= needs non-empty text` and draws the small sample with its shape,
  tone and meaning.
- Wherever `tone=` is supported (nodes, edges and legend entries), it accepts
  `ink`, `muted`, `neutral`, `agent`, `system`, `done`, `rework` or `stop`. `neutral` gives
  boxes, panels and end states a grey fill distinct from the surface and
  section bands, with a neutral foreground for titles, outlines, edges,
  arrowheads and pill dots. Legend samples use the same styles as the diagram.
  `ink` and `muted` keep surface-filled boxes and panels; defaults are unchanged.
  Hosts override neutral foreground and fill with `--ab-neutral` and
  `--ab-neutral-bg`, including matching legend samples in both themes.
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

### Editing and layout stability

To insert a step between `a` and `b`, put its node declaration after `a` and
before `b` in row order. Replace `a --> b` with `a --> new` and `new --> b`;
deliberately preserve or redirect every other connection. Edges do not set
row order. To remove a step, delete its node and incident edges, reconnect its
predecessor and successor, and update references to its id, including `row=`.

A branch beside its source uses explicit `col=side row=source`. Adding a
column edits the existing `columns` declaration; a new node aligned with an
existing row uses `col=new-column row=existing-id`. Reset `col=` on the next
declaration when it should not inherit the branch's column. Order slots on a
shared side spatially, putting nearer branches nearer the main path and
including return edges in that ordering. For example, on a shared right side,
an upward edge at `right.1` leaves above a horizontal branch at `right.2`.

Inserting a row shifts subsequent rows down. Removing one shifts them up.
Review affected `span=` counts: they cover a number of rows, not a named
range, so an insertion or removal can change coverage without a diagnostic.
Nothing moves sideways unless changed text or a new node widens its column,
or changed labels need more column clearance.

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
box titles, pills, edge labels, section captions, legend sample text and all
fan-out and sequence text, and
`fonts.text` for standalone text, end labels, box subtitles, panel text and
legend descriptions in flows. Fan-outs and sequences use no text-role metrics
or face. For sequences, `fonts.text` does not affect the SVG or layout.
Each configured role requires both `family` and `measureText`; an omitted role
keeps its existing font stack and estimates. Omitting `fonts` (or passing `{}`)
preserves the existing geometry and SVG bytes for the same palette, including
the historical panel and caption diagnostic estimates.

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
text use 12px/400; other flow text uses 11px/400. In both fan-out styles,
steps use 13px/600, outcomes and destinations use 12px/600, and reasons and
line-numbered source text use 12px/400. Fan-out wrapping, ladder step sizing
and dotted leaders use those same metrics. Changing CSS fonts after rendering
requires rerendering with matching metrics. Sequence participant titles use
12px/600; message labels and visible rejected source use 12px/400; step
numbers use 11px/400. Every sequence text role uses mono metrics for wrapping.

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

A fan-out records one step and everything it can lead to, read left to right.
There are no authored edges: the renderer draws one branch per outcome.
Use it when the reason for each outcome matters as much as its destination.
It is a separate diagram kind, not a node embedded in a routed flow.

```
fan-out v0
step "Check whether approval permits the run"

outcome "Approved" reason="A maintainer started it and the input is unchanged" destination="Start the run" tone="done"
outcome "Outside input" reason="The input has not been cleared by a maintainer" destination="Ask a maintainer" tone="stop"
outcome "Edited since" reason="The input changed after the maintainer started it" destination="Ask a maintainer" tone="stop"
```

- The first non-blank, non-comment line is `fan-out v0`. A newer version
  warns and renders as v0. Blank lines and whole-line `#` comments are ignored.
- An optional `style branches` or `style ladder` line comes before the step;
  `branches` is the default. A second, unknown or late style is diagnosed on
  its line and the diagram draws in the style already chosen.
- Declare exactly one `step "text"` before the entries, then one or more
  `outcome "text" reason="text" destination="text"` lines. All three entry
  fields and the step text are required and non-empty. An optional
  `tone="…"` takes any flow tone (`done`, `rework`, `stop`, `agent`,
  `system`, `neutral`, `muted`, `ink`) and colours the outcome box, with a
  dashed border for `stop` as on flow panels; without it the box is plain. `reason=`, `destination=` and `tone=` may appear in
  any order, at most once each. Indentation is optional; there are no ids,
  separately authored edges or layout keys.
- Every value is a double-quoted JSON string on one source line. Use `\"`
  for a quote and `\\` for a backslash. Destinations are display text, never
  links or node references.
- The default `branches` style draws the step once, on the left, and a
  curved branch from it into each outcome box. A short arrow leads from each
  box to its effect: the destination in bold with the reason below it.
  Entries keep their source order, top to bottom; matching destinations never
  combine entries or reasons. Each row grows to fit its taller side, and the
  step is centred on the rows. Every curve ends in a short straight run, so
  its arrowhead points into the box.
- The canvas is 678 px wide, within the playground's 710 px document column.
  The step box is 150 px wide with 13 px text in a 118 px area. Outcome boxes
  are 170 px wide with a 142 px text area, and effects get 236 px. Text is
  12 px monospace with 18 px leading and wraps at word boundaries, splitting
  individual long words when necessary. Both styles honour `fonts.mono` for
  the face and width metrics, including line-numbered rejected source text;
  `fonts.text` does not affect fan-out text. A glyph wider than its area still
  draws alone on a line. There is no route search, node
  placement or overlap correction.
- The ladder draws the step on top, then a rail of dots, one per entry in its
  tone (muted without one). Each outcome sits beside its dot with the reason
  below it, and the destination is right-aligned on the outcome's line,
  joined by a dotted leader when there is room. It has no arrows. Outcomes
  wrap at 260 px, reasons at 400 px and destinations at 220 px.
- Malformed, incomplete, duplicate and unknown declarations produce
  diagnostics on their own source lines and still render. Missing step or
  entries are diagnosed at the header. Partial entries show missing-field
  placeholders and their original source; other invalid lines are printed
  below the entries. The first step and first value of a duplicate field win,
  with the rejected source still visible. All text is escaped.
- Fan-outs share the flow SVG's scoped styles, `--ab-*` palettes and render
  options (`title`, `scheme`, `fonts`, and `idPrefix` for the branches' arrow marker).
  Their returned layout has canvas dimensions and diagnostics, with empty
  routed-flow nodes, routes and bands, so the grid overlay has nothing to draw.
  Save them as `.flow` files for the existing check, render and playground tools.

See [approvals](../spike/examples/approvals.flow) and
[run endings](../spike/examples/run-endings.flow) for the review examples, and
[run endings as a ladder](../spike/examples/run-endings-ladder.flow).

## Sequence v0

```text
sequence v0
participant Creator
participant Studio tone=system
participant RSSFeed "RSS feed" tone=system

Creator --> Studio: Sign in, no show yet
Studio -.-> Creator: Claim existing, Add via RSS, Start from scratch
Studio --> Studio: Check session
```

Sequence covers UML participants, lifelines and messages. `participant` stays
because it is the clear UML term. Arrows use flow's `-->` for a solid request
and `-.->` for a dashed response: one arrow means one line style in every
ablauf kind. There are no Mermaid aliases; `->>` and `-->>` are malformed.
Groups retain the clear UML terms `alt`, `opt`, `loop` and `group`;
`note over` states placement on lifelines, and `section` matches flow's phase
term. There are no compatibility aliases. Activation bars, async/lost messages,
participant creation/destruction, autonumber and playback are outside v0.

### Syntax and recovery

- `render()` selects sequence when the first non-blank, non-comment line
  starts with `sequence` followed by whitespace or end of line. Other sources
  keep the existing flow/fan-out dispatch. Indentation is ignored; blank lines
  and whole-line `#` comments are allowed.
- The header is `sequence v0`. A newer `vN` warns on its line and draws as v0.
  A sequence header without a valid `vN`, such as `sequence` or `sequence x`,
  is diagnosed on its line, remains visible as rejected source, and draws as v0.
- Declare `participant ID ["Title"] [tone=TONE]` before messages. The id is
  one token; the optional title replaces it for display. Declaration order is
  column order. Titles use flow strings: double quotes, no escapes, literal
  backslashes. They cannot contain a straight ASCII double quote. There is
  no JSON string mode. `tone=` accepts the flow tones, defaulting to `ink`.
- Messages are `FROM --> TO: label` or `FROM -.-> TO: label`. Spaces around
  the arrow are optional; the colon is required. Everything after the first
  colon is label text, including quotes and backslashes. Equal endpoints
  make a self-message. Messages keep source order.
- Groups open with `alt LABEL`, `opt LABEL`, `loop LABEL` or `group LABEL`
  and close with bare `end`. Nesting has no syntax-depth limit; indentation
  is optional. `else LABEL` starts another branch only of the current open
  `alt`, never searching past an inner non-alt group. Group and else labels
  require non-whitespace text and consume the unquoted remainder literally,
  including arrows, colons, quotes and backslashes. Quotes are not delimiters.
- Notes are `note over A: text` or `note over A, B: text`. Require one or two
  distinct, already-declared ids; spaces around the comma are optional and
  either order spans the same lifelines. The first colon is required;
  everything after it is literal text, including quotes and backslashes,
  and must contain non-whitespace text.
- `section "Title"` starts a phase lasting until the next section or EOF.
  Titles use flow strings (double quotes, no escapes, literal backslashes,
  no embedded ASCII double quote), require non-whitespace text and allow
  no trailing text. A section inside any open group is invalid: phases and
  groups cannot cross.
- After indentation, leading `alt`, `opt`, `loop`, `group`, `else`, `end`,
  `note` and `section` followed by whitespace or EOL take precedence over
  message parsing, like `participant`. Thus `alt a --> b: c` and
  `loop --> Studio: x` open groups. These eight exact ids are reserved;
  their participant declarations diagnose visibly and create no lanes.
  Longer ids such as `loopWorker` remain valid.
- Diagnose missing group/else labels, `else` outside the current `alt`,
  unmatched `end` or text after it; malformed notes (missing/wrong `over`,
  colon or ids, unknown ids, empty text, over two or repeated ids); malformed
  sections (unquoted, unclosed or blank title, trailing text) and sections
  inside groups. Rejected annotations change neither the group stack nor
  the current phase and remain visible as line-numbered rejected source.
  At EOF close every unclosed group for drawing and diagnose each opening.
  Valid annotations occupy source positions and have no message numbers.
- Unknown message participants, malformed arrows and missing colons produce
  diagnostics on their source lines. Unparseable lines are shown below the
  messages as line-numbered source, in `--ab-stop`.
- Missing participant ids, unclosed titles, unknown tones, unknown/repeated
  participant keys and unexpected text after a title are diagnosed and the
  whole declaration is rejected visibly. Duplicate ids leave the first
  declaration in effect. Late declarations create no lane. Duplicate and late
  declarations also remain visible as line-numbered source. The rest draws;
  no source is silently discarded.

### Bounded lanes and paint

- The canvas is fixed at 678px, with no width option. A 22px left gutter
  holds message numbers; participants share the remaining width evenly.
  Narrow hosts provide horizontal scrolling, including at 360px. The renderer
  never scales or shrinks the figure.
- Alternate lanes have a rounded `--ab-neutral-bg` tint from top to bottom
  with `fill-opacity="0.15"`, composited over the canvas. There are no header
  boxes. A small tone dot sits above each bold mono title, wrapped to its
  lane. Thin `--ab-line` lifelines use 0.5 stroke opacity down lane centres.
- Each message owns one row. The label starts just inside the arrow's left
  end above its line, may cross other lanes, and wraps only at the right edge.
  Unbreakable tokens split to stay within the SVG. Rows grow for wrapped
  labels. There are no label knockouts; lifelines stay faint behind them.
- Groups span the participant lanes touched by messages and notes, including
  nested content, with room for rightmost self-message loops. Empty groups
  span all lanes. Their bounds stay outside the 22px number gutter and inside
  the diagram. Nested bounds inset within their parents, with cumulative
  inset capped at 24px (and less for narrow lanes) to retain heading width.
  A soft rounded `--ab-neutral-bg` fill without outline lies over lane tints
  and behind lifelines/content. Only the outermost two depths add a fill,
  each with `fill-opacity="0.5"`; deeper groups retain headings, dividers
  and layout without adding paint layers.
- Group headings use small-caps text: the kind in bold `--ab-ink`, followed
  by its label in regular `--ab-muted`. Each else branch has a faint dotted
  `--ab-line` divider above bold `ELSE` and its regular muted label. Headings
  and branch labels wrap, including unbroken tokens, and rows grow to fit.
- Notes own a row: one lifeline centres a note up to 220px wide; two span
  their lifelines. Notes stay within the diagram and their enclosing group.
  Rounded `--ab-rework-bg` fill carries a 3px left `--ab-rework` accent and
  opaque `--ab-rework` text, wrapped even for unbroken tokens.
- Sections show an opaque small-caps `--ab-muted` title on the left and a
  thin `--ab-line` rule across the remaining full width between rows. Long
  titles wrap within the diagram. No band or fill changes the lane tint.
- Requests use the sender's tone, a solid 1.6px line, filled head and small
  sender-end dot. For participant titles, dots, request lines and filled
  heads, `ink` and `muted` both resolve to `--ab-muted`, as in flow. Other tones
  use their matching `--ab-TONE`. Responses use a 1.2px dashed `--ab-muted`
  line and open head, without a dot. Both kinds of message label use
  `--ab-ink`, independently of tone.
- Self-messages make a short rounded loop to the right of the lifeline.
  Their labels use all remaining width to the right of that loop.
- Message numbers are `01`, `02`, … in `--ab-muted` mono, level with the
  arrows in the gutter. Rejected source is not a message and is not numbered.
  Annotation rows are not numbered; message numbers will serve
  as playback steps later.
- All text uses `fonts.mono`, including measured wrapping; `fonts.text` has
  no effect. The host-font contract above applies. As with fan-out, a glyph
  wider than its entire available slot is consumed alone to ensure progress;
  hosts must supply metrics/fonts that fit the fixed lane and gutter widths.
- Sequence adds its text/ground pairs to `checkPalette`: every participant
  tone, both message-label kinds, step numbers and rejected source on canvas
  and lane tint. Ground opacity is part of that contract; text stays opaque.
  Group/else kind and label headings and both message-label kinds cover
  untinted and 0.15-tinted lanes with zero, one and two group fills, including
  deeper groups with no additional fill and labels crossing fill boundaries.
  Note text covers its rework fill over every lane/group combination,
  including translucent host fills. Section titles cover canvas and lane tint.
  Optional `groundOpacities` parallels back-to-front `ground`, starts with
  `1` for `bg`, and contains multipliers in [0, 1]. Each scales that layer's
  own colour alpha before source-over composition in encoded sRGB. For
  example `["bg", "neutral-bg", "neutral-bg", "neutral-bg"]` uses
  `[1, 0.15, 0.5, 0.5]`. A pair uses either this array or legacy scalar
  `opacity` (last ground layer only); omitting both means all multipliers
  are 1. Accepted alpha-bearing host colours compose exactly, with opaque
  `bg` required; no opaque-colour folding of layers is used.
  `TOKENS` and `DARK` remain unchanged. After the palette-only LIGHT rework
  correction (#86, `#826954` to `#806752`), the built-in contrast regression
  requires both minima to reach 4.5. LIGHT is 4.526146877943026 (rework edge
  labels on band, including inline gap labels); DARK stays 4.706637464097893.
- Sequence shares scoped SVG styles, `--ab-*` palettes and the `title`,
  `scheme`, `idPrefix` and `fonts` render options. Its layout includes canvas
  dimensions and diagnostics with empty nodes, routes and bands and no legend,
  so the playground grid overlay still works. Existing flow and fan-out
  rendering bytes are unchanged apart from the LIGHT rework default correction
  above. Save sequence sources as `.flow` files for the existing check and
  render tools.

[Claim your podcast](../spike/examples/claim.flow) preserves the spike fixture's
five participant titles and all 15 directed messages, including its self-message.
The Claim and Verify sections separate phases; a Backend note after message 7
states that the code expires after 15 minutes. After message 11, `alt Code
matches` holds messages 12–13 and `else Wrong or expired code` holds 14–15.
Messages 7–15 illustrate handshake details, not an agreed product protocol.
A maintainer reviews the figure in a browser in
light and dark at 678px at this PR's maintainer merge; source inspection does
not satisfy visual review. The spike's bounded-lanes
[light](https://github.com/uberblick-ai/ablauf/blob/a10e93ffa9640a38c187982b71ae7b6bf2a29056/spike/sequence-spike/evidence/mermaid-bounded-lanes-light-doc710-fig678.png)
and [dark](https://github.com/uberblick-ai/ablauf/blob/a10e93ffa9640a38c187982b71ae7b6bf2a29056/spike/sequence-spike/evidence/mermaid-bounded-lanes-dark-doc710-fig678.png)
trials are references only. No spike code or dependency ships.

## Playback

Flow play sections, resolved timelines and SVG state styles are implemented.
The browser player (#69), built-in controls (#94), and sequence/fan-out target
resolution are still planned. This design records the smallest package feature
that lets a host show several scenarios of one diagram. It does not change
the existing flow, sequence or fan-out syntax or static rendering rules.

### Vocabulary

A **scenario** is one `play` section: a list of **steps**. Each step names a
**target** in the diagram and may carry an **actor**, a **caption** and a
**duration**. Rendering resolves each scenario into a **timeline**: the steps
with the **parts** of the SVG they light. A **player** plays a timeline on the
SVG; the **controls** are the package's buttons, scenario tabs and caption.
These words hold for every diagram kind.

### Play sections and recovery

One or more play sections follow the diagram in the same `ablauf` code block,
so Markdown, MCP and copy and paste need nothing new. The section format is
shared across kinds; only what a target names differs.

```text
play "Tests failing"
  tempo 1.8s
  step dependabot actor="Dependabot files" "Bump zod from 4.4.3 to 4.6.6"
  step integrator 2.4s "A test fails on the new version, so it gets one fix round"
  step needs-changes
```

- A section starts with `play` or `play "Name"` and runs to the next `play`
  or the end. Inside: an optional `tempo DURATION`, then
  `step TARGET [DURATION] [actor="..."] ["caption"]`.
- Play-section strings are JSON strings; ordinary quoted text without
  backslashes reads as today. A target is a bare token, or a string when it
  has spaces. This does not change the existing flow or sequence string
  grammar: those strings still have no escape syntax.
- Targets name a node id in a flow, a message number in a sequence, or an
  outcome's text in a fan-out.
- Durations are `2.4s` or `800ms`, between 100 ms and 60 s; default tempo is
  1.6 s. Anything else is a diagnostic on its line and falls back to the tempo.
- Unreadable lines are diagnostics on their line. The diagram always renders.
- Until a diagram kind has a playback resolver, each play section produces
  a diagnostic on its `play` line and `render()` returns `timelines: []`;
  the static diagram still renders. This applies to sequence and fan-out in
  v0.3.0, so splitting off play sections never silently discards them.

### What a flow step lights

A step lights its node and every edge from the last successfully resolved
step's node in that scenario to it; parallel edges all light. The first
successfully resolved step lights only its node. A repeated node needs no
edge. An unknown target, or a step with no edge from the last successfully
resolved step, is a diagnostic on that step's line and is skipped. A skipped
step does not change that predecessor for later steps. Labels never fade.
Sequence and fan-out define their own lighting rules when they arrive.

### Timeline and browser contract

`render()` adds `timelines: Timeline[]` without changing its other results:
for a kind with a playback resolver, one timeline per section in source order;
`[]` without play sections or when the kind has no resolver yet, as diagnosed
above.

```ts
interface Timeline {
  name: string;             // the quoted name, or "Scenario N"
  slug: string;             // kebab-case of name, "-2", "-3" on collisions
  steps: TimelineStep[];
}
interface TimelineStep {
  target: string;           // as written, resolved for the diagram's kind
  kind: string;             // box, pill, end, text, panel, decision; later message, outcome
  actor: string;            // actor=, else the target's title
  caption: string;          // "" when none
  ms: number;
  parts: string[];          // what this step lights
}
```

The planned player and controls use only `parts`, never `kind`: a new diagram kind
needs a resolver, not a new player. They will live in the browser entry
`@uberblick/ablauf/playback`; the core stays DOM-free. The player owns playback
and scenario selection; the built-in controls supply buttons, scenario tabs
and the caption so hosts do not need to recreate them.

Reuse the seams from [the playback spike (#65)](https://github.com/uberblick-ai/ablauf/pull/65):
split play sections off before diagram-kind dispatch, use a part lookup map
to resolve targets to SVG parts, and apply states through classes. Its grammar
and demo controls are not the design. The SVG gets play attributes and state
styles only when a play section exists; otherwise its bytes are unchanged.
Output remains deterministic and inert, with escaped source text and styles
scoped under the SVG root class.

The implemented SVG contract for #69 adds `data-ab-play` to the root, using
the encoded `idPrefix` to scope state marker references when several figures
share a page. Use distinct `idPrefix` values as with static SVG markers.
There is `data-ab-part="node-N"` on each
node's wrapper and `data-ab-part="edge-N"` on separate wrappers for an edge's
stroke, head and label (when present). Indices are zero-based layout order,
local to this SVG; consumers must use timeline `parts` rather than construct
ids. Distinct edges, including parallel edges, have distinct part identities.
Use `querySelectorAll('[data-ab-part="' + part + '"]')` within the SVG to
find **all** fragments of a part. Apply `ab-current` or `ab-played` to every
matching wrapper; current takes precedence if both are present. Remove both
classes for the full default figure. All six node kinds and edge strokes,
heads and labels take state colours without opacity changes or reordering.
Inline label gaps and crossing knockouts keep their background colour.

Playable SVGs define internal `--play` and `--play-done` through the host's
`--ab-play` and `--ab-play-done` overrides. Current defaults are `#2869b8`
(light) and `#88baff` (dark); played defaults are `#62798e` (light) and
`#8498ac` (dark). Auto follows `prefers-color-scheme`; pinned schemes keep
their defaults. These tokens are separate from the existing exported palette.

### Behaviour and theming (player behaviour planned)

- States are idle (full figure), paused, playing and ended. Previous, next,
  seek and switching scenario pause. Play on ended replays. Stop on the last
  step and offer Replay; `loop` is opt-in.
- Play on click is the default. Nothing starts unless the host calls play;
  a host may do so when a gallery card scrolls into view. With reduced motion
  nothing animates and the full figure shows; manual stepping still works.
- Without a player, the diagram is the full figure.
- One accent marks the current step; played parts keep a quieter tint. Use
  `--ab-play` for current and `--ab-play-done` for played parts, emitted only
  in playable SVGs. They follow the existing host-override and light/dark
  default rules; the existing palette stays unchanged.

### Release boundaries

- **v0.3.0, flows:** implemented play sections, timelines and SVG states
  ([#67](https://github.com/uberblick-ai/ablauf/issues/67)), the player
  ([#69](https://github.com/uberblick-ai/ablauf/issues/69)), and built-in
  controls with scenario tabs
  ([#94](https://github.com/uberblick-ai/ablauf/issues/94)).
- **v0.3.1, sequence diagrams:** the same play sections; a target is a
  message number.
- **v0.3.2, fan-outs:** [#68](https://github.com/uberblick-ai/ablauf/issues/68),
  the same play sections; a target is an outcome's text.

Extras cut from v0.3.0 wait for real need. Frozen frames come later. Timelines
from real ub-agents run logs and visual timeline editing are out of scope.
The remaining browser and diagram-kind work belongs to those follow-up issues.
This section follows the design from [#66](https://github.com/uberblick-ai/ablauf/issues/66) and the
[maintainer's prototype summary](https://github.com/uberblick-ai/ablauf/issues/66#issuecomment-6554358304).
Uberblick integration is
[uberblick-ai/uberblick-2#2007](https://github.com/uberblick-ai/uberblick-2/issues/2007)
and follows #69.

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

1. Keep the authoring primer at the stable `spike/PRIMER.md` path and publish
   `@uberblick/ablauf` 0.2.0. The npm name is ours; 0.1.0 was the old project.
2. Add a ```` ```ablauf ```` code block to uberblick-2 with a rendered view, an
   MCP help topic pointing at the primer, and Markdown export as the fenced
   source. Nothing goes into uberblick-2 before the spike passes.
3. Turn the ub-agents loop explainer into the first corpus doc that uses it.
4. Add further kinds after sequence (UML), implemented above with lifelines as
   columns and messages as rows: architecture (boxes in groups), and
   data model with class as one kind until they need to differ. Standalone fan-out v0 is implemented above; other kinds
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
