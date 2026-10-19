# Writing a flow

A flow is text that records how a diagram is laid out. You decide where
everything goes and the renderer draws it. Run `node check.ts <file>`. It
writes the SVG and lists problems with line numbers. A flow is done when it
has no problems.

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

## Grid

- `columns a b c` names the columns from left to right, once, before any node.
- Each node starts a new row below the previous one. `row=<id>` puts it in the
  same row as that node instead. `span=N` makes it cover N rows from there,
  top to bottom.
- `col=<name>` picks the column. Without it, a node uses the column of the
  node declared before it, so the first node always needs `col=`.
- `section "Title"` starts a horizontal band. The rows that follow belong to it.

## Nodes

`kind id "text" key=value`

| Kind | Draws | Text |
| --- | --- | --- |
| `text` | plain caption | the caption |
| `pill` | a label with a coloured dot | id, or the quoted text |
| `box` | a role or step; the id is the title | the subtitle |
| `end` | a final state | the caption |
| `panel` | a box with indented content: `pill`, `text`, `muted`, `strong`, `rule` | |

Tones: `ink`, `muted`, `agent`, `system`, `done`, `rework`, `stop`.

Use `box ... tone=system` for an automated system step, such as a launcher.
It has a blue title, border and tinted background, distinct from the teal
agent role (`box`), red person panel (`panel tone=stop`), label with a coloured
dot (`pill`) and neutral note (`panel tone=muted`). `title=` overrides the id
as the visible title; the quoted text remains the subtitle:

```
box loop col=main tone=system title="The loop" "claims eligible items in order"
```

It uses the same `col=`, `row=`, `span=` and edges as any box.

Box subtitles and panel text wrap at word boundaries around 34 characters,
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

## Legend

A `legend` line with indented entries adds fine print under the diagram: a
small sample of each shape and what it means. Give one whenever a reader
could ask what a shape or colour stands for.

```
legend
  pill "GitHub label"
  box "agent role"
  box tone=system "automated system step"
  panel tone=stop "a person decides"
  dashed tone=rework "set by the launcher"
```

Entries are `pill`, `box`, `end`, `panel`, `edge` or `dashed`, with an
optional `tone=` and the meaning in quotes.

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
