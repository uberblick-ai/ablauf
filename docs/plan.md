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
- Colours are CSS variables inside the SVG with `--ab-*` overrides for a host,
  switching on `prefers-color-scheme`. This works in Uberblick, in artifacts
  and on GitHub, where SVGs are shown as images.
- Marker and element ids carry a prefix, so several diagrams can share a page.

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
   and data model. After those come the kinds without edges: fan-out,
   decision ladder, steps, timeline, tree and grid.

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
