# Writing a diagram

A flow is text that records how a diagram is laid out. You decide where
everything goes and the renderer draws it. Run `node check.ts <file>`. It
writes the SVG and lists problems with line numbers. A flow is done when it
has no problems.

For an edge-free list of outcomes, use the standalone fan-out kind below.
For routed nodes and edges, use `flow v0`:

```
flow v0
columns side main stop

pill needs-work col=main tone=muted
box worker "does the work"
end done "Finished"

pill retry col=side row=worker tone=rework
panel person col=stop row=worker tone=stop
  pill needs-human
  muted "a person decides"

needs-work --> worker : start
worker --> done : finished
worker --> retry tone=rework : failed
retry --> needs-work tone=rework from=top to=left label=end : again
worker --> person tone=stop : stuck
```

Use each key once per node, edge or legend-entry line. Repeating a key warns,
even with identical values; valid repeated values still use the last value.
Reusing keys on separate lines is allowed.

## Grid

- `columns a b c` names the columns from left to right, once, before any node.
- Each node starts a new row below the previous one. `row=<id>` puts it in the
  same row as that node instead. An empty `row=` is diagnosed and starts a
  new row. `span=N` makes it cover N rows from there,
  top to bottom.
- `col=<name>` picks the column. Without it, a node uses the column of the
  node declared before it, so the first node always needs `col=`.
- `section "Title"` starts a horizontal band. The rows that follow belong to it.
- `gap=60` on a node requests at least 60px after its last covered row
  (after the final row of `span=`, when present). It grows that boundary
  across every column, including nodes joined with `row=`. Omit it for no
  request. Use a non-negative whole number of pixels; requests combine by
  largest minimum, never addition, with other nodes' requests, automatic
  label clearance, the ordinary 30px gap and the 52px section gap. A request
  after the final row is diagnosed, as is an invalid value. This key belongs
  on nodes, including when no edge has a label.

## Nodes

`kind id "text" key=value`

| Kind | Draws | Text |
| --- | --- | --- |
| `text` | plain caption | the caption |
| `pill` | a label with a coloured dot | id, or the quoted text |
| `box` | a role or step; the id is the title | the subtitle |
| `end` | a final state | the caption |
| `panel` | a box with indented content: `pill`, `text`, `muted`, `strong`, `rule` | |
| `decision` | a question: a label box over a small diamond | the question |

Tones: `ink`, `muted`, `neutral`, `agent`, `system`, `done`, `rework`, `stop`. Use
`tone=neutral` for a filled grey box, panel or end state; `ink` and `muted`
keep their interiors surface-filled. Neutral also colours edge strokes,
arrowheads and pill dots, with matching legend samples in light and dark.
Hosts can override its foreground and fill with `--ab-neutral` and
`--ab-neutral-bg`.

Use `box ... tone=system` for an automated system step, such as a launcher.
It has a blue title, border and tinted background, distinct from the teal
agent role (`box`), red person panel (`panel tone=stop`), label with a coloured
dot (`pill`) and neutral note (`panel tone=muted`). `title=` overrides the id
as the visible title; the quoted text remains the subtitle:

```
box loop col=main tone=system title="The loop" "claims eligible items in order"
```

It uses the same `col=`, `row=`, `span=` and edges as any box.

A `decision` asks a question with several ways out. Its text wraps at word
boundaries around 26 characters; the box grows to fit, and the diamond's tips
show above and below it. Keep questions short. Edges meet a decision at the
middle of each side: the diamond's tips on the top and bottom, the box's sides
on the left and right. Every edge on one side shares that point, so a slot
like `bottom.2` on a decision is diagnosed. The default tone is `neutral`.
Label its ways out with inline labels:

```
decision approved col=main "Do stakeholders approve?"
approved --> ship tone=done label=inline : yes
approved --> rework tone=rework from=right to=right label=inline : no
```

Panel sizes are automatic. Their `text`, `muted` and `strong` lines wrap at
word boundaries to fit the panel's inner width; a long child pill widens the
panel and gives its text more room. Wrapped lines also grow its height.

Box subtitles wrap at word boundaries around 34 characters,
keeping longer words intact. Long subtitles add centered lines and grow the
box and its row vertically. Box titles stay on one line; boxes in a column
share a width measured from their titles and wrapped subtitles.

## Edges

`a --> b key=value : label`. Use `-.->` for dashed. The keys go before the colon.

- `tone=` colours the edge (default `ink`).
- `from=` and `to=` choose the side an edge leaves and enters: `top`, `right`,
  `bottom` or `left`. Add a slot when several edges share a side: `bottom.1`
  is leftmost or topmost.
- If you leave the sides out: in the same column, an edge goes from bottom to
  top. In overlapping rows, it goes between the facing sides. Otherwise it
  leaves the side facing the target and enters the target's top or bottom.
- Leave both ends unnumbered on a same-column bottom-to-top main edge to
  reserve the centreline. Other entries, including returns, use off-centre
  slots in left-to-right order. With two slots, `top.1` sits left of the main
  arrow and `top.2` right. More entries round the slot count up to an even
  number, half on each side, without moving the main arrow. Unnumbered side
  entries fill unused slots on the half facing their other node's column,
  in source order within each half; the slot count grows until both halves
  have room. Same-column entries then fill remaining gaps in source order.
  Numbering either main end opts out of the centre reservation.
