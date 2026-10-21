# Source-only authoring comparison for issue #70

Evidence for [#70](https://github.com/uberblick-ai/ablauf/issues/70).
The final guide has 998 whitespace-separated words. This is documentation
work: no parser, layout, SVG, format, reference example or approval changed.

## Method and exact prompt construction

Twelve fresh `codex exec` sessions on 2026-10-21, using codex-cli 0.159.3:
three baseline tasks, three first-pilot tasks, three second-pilot tasks and
three final-guide tasks. Each session received exactly the prompt template
below, substituting one guide and one task. No conversation was resumed.

All sessions used the same CLI model and reasoning defaults, without a model
or reasoning override, and with `--ignore-user-config`. Other shared arguments
were `--ephemeral --sandbox read-only --skip-git-repo-check`,
`-c project_doc_max_bytes=0`, `-c web_search="disabled"`, `--json` and
`--output-last-message`. The working directory was an empty directory outside
the repository. Prompts were passed on stdin, not through files the author
could inspect. No repository instructions were loaded. The event exports
contained no tool calls in any session: no filesystem, web, other agents,
check tool or diagnostic feedback reached an author. Only returned sources
and event-type metadata were inspected; implementation reasoning was not used.

Guide inputs (each including its final newline):

| Condition | Guide | SHA-256 |
| --- | --- | --- |
| Baseline (`old`) | [original primer at 80d0adca5b1b875f3f4948eda6ecda0477affa69](https://github.com/uberblick-ai/ablauf/blob/80d0adca5b1b875f3f4948eda6ecda0477affa69/spike/PRIMER.md) | `cc46bc3d38e91e526dfe85af5d87a65f7975d7638cd8a95aa57877f322e56afc` |
| First pilot | [pilot-guide.md](pilot-guide.md) | `05f94c1698cabeb4e88b65f34954b9a0a7748976c0096d1d38d5b909f920f6b4` |
| Second pilot | [pilot2-guide.md](pilot2-guide.md) | `143991698e5dd8b16f8ac3ad6b106d0dfbf8107b565c1d4947c542e9ffc81e49` |
| Final (`new`) | [spike/PRIMER.md](../../PRIMER.md) in this change | `b1997f9ec5e53a6429091b083a4ffb1bf27d42e8abe6f3c5dba42f5073524933` |

Exact prompt template (`{guide}` and `{task}` denote literal substitutions;
the template ends with a newline):

```text
You are an ablauf author in a controlled documentation trial. Use only the AUTHORING GUIDE and TASK INPUT supplied below. Do not use any tools, repository files, web, check tool, other agents, or diagnostic feedback. Return only complete ablauf source, with no Markdown fences or explanation. This is your only submission.

AUTHORING GUIDE
{guide}
END AUTHORING GUIDE

TASK INPUT
{task}
END TASK INPUT
```

For tasks 1 and 2, replace `{loop}` with the complete, unmodified bytes of
[spike/examples/loop.flow at the baseline commit](https://github.com/uberblick-ai/ablauf/blob/80d0adca5b1b875f3f4948eda6ecda0477affa69/spike/examples/loop.flow).
That supplied source includes its legend and final newline; all four
conditions got identical task inputs. Task 3 has no attached source.

Task 1 (`insert`):

```text
Edit the complete source below. Insert a box with id security-review, visible title "Security review", and subtitle "checks security implications", between reviewer and ready-to-merge on the main path. Keep all existing behavior, connections, labels, styling and row alignments except what this insertion requires. Keep the human panel covering needs-review through ready-to-merge. Return the entire edited diagram.

{loop}
```

Task 2 (`column`):

```text
Edit the complete source below. Add a named audit column and a box with id auditor, visible title "Auditor", and subtitle "records the outcome", in integrator's existing row. Connect integrator to auditor with a solid edge. Preserve all existing nodes, connections, styling and row alignments. You may choose column order and edge sides/slots to keep routes clear. Return the entire edited diagram.

{loop}
```

Task 3 (`write`, no trailing newline within the substitution):

```text
Write a new diagram for this deployment process. An automated Build step leads to a decision "Do tests pass?". Yes leads down to an automated Deploy step, then a final "Released" state. No leads to a Fix step beside the decision, then returns to Build. Give the two decision exits labels, distinguish success from rework with tones, and include a legend explaining the automated steps and rework edges. Use readable box titles and useful subtitles. Return the entire diagram.
```

## Returned sources and first renders

Each linked source is the author's first and only submission in its session,
with a final newline added where absent. No submitted diagram was repaired.
Each was rendered independently afterward with `mise run check FILE`;
no diagnostics were sent back to its author.

| Condition | Insert | Add column | Write |
| --- | --- | --- | --- |
| Baseline | [old-insert.flow](old-insert.flow): no problems | [old-column.flow](old-column.flow): no problems | [old-write.flow](old-write.flow): no problems |
| First pilot | [pilot-insert.flow](pilot-insert.flow): no problems | [pilot-column.flow](pilot-column.flow): 1 warning | [pilot-write.flow](pilot-write.flow): no problems |
| Second pilot | [pilot2-insert.flow](pilot2-insert.flow): no problems | [pilot2-column.flow](pilot2-column.flow): no problems | [pilot2-write.flow](pilot2-write.flow): no problems |
| Final | [new-insert.flow](new-insert.flow): no problems | [new-column.flow](new-column.flow): no problems | [new-write.flow](new-write.flow): no problems |

The first pilot's complete diagnostic was:

```text
pilot-column.flow:52 warning: edge integrator → human crosses integrator → auditor
1 problem(s)
```

That result preserved the requested row alignment but left the old upward
route crossing the new horizontal branch. The second pilot added the explicit
shared-right-side recipe: upward edge at `right.1`, horizontal branch at
`right.2`. All three tasks were then repeated with fresh authors. The final
guide also corrected the panel description: panels display their children,
not a heading from node text. All three final tasks were repeated again with
fresh authors using the exact final guide above.

## Independent outcome checks

Besides rendering, parsed models and rendered geometry were checked after
submission. Every submitted source fulfilled its task:

- All four insertions declare `security-review` immediately between
  `reviewer` and `ready-to-merge`, in the main column with a new row. They
  remove the superseded direct edge, add the two replacement edges, retain
  all other original connections and labels, and increase the human panel's
  span from 3 to 4.
- All four column edits add the named column, the requested readable box
  and a solid edge. `row=integrator` resolves correctly; the rendered vertical
  centres of auditor and integrator match. Every original node retains its
  column, row reference, kind, text, tone, section and children; every original
  connection and label remains, allowing side/slot changes as requested.
- All four new diagrams have automated Build and Deploy boxes, a test
  decision with labelled yes/no exits, Fix beside the decision, a return to
  Build, a Released end state, success/rework tones and the requested legend.
- Light and dark renders have identical diagnostics for every submission.

The final guide's two complete examples were extracted and checked with
`mise run check FILE`: both reported `no problems`. `mise run ci` passed
lint, typecheck and all 182 tests. `mise run render` reported zero diagnostics
for all 15 reference examples and left their SVGs unchanged.

This small, iterative comparison supports the final short guide's adequacy
for these tasks. It does not establish a general improvement over the full
primer, whose three baseline submissions were also clean.

## Rules retained in the plan

[docs/plan.md](../../../docs/plan.md) retains centre reservation and slot
distribution in Format rules; inline and vertical label clearance, crossing
knockouts and host background tokens, gap combination and invalid cases,
text sizing/wrapping and neutral host overrides in Format/Rendering rules;
sample edge cases in Format rules; and fan-out canvas, wrapping and malformed
input behavior in Standalone fan-out v0. Its editing section now agrees with
the guide on edge replacement, row order, column inheritance and span review.
`AGENTS.md` and `.agents/ub_agents.md` still identify the same stable primer
path as the authoring entry point.
