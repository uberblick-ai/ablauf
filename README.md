# ablauf

A small text format for diagrams that agents write and people read, rendered
as deterministic, themed SVG.

The author decides where everything goes, the way they would draw the figure
by hand. The text records those decisions, so another agent can read and edit
the diagram without looking at the picture. The renderer sizes the grid and
draws; it never moves anything, and it reports every problem with its line
number.

The first kind is a flow. Early work: the format is v0 and nothing is published
from this repository yet.

## Example

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

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/images/primer-dark.svg">
  <img alt="The example flow: needs-work leads to worker, which ends in Finished, sends failures to retry and back, and stops at a person when stuck." src="docs/images/primer-light.svg">
</picture>

- `columns` names the columns left to right. Each node starts a new row unless
  `row=` puts it beside another node.
- Nodes are `text`, `pill`, `box`, `end` or `panel`, coloured by a tone.
- Edges use Mermaid's arrows. `from=` and `to=` pick the sides an edge leaves
  and enters; each pair of sides has one fixed shape.

[spike/PRIMER.md](spike/PRIMER.md) is the full format on one page, and the
page an agent reads before writing a flow.

## A larger flow

The ub-agents delivery loop, from 49 lines in
[spike/examples/loop.flow](spike/examples/loop.flow):

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/images/loop-dark.svg">
  <img alt="The ub-agents delivery loop: issue preparation, implementation, review and integration, with a rework column on the left and a person's decision on the right." src="docs/images/loop-light.svg">
</picture>

## Start here

You need [mise](https://mise.jdx.dev). In a fresh checkout or worktree, run
`mise trust` once. With `mise activate`, entering the directory installs
dependencies and lists the common commands.

| Command | What it does |
| --- | --- |
| `mise run playground` | Serves the review page at http://localhost:4620 (another port if that one is busy). Open `#examples/loop` to see the loop beside its hand-drawn reference. |
| `mise run check FILE` | Renders one `.flow` file to an `.svg` beside it and lists its problems with line numbers. |
| `mise run render` | Renders every example to `spike/out/` and refreshes the figures in this README. |
| `mise run measure` | Shows what moved between the loop and the loop with a role inserted. |
| `mise run ci` | Lint, typecheck and tests, before you push. |

`mise tasks` lists everything. The plan is in [docs/plan.md](docs/plan.md), and
the spike's results in [spike/FINDINGS.md](spike/FINDINGS.md).

The earlier Mermaid-subset version lives in
[uberblick-ai/old-ablauf](https://github.com/uberblick-ai/old-ablauf).

## License

MIT
