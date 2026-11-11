# Writing and editing ablauf

You choose placement; the renderer sizes and draws without moving nodes or
rerouting edges. Save as `.flow`. [Renderer details](plan.md).

[Flows, sequences and fan-outs support play sections and timelines](plan.md#playback).
The browser player and built-in controls play either kind.

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

Inputs to one decision's top port may share only the coincident portion of
their final straight segments entering from above, including unequal-length
segments, when their tone and solid/dashed style match. Earlier overlaps on
those paths, other targets or ports, and mismatched styles still diagnose.
Static figures stroke the shared portion once with one matching arrowhead;
with `play` sections, each incoming edge keeps its complete stroke and
arrowhead in its own playback part, so either path highlights independently.
Placement, routes and labels stay as authored; no extra syntax is needed.

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
resolved `timelines` and a full static SVG with parts the existing browser
player and controls can highlight. See [loop-play.flow](../examples/loop-play.flow)
for three flow scenarios, and the fan-out and sequence forms below.

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

Append play sections to either style, targeting the exact parsed outcome text
(case and whitespace included). This complete form is copyable:

```text
fan-out v0
style branches
step "Record the result"
outcome "Success" reason="Checks passed" destination="Review" tone="done"
outcome "Blocked" reason="A decision is needed" destination="Ask a person" tone="stop"

play "Compare outcomes"
  tempo 2.4s
  step "Success" "The work is ready for review"
  step "Blocked" actor="Maintainer" "Resolve the decision"
play "Successful run"
  step "Success"
```

Unknown or duplicate-text ambiguous targets diagnose the play step's line and
skip it. Missing/whitespace-only outcomes and their synthetic placeholders are
not targets. Actors default to outcome text. Each step lights its complete
outcome and effect; the shared step and ladder rail always stay visible.
Outcomes are independent, with no path qualification; use a routed flow for
multi-hop branching. See [approvals-play.flow](../examples/approvals-play.flow)
and [run-endings-ladder-play.flow](../examples/run-endings-ladder-play.flow).

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

### Sequence playback

Append the same `play` sections to a sequence. Targets are positive decimal
message numbers as drawn in the gutter: `9` and `09` both select message 9.
Participant ids, zero, numbers beyond the last message and other invalid
tokens diagnose their original step lines and skip those steps. Consecutive
steps may skip messages or branches and need no connection. For example:

```text
sequence v0
participant Creator
participant Studio tone=system
section "Check"
Creator --> Studio: Enter code
Studio --> Studio: Check code and expiry
alt Code matches
Studio -.-> Creator: The show is yours
else Wrong code
Studio -.-> Creator: Try again
end

play "Correct code"
  tempo 1.8s
  step 01 "Type the code"
  step 2
  step 3
play "Wrong code"
  step 1
  step 2 actor="Verifier" "Compare code and expiry"
  step 4
```

The default actor uses participant titles as `Sender → Receiver`, or the title
alone for a self-message; `actor=` overrides it. Durations, captions, names
and JSON quoting follow the shared grammar above.

Each step lights its complete message row, both participant headers and
attached annotations. Every note in an uninterrupted run immediately after
a message attaches to it; every section, group-opening or `else` label in an
uninterrupted run immediately before a message attaches to it. Blank/comment
lines and invisible `end` rows do not break adjacency. Other visible row kinds
break the run: `section` + `alt` + message attaches both labels, but a note
between a heading and a message prevents that heading attaching.

Parts neither current nor played fade, including unused headers and unattached
annotations. Structural lines/backgrounds and rejected source stay visible.
Current message strokes glow and thicken while preserving their tone and dash
pattern; their numbers become bold in the play colour. Current header dots
grow and glow. Sequences do not run dashes. Only fading and dot growth ease
while playing; manual steps are instant and reduced motion removes transitions.
Idle shows the full figure. See [claim-play.flow](../examples/claim-play.flow)
for both complete claim scenarios.
