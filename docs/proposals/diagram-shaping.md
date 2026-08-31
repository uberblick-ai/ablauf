# Shaping a dense chart into readable ones

**Status:** a spike. It proposes an agent procedure and works it through one
real chart; nothing here is shipped, and `agent/` is unchanged
([issue #57](https://github.com/uberblick-ai/ablauf/issues/57)).
**Written:** 2026-08-31, against `2dfa042` — after
[#56](https://github.com/uberblick-ai/ablauf/issues/56) made a `<br/>` label
render as multiline text, which §2's rule 5 and §5's first measurement are
written against.

[`../../agent/layout-preserving-edit.md`](../../agent/layout-preserving-edit.md)
teaches a session how to change a chart's meaning without disturbing its
layout. It says nothing about a chart whose *source* mixes several narratives —
one that is dense, not wrong. This is the missing layer: when to decompose such
a chart, into what, and how to prove the decomposition kept every path.

It is agent guidance and an output contract, not runtime layout. ablauf already
draws a decision's binary outcomes from opposite vertices **when the supplied
positions put its targets on opposite sides** — geometric, never label-based
([`../decisions.md`](../decisions.md) D23). Nothing below asks the library to
get smarter.

## 1. A separate procedure, not an extension

**Recommendation: a second file in the pack, not more of
`layout-preserving-edit`.** Four reasons, in order of weight:

- **The central promise differs.** `layout-preserving-edit` exists to say *this
  node does not move* — D6's freeze rule, stated for a reader. Shaping starts
  from an empty store for each new chart, where there is nothing to freeze. Two
  contracts in one file weakens the one that matters most.
- **The trigger differs.** Layout-preserving editing runs on **every** edit.
  Shaping runs when a chart has been measured and found dense, which is rare
  and deliberate. A procedure read on every edit should not carry a section
  that almost never applies.
- **The signature differs.** One chart in, one edit plus a directive list out —
  against one chart in, *several* charts out, each with its own text, its own
  store, and a coverage proof. Different inputs, different outputs.
- **They compose.** Shaping ends by handing each new chart to
  `layout-preserving-edit` for every edit that follows. It sits above that
  procedure, not inside it.

### Inputs

One chart: its semantic source, and its layout store if it has one. Nothing
else — no image, no model, no repository access.

### Outputs

- **Two or more charts.** Each is a semantic source in the mermaid subset, plus
  the directive set that places its nodes. Positions come back from `snap`;
  the procedure never writes a coordinate it computed itself.
- **A coverage inventory.** Every source node, every source edge and every
  branch outcome mapped onto the results, with cross-chart handoffs and
  deliberate duplicates named, and the source meaning of every shortened label
  recorded. §4 is the worked one.
- **The rubric numbers** of §5 for each result.

### Trigger conditions

Measured, not felt. Any one of these fires:

1. **Cold start fails.** `snap(graph, {}, [])` returns any `displaced` or
   `min-clamped` warning — the fallback placer could not seat the graph.
2. **The drawing has defects.** The rendered SVG has an edge crossing a box
   interior, or two edges drawn as one line outside D23's trunk exemption.
3. **A decision is drawn as a box.** Some non-`decision` node has more than one
   outbound edge and at least one of them is labelled.
4. **The canvas is out of proportion.** `svgMeta`'s `width / height` outside
   roughly 0.5–2.0 — a column so tall it cannot be read at one zoom level.

None firing is the answer "this chart is fine": the procedure stops there.

### Boundaries

- It never moves a node in the source chart, and never edits the source
  chart's store. The original is left exactly as it was.
- It never invents a coordinate. Placement is expressed as `rel`/`delta`/
  `cell`/`at` directives and resolved by `snap` (D7).
- It never reads meaning out of a label. A branch is expressed by **placing**
  its targets; D23 turns that into vertices. Sniffing `yes`/`no` was rejected
  once already and is not reintroduced here.
- It never changes what the chart says. Every node, edge and branch outcome
  lands somewhere, and the inventory is what proves it.
- It is not automatic. A session runs the triggers; a human decides to shape.

## 2. The procedure

1. **Measure first.** Run the four triggers of §1 and record the numbers. If
   none fires, stop.
2. **Name the narratives.** One narrative answers one question. Cut where a
   reader would say *and then a different thing happens* — at a park, a
   terminal state, or a handoff to another actor. One chart per narrative.
3. **Cut at handoffs, and draw both ends.** Every cut becomes two nodes: a
   terminal in the upstream chart and an entry in the downstream one, each
   naming the other chart. These are handoffs, and they are recorded as such —
   not as duplicated content.
4. **Make every hidden decision a diamond.** A process box with several
   outbound edges, at least one labelled, *is* a decision. Give it a diamond
   whose text is the question and hang the labelled exits off that. A chart
   with no decision needs no diamond; the rule is that decisions are never
   drawn as boxes, not that every chart must branch.
5. **Shorten labels to one line, and write down what you dropped.** A `<br/>`
   label renders properly since #56, so this is no longer about a defect: a
   two-line label is a taller box, and it is usually a node doing two jobs.
   Break the node or shorten the words; keep the marker only where two lines
   genuinely read better. Every changed label goes in the inventory with its
   source meaning.
6. **Place binary branch targets on opposite sides.** One row below the
   diamond, one target left of its centre and one right — that, and nothing
   else, is what makes the branch read as a choice. A three-way exit takes
   left, right and straight below.
7. **Run `snap`, then re-measure.** Zero warnings and zero drawn defects, on
   every chart, in both themes. Iterate on *placement*: a label is shortened in
   step 5 because it says too much, never to make a box fit a gap.
8. **Prove coverage before handing it over.** The inventory is the deliverable
   that catches a severed path — the failure mode decomposition actually has.

## 3. The worked case

The source is this repository's own issue-review workflow: 13 nodes, 15 edges,
one chart.

```mermaid
flowchart TD
  H[Human + optional LLM] --> I[Short issue intake<br/>needs-preparation]
  I --> P[Issue preparer grounds and shapes]
  P --> T{Mechanical, local,<br/>clear and reversible?}
  T -->|yes| S[Code-grounded self-check]
  T -->|no| A[One fresh issue adversary]
  A -->|clean| Y[ready]
  A -->|correctable| C[Same preparer applies findings]
  A -->|owner boundary| D[needs-decision<br/>one focused question]
  D -->|owner answer| Q[needs-preparation<br/>reuse prior work]
  Q --> R[Refresh affected grounding only]
  S --> Y
  C --> Y
  R --> Y
  P -->|too large| U[Coordination parent<br/>bite-sized child intakes]
  Y --> E[Separate delivery flow]
```

All four triggers fire, with no judgement involved:

- **Cold start:** `min-clamped` on `H`, `P`; `displaced` on `A`, `C`, `D`, `U`,
  `E`. Seven warnings.
- **Drawn defects:** five segments through a box interior, two pairs of edges
  drawn as one line.
- **Hidden decisions:** `P` and `A`.
- **Canvas:** 560 × 1189, ratio 0.47.

The branch defect is worth stating exactly, because it is the one this
procedure is really about. `T` is the only diamond in the chart, and at
(160, 420) its box spans x 32–288, y 373–467. Its `yes` edge leaves at
(117.3, 451.3) and its `no` edge at (202.7, 451.3): **both outcomes leave the
same face**, 85.4px apart on the two slopes either side of the bottom vertex,
because both targets sit straight below it. The picture does not say a choice
was made. Nothing is wrong with the router — D23 gave both endpoints the only
side that faces their counterpart, and fanned them onto it. The positions are
what failed to express the branch.

### The three charts

**Chart 1 — intake and sizing.** *How does a request become one prepared-size
issue?*

```mermaid
flowchart TD
  author[Human or LLM files a request] --> intake[Issue intake, needs-preparation]
  intake --> prep[Preparer grounds and shapes it]
  prep --> fits{Reviewable in one sitting?}
  fits -->|no| parent[Coordination parent, child intakes]
  fits -->|yes| clearance([To clearance, chart 2])
```

```json
{ "author": { "x": 600, "y": 60 },  "intake":    { "x": 600, "y": 200 },
  "prep":   { "x": 600, "y": 340 }, "fits":      { "x": 600, "y": 480 },
  "parent": { "x": 200, "y": 640 }, "clearance": { "x": 1000, "y": 640 } }
```

**Chart 2 — clearance to ready.** *How does a shaped issue earn `ready`?*

```mermaid
flowchart TD
  shaped([From intake, chart 1]) --> trivial{Mechanical, local, clear, reversible?}
  trivial -->|yes| selfcheck[Code-grounded self-check]
  trivial -->|no| adversary[One fresh issue adversary]
  adversary --> verdict{Adversary verdict?}
  verdict -->|clean| ready[ready]
  verdict -->|correctable| applyfix[Same preparer applies findings]
  verdict -->|owner boundary| parked([To owner decision, chart 3])
  selfcheck --> ready
  applyfix --> ready
  ready --> delivery([Separate delivery flow])
```

```json
{ "shaped":    { "x": 700,  "y": 60 },  "trivial": { "x": 700,  "y": 180 },
  "selfcheck": { "x": 300,  "y": 320 }, "adversary": { "x": 1100, "y": 320 },
  "verdict":   { "x": 1100, "y": 460 }, "parked":  { "x": 1500, "y": 460 },
  "applyfix":  { "x": 1100, "y": 600 }, "ready":   { "x": 700,  "y": 740 },
  "delivery":  { "x": 700,  "y": 880 } }
```

**Chart 3 — owner decision and return.** *What happens to a parked question?*

```mermaid
flowchart TD
  parked[needs-decision, one focused question] -->|owner answer| requeued[needs-preparation, reuse prior work]
  requeued --> refresh[Refresh affected grounding only]
  refresh --> ready([ready, back to chart 2])
```

```json
{ "parked":  { "x": 500, "y": 60 },  "requeued": { "x": 500, "y": 200 },
  "refresh": { "x": 500, "y": 340 }, "ready":    { "x": 500, "y": 480 } }
```

Chart 3 has no decision, so it has no diamond. That is rule 4 read as written:
a decision is never drawn as a box, and a chart with no branch does not need
one invented for it.

### Both observations, for each chart

**Valid mermaid.** mermaid 11.17.2 was installed in this run's scratch and
asked to `parse` and `render` each source *unchanged* — the same bytes, no
adaptation. All four sources, the original included, parse; all four render,
and the graph mermaid builds has the same counts ablauf's `parse` returns:
13/15, 6/5, 9/10, 4/3 nodes and edges. The render ran under jsdom with
`getBBox` stubbed, because mermaid's renderer measures text and jsdom has no
layout engine — so mermaid's *geometry* there is meaningless and is not
claimed. What the check establishes is that mermaid accepts the source and
reads the same graph out of it; geometry lives outside the source anyway (D4),
so a picture-for-picture comparison would not mean anything.

**Warning-free in ablauf.** `parse` → `snap` → `toSvg` over the positions
above: **zero warnings on all three charts**, no two boxes overlapping, and
zero drawn defects in both shipped themes. The numbers are in §5.

## 4. The coverage inventory

Every source node, and where it went.

| Source | Label | Lands in | As | Label there |
|---|---|---|---|---|
| `H` | Human + optional LLM | 1 | `author` | Human or LLM files a request |
| `I` | Short issue intake `<br/>` needs-preparation | 1 | `intake` | Issue intake, needs-preparation |
| `P` | Issue preparer grounds and shapes | 1 | `prep` | Preparer grounds and shapes it |
| `U` | Coordination parent `<br/>` bite-sized child intakes | 1 | `parent` | Coordination parent, child intakes |
| `T` | Mechanical, local, `<br/>` clear and reversible? | 2 | `trivial` | Mechanical, local, clear, reversible? |
| `S` | Code-grounded self-check | 2 | `selfcheck` | unchanged |
| `A` | One fresh issue adversary | 2 | `adversary` | unchanged |
| `C` | Same preparer applies findings | 2 | `applyfix` | unchanged |
| `Y` | ready | 2 | `ready` | unchanged |
| `E` | Separate delivery flow | 2 | `delivery` | unchanged |
| `D` | needs-decision `<br/>` one focused question | 3 | `parked` | needs-decision, one focused question |
| `Q` | needs-preparation `<br/>` reuse prior work | 3 | `requeued` | needs-preparation, reuse prior work |
| `R` | Refresh affected grounding only | 3 | `refresh` | unchanged |

Every source edge. Fifteen in, fifteen accounted for.

| # | Source edge | Becomes |
|---|---|---|
| 1 | `H --> I` | 1: `author --> intake` |
| 2 | `I --> P` | 1: `intake --> prep` |
| 3 | `P --> T` | **split at the chart-1/2 cut**: 1 `fits -->\|yes\| clearance`, 2 `shaped --> trivial` |
| 4 | `P -->\|too large\| U` | 1: `fits -->\|no\| parent` |
| 5 | `T -->\|yes\| S` | 2: `trivial -->\|yes\| selfcheck` |
| 6 | `T -->\|no\| A` | 2: `trivial -->\|no\| adversary` |
| 7 | `A -->\|clean\| Y` | 2: `adversary --> verdict` then `verdict -->\|clean\| ready` |
| 8 | `A -->\|correctable\| C` | 2: `verdict -->\|correctable\| applyfix` |
| 9 | `A -->\|owner boundary\| D` | 2: `verdict -->\|owner boundary\| parked` — **the chart-2/3 cut** |
| 10 | `D -->\|owner answer\| Q` | 3: `parked -->\|owner answer\| requeued` |
| 11 | `Q --> R` | 3: `requeued --> refresh` |
| 12 | `R --> Y` | 3: `refresh --> ready` |
| 13 | `S --> Y` | 2: `selfcheck --> ready` |
| 14 | `C --> Y` | 2: `applyfix --> ready` |
| 15 | `Y --> E` | 2: `ready --> delivery` |

**Branch outcomes.** `T`'s two (`yes`, `no`) are chart 2's `trivial`. `A`'s
three settled adversary outcomes — `clean`, `correctable`, `owner boundary`
([`../../.agents/roles/issue-adversary.md`](../../.agents/roles/issue-adversary.md))
— are chart 2's `verdict`, all three drawn, including the one that leads
somewhere new. `P`'s implicit sizing choice, whose only labelled exit was
`too large`, is chart 1's `fits`.

**Cross-chart handoffs** — four nodes, two cuts, both drawn from both sides:

| Cut | Upstream terminal | Downstream entry |
|---|---|---|
| chart 1 → 2 | `clearance([To clearance, chart 2])` | `shaped([From intake, chart 1])` |
| chart 2 → 3 | `parked([To owner decision, chart 3])` | `parked[needs-decision, one focused question]` |

**Deliberate duplicates** — two, both terminal:

- `ready` appears in chart 2 as the state itself and in chart 3 as the state
  the return path re-enters. The alternative — a third handoff pair — costs two
  nodes to say what one word already says.
- `parked` names the same state on both sides of the chart-2/3 cut. In chart 2
  it is the exit; in chart 3 it is the subject.

**Two nodes with no source counterpart**, both from rule 4: `fits` (chart 1)
and `verdict` (chart 2). Each carries the labelled exits of a source node that
was drawn as a box — `P` and `A`. They add no meaning; they relocate it.

**One thing the source does not say, and neither do the results.** `U`
(`parent`) is terminal: the source never draws the child intakes re-entering
the flow. Shaping preserved that, rather than inventing the edge. Recording the
gap is the procedure's job; closing it is the chart author's.

## 5. Eyes-on, and the rubric

Both shipped themes, one file each, the same geometry with a different palette
(D5/D21). The reader's colour scheme picks the file.

| Before — one chart, 13 nodes |
| :---: |
| <picture><source media="(prefers-color-scheme: dark)" srcset="../assets/shaping-before-dark.svg"><img src="../assets/shaping-before.svg" alt="The issue-review workflow as a single tall chart: a narrow column of thirteen boxes over 1189px, the decision diamond's yes and no edges both leaving its lower slopes, and the no edge crossing the box beneath it"></picture> |

| 1 — intake and sizing | 2 — clearance to ready | 3 — owner decision |
| :---: | :---: | :---: |
| <picture><source media="(prefers-color-scheme: dark)" srcset="../assets/shaping-intake-dark.svg"><img src="../assets/shaping-intake.svg" alt="Four boxes down a centre column into a Reviewable in one sitting? diamond, whose no branch leaves the left vertex to a coordination parent and whose yes branch leaves the right vertex to a handoff into chart 2"></picture> | <picture><source media="(prefers-color-scheme: dark)" srcset="../assets/shaping-clearance-dark.svg"><img src="../assets/shaping-clearance.svg" alt="A Mechanical, local, clear, reversible? diamond branching left to a self-check and right to an adversary, the adversary feeding an Adversary verdict? diamond whose three exits leave its left, bottom and right vertices to ready, the fix step and a handoff into chart 3"></picture> | <picture><source media="(prefers-color-scheme: dark)" srcset="../assets/shaping-decision-dark.svg"><img src="../assets/shaping-decision.svg" alt="A straight four-box column: needs-decision, an owner answer edge into needs-preparation, refresh affected grounding, and ready"></picture> |

The rubric is five measurements, each one a number a later session can
reproduce. The first four predicates already exist in this repository —
`polylines`, `cuts`, `retraces`, `trunk` and `defects` in
[`../../scripts/readme-images.mjs`](../../scripts/readme-images.mjs), which are
the same `throughBoxes` and `retraced` pins `test/render.test.ts` runs over the
goldens. Re-apply them; do not write a second copy.

| Measurement | How | Before | 1 | 2 | 3 |
|---|---|---|---|---|---|
| **Label legibility** | longest label in characters; labels drawn over two lines | 48, **5 of 13 two-line** | 34, 0 | 37, 0 | 36, 0 |
| **Branch origin** | for each diamond, which vertex each outbound edge leaves | `T`: **both exits fanned onto the bottom vertex's slopes**, (117.3, 451.3) and (202.7, 451.3) | `fits`: left / right | `trivial`: left / right; `verdict`: left / bottom / right | none |
| **Edge retracing** | `retraces` pairs, minus D23's trunk exemption | **2** | 0 | 0 | 0 |
| **Node crossings** | `cuts` — segments through a box interior | **5** | 0 | 0 | 0 |
| **Canvas proportions** | `svgMeta` `width / height` | 560 × 1189 = **0.47** | 1127 × 689 = 1.64 | 1646 × 929 = 1.77 | 646 × 529 = 1.22 |
| *(and the cold start)* | `snap` warnings | **7** | 0 | 0 | 0 |

Two notes on reading it. The five defects in *Before* include `T -> S` and
`T -> A` leaving through `T`'s own box interior, which is the fanned-anchor
case D23 describes and not a router bug. And the three results are wider than
the source is: decomposition buys proportion with width, which is the axis a
reader has.

## 6. What this needs next

Three candidate units, smallest first. None is created by this spike.

1. **Ship the procedure** as a second pack file beside
   `layout-preserving-edit.md`, with `scripts/check-agent-pack.mjs` extended to
   cover it. Blocked on where the pack lands — issue #60 may move it.
2. **Make the triggers runnable.** Lift `readme-images.mjs`'s legibility
   predicates into one shared module that the script, the render tests and a
   chart-level check all import, so the rubric of §5 is a command rather than a
   paragraph. Independently useful: it removes the third copy of `throughBoxes`.
3. **A shaped pair in the legibility ladder** — the before chart and one result
   as scenarios, so the gallery carries the comparison instead of this
   document's committed SVGs.

And the confirmation the spike owes its charter, stated plainly:

- **No runtime model dependency.** The procedure is prose the user's own
  session follows; ablauf gains nothing and imports nothing (D10).
- **No graph-aware auto-layout.** Every position above came from a directive
  through `snap`. Nothing inspected the graph to decide where a node goes (D7).
- **No label-based branch routing.** `fits`, `trivial` and `verdict` express
  their branches by where their targets sit. D23 read the geometry and never
  the words `yes`, `no`, `clean` or `owner boundary` (D4/D23).