- The shape follows from the sides. An edge between facing sides is straight
  whenever the target's side reaches the source's row, so a node that spans
  several rows takes a straight edge from each of them. A side to a top or
  bottom gives one bend; otherwise there are two.
- `label=end` puts the label at the target end instead of the source end.
- `label=inline` sets the label in small capitals into a gap in the edge,
  centred on its longest segment. Labels wrap around 22 characters. Column
  and row gaps grow so a straight edge between neighbouring columns or rows
  keeps clear line on both sides of the label; when the segment is still too
  short, the check says so. Use it for a decision's answers.
- Vertical labels between adjacent, non-overlapping row ranges automatically
  get at least 12px above and below their box to the segment's ports or elbows.
  This covers straight edges, L edges with a vertical selected label end and
  Z edges between opposite top/bottom sides, in either direction. The whole
  boundary grows; a Z needs more space because its segment gets only half
  the endpoint separation. Horizontal labels, same-side loops, overlapping
  rows and segments crossing multiple boundaries keep their usual placement
  and diagnostics. Use a node's `gap=` for additional space when needed.
- At an interior crossing, the edge declared later passes above the earlier
  edge with a short canvas-colour knockout gap. Swapping the declarations
  swaps which edge has the break, without changing routes or styling. The
  gap uses the host's `--ab-bg` background (`--ab-band` on shaded sections),
  with light and dark defaults; labels, nodes and arrowheads stay visible.
  Shared endpoints and collinear overlaps get no gap. The crossing diagnostic
  stays: this is a reading aid, and you must still avoid crossings.

## Legend

A `legend` line with indented entries adds fine print under the diagram: a
small sample of each shape and what it means. Give one whenever a reader
could ask what a shape or colour stands for.

```
legend
  pill tone=done "GitHub label" sample=ready
  box "agent role"
  box tone=system "automated system step"
  panel tone=stop "a person decides"
  dashed tone=rework "set by the launcher"
```

Entries are `pill`, `box`, `end`, `panel`, `decision`, `edge` or `dashed`, with an
optional `tone=` and the meaning in quotes.
Shape entries (`pill`, `box`, `end`, `panel`, `decision`) can add `sample=ready` or
`sample="two words"` to put text inside the sample. The meaning is still
required alongside it. Samples grow to fit the text and entries wrap to new
rows. Without `sample=`, the small sample stays the same. `edge` and `dashed`
are line samples; `sample=` on either reports a diagnostic. Empty or
whitespace-only sample text reports `sample= needs non-empty text` and leaves
the small sample with its shape, tone and meaning.

## Making it look good

- Keep the main path in one column going down, and put branches in side columns.
- Put a branch node in the row of the node it belongs to (`row=`).
- When several edges enter a top or bottom, give the nearest edge the slot
  nearest the main column. Keep a same-column main edge unnumbered, and use
  numbered slots for the branches. The same rule applies to return entries;
  choose their sides to keep the loop clear. Nested edges then never cross.
- A stop or note that several rows point at: put it in a side column with
  `span=` over those rows, and leave the edges' sides out.
- Fix every problem the check reports. Never leave a crossing.

## Fan-outs

Use a fan-out when one step has several outcomes and each needs its own
reason and destination. Save it as a `.flow` file and run `mise run check FILE`;
it also appears in the playground and example renderer.

```
fan-out v0
step "Record how the run ended"

outcome "Success" reason="The work and required checks finished" destination="Hand off for review" tone="done"
outcome "Blocked" reason="A person must resolve a decision or missing access" destination="Ask a maintainer" tone="stop"
outcome "Crash" reason="The process ended before it could report" destination="Retry the run" tone="rework"
outcome "Retries exhausted" reason="The run used every permitted retry" destination="Ask a maintainer" tone="stop"
```

The header is `fan-out v0`. Name exactly one `step "text"` before one or more
`outcome "text" reason="text" destination="text"` entries. All values are
required, non-empty double-quoted JSON strings; escape quotes as `\"` and
backslashes as `\\`. Each declaration occupies one source line. An optional
`tone="…"` colours an outcome with a flow tone: `done` for the good ending,
`rework` for a retry, `stop` (with a dashed border) where a person steps in.
The named fields can appear in any order, once each. Blank lines and
whole-line `#` comments are allowed. There are no edges, ids or placement
keys; destinations are plain text.

The default style, `branches`, draws the step on the left with a curved branch
into each outcome box, then an arrow to the destination in bold with the reason
below. For a compact list, add `style ladder` before the step: the step sits on
top, with a rail of tone dots below it, one per outcome, the reason under each
outcome and the destination right-aligned. Entries stay in source order,
including separate reasons for the same destination. Text wraps and rows grow,
including for long words, within a 678 px canvas. Malformed entries produce
line-numbered diagnostics and still draw, with placeholders for missing fields
and the original invalid source visible. Missing step or entries are reported
at the header. Keep the wording concise and review at 710 px in both themes.
