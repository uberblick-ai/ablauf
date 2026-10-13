# Spike findings: author-placed flow

Date: 2026-10-13. Plan: [docs/plan.md](../docs/plan.md).

## Result

The idea holds. The loop renders from 49 lines of text with no problems and
looks like the hand-drawn figure, in light and dark. Five fresh agents, given
only [PRIMER.md](PRIMER.md) and a prose description, each wrote a clean loop
without seeing any image. Five more fresh agents each added a role to
someone else's file correctly, also without seeing an image.

The renderer has no layout engine. It sizes the grid and draws the elbow the
chosen sides imply. Everything else is the author's choice, and the check
reports every overlap with a line number.

## Numbers

| Trial | Check runs | Problems on the first run |
| --- | --- | --- |
| write-1 to write-5 | 2, 2, 1, 2, 1 | 2, 1, 0, 0, 0 |
| edit-1 to edit-5 | 16, 35, 2, 7, 3 | 3, 1, 1, 1, 1 |

All ten finished with no problems. Each agent used about 55k to 67k tokens, most
of it reading the primer and the task. All five writers used the same frame:
main path in the middle, rework on the left, stops on the right, and two
sections. The details differ. Three used one shared stop panel, one used two
panels, and one gave each role its own "blocked" pill. needs-changes sits in
the implementer's, reviewer's or ready-to-merge's row.

## What the trials found, and what changed

1. **Slots on a tall panel were the one real pain.** Three editors searched by
   trial and error. One went as far as slots `left.1/5/9/13`, which only work
   because the renderer spread ports by the highest slot number: that is
   geometry leaking into the text. The cause was that a panel spanning rows was
   centred and shorter than those rows, so edges bent into it and shared a
   channel. **Fixed:** a spanning node now fills its rows, and an edge between
   facing sides runs straight whenever it can. All ten trial files now pass
   with their side slots removed. Slots only matter on tops and bottoms.
2. **The check missed a label crossing its own edge.** Four of the five writers'
   files had it. **Fixed:** labels are now checked against their own edge too.
3. **The first node defaulted to the leftmost column.** **Fixed:** the first node
   needs `col=`, and the check says so.
4. **Long panel text made panels very wide.** **Fixed:** panel text wraps at a
   fixed number of characters.
5. **Agents wrote `pill id "text"` inside panels.** **Fixed:** that is accepted
   now, like a node line.

## Edit stability

Inserting a role ([loop-insert.flow](examples/loop-insert.flow)) takes two new
nodes, three new edges and one rewired edge. In pixels, everything below the
insert moves down by 140 and nothing above it moves. One thing did move
sideways: the new box's subtitle was wider than the others, so the box column
grew from 199 to 211 and the main path shifted 6 pixels right. `node
measure.ts` prints the full list.

Editors also had to bump `span=` when they inserted rows inside a spanned
range, and two of them did. A span is a count, so it breaks on insert.

## Proposed changes to the plan

1. Replace `span=N` with a named range, `rows=implementer..integrator`, so
   inserting inside the range needs no edit.
2. Keep slots for tops and bottoms only. Left and right ports line up with the
   source row.
3. Give boxes a fixed width per column and wrap subtitles, so a long subtitle
   never moves the column.
4. Let diagnostics suggest a fix as well as name the problem ("try `label=end`"
   or "try a slot nearer the main column"). Agents said the check told them
   what was wrong but not what to try.
5. Keep sections able to hold nodes that span them. Three writers made a second
   stop node because they weren't sure a panel could cross a section.

## Pikchr baseline

[baseline/loop.pikchr](baseline/loop.pikchr) draws the same loop in 44 lines.
It works, but the author places every side node and every label in inches
(`at 2.2in west of RV`), two labels collide, and nothing reports it. The output
has no theme variables and no dark mode. An agent would need to see the image
to fix it. It stays a fallback only.

## Files

- `flow/`: parser, grid, SVG. About 1,100 lines (biome-formatted) with no dependencies; runs on Node 22.18 or later.
- `examples/`: the loop and the insert example. `out/`: their SVGs.
- `trials/`: the ten agents' files as they left them. Two editors routed one
  stop edge into the panel's bottom to work around finding 1. After the fix,
  that label sits on the panel, so those two files report one problem now. Both
  pass once that workaround is removed.
- `node render.ts`, `node check.ts <file>`, `node measure.ts`, `node --test flow.test.ts`.
