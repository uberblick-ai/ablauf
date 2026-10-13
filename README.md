# ablauf

A small text format for diagrams that agents write and people read, rendered
as deterministic, themed SVG.

The first kind is a routed flow: one main path, a side column on each side,
and horizontal sections. Work in progress; nothing is published from this
repository yet.

The earlier Mermaid-subset version lives in
[uberblick-ai/old-ablauf](https://github.com/uberblick-ai/old-ablauf).

## Getting started

You need [mise](https://mise.jdx.dev). It provides Node 26, which runs the
TypeScript directly, so there is nothing else to install.

```sh
mise trust && mise install
mise run render        # spike/examples/*.flow -> spike/out/*.svg, with diagnostics
mise run check FILE    # one .flow file -> an .svg beside it, with its problems
mise run measure       # what moved between loop and loop-insert
mise run test
```

With `mise activate` in your shell, entering the checkout prints this list.
`mise run welcome` prints it on demand, and `mise tasks` lists everything. The
playground isn't built yet; its plan is in [docs/playground.md](docs/playground.md).
