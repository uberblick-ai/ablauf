# ablauf

A small text format for diagrams that agents write and people read, rendered
as deterministic, themed SVG.

The first kind is a routed flow: one main path, a side column on each side,
and horizontal sections. Work in progress; nothing is published from this
repository yet.

The earlier Mermaid-subset version lives in
[uberblick-ai/old-ablauf](https://github.com/uberblick-ai/old-ablauf).

## Start here

You need [mise](https://mise.jdx.dev). In a fresh checkout or worktree, run
`mise trust` once. With `mise activate`, entering the directory installs
dependencies and lists the common commands.

| Command | What it does |
| --- | --- |
| `mise run playground` | Serves the review page at http://localhost:4620 (another port if that one is busy). Open `#examples/loop` to see the loop beside its hand-drawn reference. |
| `mise run check FILE` | Renders one `.flow` file to an `.svg` beside it and lists its problems with line numbers. |
| `mise run render` | Renders every example in `spike/examples/` to `spike/out/`. |
| `mise run measure` | Shows what moved between the loop and the loop with a role inserted. |
| `mise run ci` | Lint, typecheck and tests, before you push. |

`mise tasks` lists everything. The format is described in
[spike/PRIMER.md](spike/PRIMER.md), the plan in [docs/plan.md](docs/plan.md),
and the spike's results in [spike/FINDINGS.md](spike/FINDINGS.md).
