# Writing and editing ablauf

You choose placement; the renderer sizes and draws without moving nodes or
rerouting edges. Save as `.flow`. [Renderer details](plan.md).

[Flows support play sections and timelines](plan.md#playback).
The browser player and controls are still planned.

## Flow syntax and nodes

Start with `flow v0`, then `columns` naming columns left to right, once,
before nodes. Declarations occupy one line. Blank lines and whole-line
`#` comments are allowed. Keep declarations unindented; indent panel
children and legend entries two spaces. Use each key once per line.

Nodes: `kind unique-id "text" key=value`.
Double quotes group spaces, including `title="Readable title"`; strings
have no escape syntax. Use typographic quotes inside them; backslashes are
literal. Edge labels are unquoted text after the colon.

| Kind | Meaning of text | Default tone |
| --- | --- | --- |
| `text` | caption | `muted` |
| `pill` | dotted label | `muted` |
| `box` | subtitle; id supplies title | `agent` |
| `end` | final caption | `done` |
| `panel` | indented children only | `stop` |
| `decision` | question over a diamond | `neutral` |

Omitted text uses the id, except boxes have no subtitle; panels show only
children. `title=` overrides
the visible title; outside boxes, use it instead of quoted text. Use readable
box titles; subtitles should add information.
Panel children: `pill`, `text`, `muted`, `strong` followed by text, or
`rule` alone.

`tone=` accepts `ink`, `muted`, `neutral`, `agent`, `system`, `done`, `rework`,
`stop` on nodes, edges and legend entries. Neutral gives grey fills; ink and
muted keep surface fills. System suits automated steps, agent suits workers,
done success, rework retries and stop human intervention.

## Layout and edges

Rows follow **node declaration order**. Each node starts the next row unless
`row=other-id` joins another node's row. `col=name` selects a column; omission
inherits the **previously declared node's column**. The first node needs
`col=`. `span=N` covers N
rows downwards (default 1). `section "Title"` starts a band for following
nodes; give every section nodes. `gap=60` requests a minimum 60px gap after
the node's last covered row, across all columns; use non-negative whole
pixels and omit it on the final row.

Edges: `a --> b key=value : label`; `-.->` is dashed. Label and keys
are optional: `tone=` (default `ink`), `from=`, `to=`, `label=`.
Sides are `top`, `right`, `bottom`, `left`. Defaults: same column uses
bottom-to-top; overlapping rows use facing sides; otherwise leave toward
the target's column and enter its top or bottom.

Slots such as `to=top.1` count left-to-right on top/bottom, top-to-bottom on
left/right. Leave both ends of a same-column bottom-to-top main edge
unnumbered to keep it centred; other entries use off-centre slots.
Unnumbered entries use available slots in source order, favouring the side
facing their other node when a main edge reserves the centre.
Decisions have one midpoint port per side: omit slot numbers.

`label=start` (default) sits beside the source segment; `label=end` beside
the target segment. `label=inline` makes a gap on the longest segment; use
it for decision answers.

```
flow v0
columns main stop
text start col=main "A maintainer starts"
pill ready
box work title="Do work" "Prepare the change"
decision approved "Is it approved?"
end shipped "Shipped"
panel human col=stop row=work span=2
  pill needs-human
  muted "Waiting for approval"
  rule
  strong "A person decides"
  text "Continue when ready"

start --> ready
ready --> work
work --> approved
approved --> shipped label=inline : yes
approved --> human tone=stop label=inline : no

legend
  pill "status" sample=ready
  box "worker"
  panel tone=stop "human intervention"
```

One `legend` has indented `pill`, `box`, `end`, `panel`, `decision`, `edge`
or `dashed` entries: kind, optional `tone=`, required quoted meaning.
Defaults match nodes; line samples default to ink. Shape entries additionally
accept non-empty `sample=ready` or `sample="two words"` for text inside them.

## Editing a diagram

- Insert between `a` and `b`: declare the new node after `a`, before `b`
  in row order. Replace `a --> b` with `a --> new` and `new --> b`.
  Deliberately preserve or redirect every other connection.
- Remove a step: delete its declaration and incident edges, reconnect its
  predecessor and successor, and update references to its id, including `row=`.
- Put a branch beside its source with explicit `col=side row=source`.
  Reset the next declaration's `col=` if needed.
- Add a column by editing `columns`; put its node in an
  existing row with `col=new-column row=existing-id`, then connect those ids.
- Order shared-side slots spatially: nearer branches take slots nearer
  the main path. On a shared right side, put an upward edge at `right.1`,
  a horizontal branch at `right.2`.
- After inserting/removing rows, review every affected `span=` count to
  preserve its intended coverage.

## Making it look good

Keep main paths downward in one column and branches beside their sources.
Span shared stop panels across incoming rows. Keep labels short;
choose start/end/inline to leave room. Trace all routes before adding a
branch, including existing edges to farther columns; choose sides and slot
order so nested branches and returns avoid crossings.

Common fixes: correct unknown ids/columns; remove duplicate
nodes in a cell; shorten overlapping labels or move them with `label=`;
increase `gap=` for cramped vertical labels; change sides, slots or placement
for edges crossing nodes or edges. A visible crossing gap still needs fixing.

Optional repository check: `mise run check FILE` writes SVG and lists problems.

## Flow playback

Append named `play` sections to a flow. Each step names a node id and lights
that node plus all edges from the previous successful step. The first step
lights only its node; repeating a node needs no edge. Unknown targets or
missing connections diagnose and skip the step, preserving the predecessor.
Scenarios are independent. This complete example can be copied as one block:

```text
flow v0
columns main
box work col=main title="Implement"
decision review "Checks pass?"
end merged "Merged"
work --> review
review --> work tone=rework from=left to=left : fix
review --> merged : yes

play "Clean merge"
  tempo 1.8s
  step work actor="Implementer" "Prepare the change"
  step review 800ms
  step merged

play "One fix round"
  step work
  step review "One more pass is needed"
  step work
  step review
  step merged
```

Grammar: `play ["Name"]`, optional `tempo DURATION` before steps, then
`step TARGET [DURATION] [actor="..."] ["caption"]`. Here strings are JSON
strings: escape quotes with `\"` and backslashes with `\\`; quoted targets
are allowed too. Diagram strings above keep their original syntax. Durations
use seconds or milliseconds (`2.4s`, `800ms`), from 100ms to 60s; default
tempo is 1.6s. Invalid durations diagnose and use the tempo. Omitted actors
use the node's title; omitted captions are empty. `render()` returns the
resolved `timelines` and a full static SVG with parts a host can highlight.
Sequence and fan-out playback are not supported yet and diagnose on each
`play` line. See [loop-play.flow](../examples/loop-play.flow) for three scenarios.

## Fan-out

```
fan-out v0
style branches
step "Record the result"
outcome "Success" reason="Checks passed" destination="Review" tone="done"
outcome "Blocked" reason="A decision is needed" destination="Ask a person" tone="stop"
```

Declare one non-empty `step`, then at least one outcome with required
non-empty text, `reason=` and `destination=`; optional `tone=` accepts every
flow tone, defaulting to a plain box. Fields may appear in any order, once
each. All values are double-quoted JSON strings: escape quotes as `\"`,
backslashes as `\\`. Indentation is optional; blank lines and whole-line
comments work. There are no ids, authored edges or placement keys;
destinations are text. Outcomes stay in source order even with
matching destinations. Before the step, choose `style branches` (default:
step left, branches to outcomes, arrows to destinations with reasons below)
or `style ladder` (step above, rail of dots, reasons below outcomes,
destinations right-aligned, no arrows).

## Sequence

```text
sequence v0
participant Creator
participant Studio tone=system
participant RSSFeed "RSS feed" tone=system
section "Sign in"
Creator --> Studio: Sign in, no show yet
Studio -.-> Creator: Claim existing, Add via RSS, Start from scratch
note over Studio: Session expires after 15 minutes
alt Session exists
Studio --> Studio: Check session
else New session
Studio -.-> Creator: Sign in again
end
```

Declare participants before messages, in column order, with unique one-token
ids, optional flow-quoted titles (no escapes; backslashes are literal) and
optional flow tones, defaulting to `ink`. Requests use `-->` (solid, filled
head); responses use `-.->` (dashed, open head). These match flow line styles;
Mermaid's `->>` and `-->>` are errors. Labels are everything after the first
colon, including quotes. Matching endpoints make a self-message. Indentation,
blank lines and whole-line comments are allowed. Messages keep source order
and are numbered automatically; annotations occupy rows without numbers. The 678px
figure has evenly shared lanes; labels wrap at its right edge, including long
tokens. Narrow hosts scroll horizontally. All sequence text uses `fonts.mono`.

Use UML groups `alt LABEL`, `opt LABEL`, `loop LABEL` or `group LABEL`, closed
by bare `end`; they nest without a depth limit. Only the current `alt` accepts
`else LABEL`. Labels require text and take the unquoted remainder literally,
including arrows, colons, quotes and backslashes. Groups span touched lanes
(all lanes when empty); only the outermost two depths add soft half-opacity
fills. Headings and branch labels wrap.

Use `note over A: text` or `note over A, B: text` for lifeline placement. Ids
must be distinct and already declared; spaces around commas and either order
are fine. The first colon separates ids from non-blank literal note text.
Notes wrap in their own rounded, accented row. Use `section "Title"` for a
phase until the next section or EOF, consistent with flow. Titles are non-blank
flow strings with no trailing text. Sections cannot occur inside groups.

These terms retain clear UML meanings and flow's phase name without aliases.
The eight exact ids `alt`, `opt`, `loop`, `group`, `else`, `end`, `note` and
`section` are reserved. At line start, these keywords followed by whitespace
or EOL take precedence over messages; `loopWorker` is still a valid id.
Invalid annotations diagnose on their lines, remain visible as rejected
source and leave the group/phase state unchanged. Unclosed groups draw to EOF
and diagnose their opening lines. The claim example demonstrates Claim and
Verify phases, an expiry note and the two verification branches; its messages
7–15 remain illustrative handshake details.
