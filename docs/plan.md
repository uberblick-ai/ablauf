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
| Sections (the horizontal bands) | Band shading and labels |
| Node kind (`text`, `pill`, `box`, `end`, `panel`) and tone | Shapes, colours, fonts, light and dark |
| Which side an edge leaves and enters (`from=`, `to=`) and its slot on that side (`bottom.2`) | The elbow those sides imply: straight, one bend (L) or two bends (Z), one fixed rule each |
| Edge tone, dashed or solid, and whether the label sits at the start or end | Label position next to that end, port spacing along a side. Where two facing sides overlap, the port on the longer side slides to meet the other end head on, so the edge runs straight; a slot there sets the order, not the exact point |
| A legend: which shapes and tones to explain, and what each means | Fine print under the diagram, wrapping onto further rows |

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
- Inserting a step is two new lines in the source and nothing else changes.
  In pixels, everything below the insert moves down by one row. Nothing moves
  sideways unless a wider node widens its column.

## Rendering rules

- SVG as a string, with no browser and no DOM, and the same bytes for the same input.
- Labels in monospace, so text widths are predictable. Sans text is limited
  to box subtitles and panel lines, measured with a fixed estimate.
- Box subtitles and panel text wrap at word boundaries around 34 characters;
  longer individual words stay intact. Subtitle lines are centered, with 15px
  between baselines. A box keeps its 46px minimum height and grows by 15px for
  each extra subtitle line. Its width is the maximum of 180px, the title width
  plus 32px, and the longest wrapped subtitle line width plus 28px. Boxes in
  one column share the widest box's width. Row sizing and edge ports use the
  resulting box dimensions; box titles do not wrap.
- The canvas includes every drawn section caption, measuring its uppercase
  text with letter spacing. A section without nodes gets a line-numbered
  diagnostic and draws no band or caption.
- Colours use the base `--ab-ink`, `--ab-muted`, `--ab-line`, `--ab-band` and
  `--ab-surface` overrides, plus `--ab-agent`, `--ab-done`, `--ab-rework` and
  `--ab-stop` foregrounds and each tone's `--ab-<tone>-bg` background.
  [Host page themes](theming.md) documents every property and complete CSS
  for root `data-theme="light"` / `data-theme="dark"`. Host overrides update
  inline SVG without rerendering and take precedence over the system theme
  and a pinned `scheme`. Page CSS cannot reach SVGs embedded as images.
  Without overrides, defaults follow `prefers-color-scheme`, or stay fixed
  when the render option `scheme` is explicitly `"light"` or `"dark"`.
  The internal defaults also work when SVGs are shown as images.
- Marker ids carry a prefix, so several diagrams can share a page. Hosts must
  supply distinct `idPrefix` values for diagrams on the same page; the default
  is `ab`. Prefixes containing only `[A-Za-z0-9_-]`, including the empty prefix,
  stay unchanged. Each other UTF-16 code unit becomes `.` followed by four
  lowercase hexadecimal digits, including literal dots, so the encoding is
  reversible and distinct prefixes never collide. For example, `doc.1`,
  `doc:1` and `doc-1` become `doc.002e1`, `doc.003a1` and `doc-1`. Routes and
  legend samples reference the same encoded marker ids.

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
- Sans text widths are estimated. Is a monospace subtitle acceptable, or do we
  ship font metrics?
- Panels with content are the first compound node. Where do compound nodes
  stop growing?
- How much of the hand-drawn polish, such as a label below its line, should
  the format expose?
