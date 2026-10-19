# ablauf

A small text format for diagrams that agents write and people read, rendered
as deterministic, themed SVG.

The author decides where everything goes, the way they would draw the figure
by hand. The text records those decisions, so another agent can read and edit
the diagram without looking at the picture. The renderer sizes the grid and
draws; it never moves anything, and it reports every problem with its line
number.

The kinds are routed flows and standalone outcome fan-outs. The formats
are v0; this repository prepares
`@uberblick/ablauf` 0.2.0 for maintainer publication.

## Use in a build script

Requires Node.js 22.18 or newer. The package ships compiled JavaScript and
TypeScript declarations, with no runtime dependencies or TypeScript loader
required. Its public entry point is an ES module.

After 0.2.0 is published, install it in your project:

```sh
npm install @uberblick/ablauf@0.2.0
```

Save this as `render-flow.mjs`:

```js
import { readFile, writeFile } from "node:fs/promises";
import { render } from "@uberblick/ablauf";

const [input, output] = process.argv.slice(2);
if (!input || !output) {
  console.error("Usage: node render-flow.mjs input.flow output.svg");
  process.exit(2);
}

const source = await readFile(input, "utf8");
const { svg, diagnostics } = render(source, {
  idPrefix: "build-flow",
  scheme: "light",
});
await writeFile(output, svg);

for (const { line, severity, message } of diagnostics) {
  console.error(`${input}:${line} ${severity}: ${message}`);
}
// Keep the SVG for inspection, but fail the build on any source problem.
process.exitCode = diagnostics.length ? 1 : 0;
```

Run it with a flow file and the desired output path:

```sh
node render-flow.mjs diagram.flow diagram.svg
```

`render(source, options?)` returns `{ svg, diagnostics, layout }`. Source
problems return diagnostics with one-based `line`, `severity` and `message`
fields while still producing SVG. Invalid caller options can throw.
`idPrefix` defaults to `"ab"`; supply distinct prefixes for diagrams sharing
a page. Omit `scheme` to follow the system theme, or pin it to `"light"` or
`"dark"`. The existing `fonts` option accepts host font families and synchronous
width metrics; see [host fonts and width metrics](docs/plan.md#host-fonts-and-width-metrics).
TypeScript consumers can import `RenderOptions`, `Diagnostic`, `FontOptions`,
`FontsOptions` and `TextStyle` from the same entry point. `LIGHT` and `DARK`
export the default palettes.

## Examples

### A deploy pipeline

```
flow v0
columns fix main manual

pill push col=main tone=muted "push to main"
box build "compile and package"
box test "unit and integration tests"
box staging "deploy to staging"
box smoke "smoke tests"
box production "deploy to production"
end live "Live"

pill failed col=fix row=test tone=rework "checks failed"
box rollback col=fix row=production tone=rework "restore the last release"
panel approve col=manual row=smoke tone=stop
  strong "Release manager"
  muted "approves the release"

push --> build : on push
build --> test
test --> staging : green
staging --> smoke
smoke --> approve tone=stop : passed
approve --> production tone=stop from=bottom to=right label=end : approved
production --> live : healthy
build --> failed tone=rework to=top.2 : fails
test --> failed tone=rework : red
failed --> push tone=rework from=top.1 to=left label=end : fix and push
production --> rollback tone=rework : unhealthy

legend
  pill "event or state"
  box "automated job"
  panel "manual step"
  edge tone=rework "failure path"
```

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/images/deploy-dark.svg">
  <img alt="A deploy pipeline: push, build, test, staging, smoke tests, a release manager's approval, production and live, with failed checks going back to a fix and an unhealthy release rolled back." src="docs/images/deploy-light.svg">
</picture>

- `columns` names the columns left to right. Each node starts a new row unless
  `row=` puts it beside another node.
- Nodes are `text`, `pill`, `box`, `end` or `panel`, coloured by a tone.
- Edges use Mermaid's arrows. `from=` and `to=` pick the sides an edge leaves
  and enters; each pair of sides has one fixed shape.
- `legend` explains the shapes in fine print under the diagram.

[spike/PRIMER.md](spike/PRIMER.md) is the full format on one page, and the
page an agent reads before writing a flow.

For phone widths, [author separate wide and narrow layouts](docs/narrow-layouts.md).
The worked pair keeps the same content and lets the host select a readable SVG.

### An online order

From [spike/examples/checkout.flow](spike/examples/checkout.flow), with two
sections:

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/images/checkout-dark.svg">
  <img alt="An online order: cart, address and payment in a checkout section, then pick, ship and delivered, with a declined card retried and risky orders sent to fraud review." src="docs/images/checkout-light.svg">
</picture>

### The ub-agents delivery loop

The loop [ub-agents](https://github.com/uberblick-ai/ub-agents) runs on
Uberblick's repositories, from
[spike/examples/loop.flow](spike/examples/loop.flow):

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/images/loop-dark.svg">
  <img alt="The ub-agents delivery loop: issue preparation, implementation, review and integration, with a rework column on the left and a person's decision on the right." src="docs/images/loop-light.svg">
</picture>

## Host page themes

Inline SVGs can follow a page's `data-theme="light"` / `data-theme="dark"`
switch through the existing `--ab-*` CSS properties, without rerendering.
See [host page themes](docs/theming.md) for the complete base and tone palette,
copyable host CSS and the difference between inline SVG and image embedding.

## Start here

You need [mise](https://mise.jdx.dev). In a fresh checkout or worktree:

```sh
mise trust && mise run setup
```

| Command | What it does |
| --- | --- |
| `mise run setup` | Installs the pinned Node and pnpm and the locked dependencies. |
| `mise run playground` | Serves the review page at http://localhost:4620 (another port if that one is busy). Open `#examples/loop` to see the loop beside its hand-drawn reference. |
| `mise run check FILE` | Renders one `.flow` file to an `.svg` beside it and lists its problems with line numbers. |
| `mise run render` | Renders every example to `spike/out/` and refreshes the figures in this README. |
| `mise run measure` | Shows what moved between the loop and the loop with a role inserted. |
| `mise run ci` | Lint, typecheck and tests, before you push. |

`pnpm build` emits the package into `dist/`. `npm pack` builds it automatically.
The tests in `mise run ci` install the actual tarball with production dependencies
only in an isolated directory and exercise the public import and this build script.

`mise tasks` lists everything. The plan is in [docs/plan.md](docs/plan.md), and
the spike's results in [spike/FINDINGS.md](spike/FINDINGS.md).

The earlier Mermaid-subset version lives in
[uberblick-ai/old-ablauf](https://github.com/uberblick-ai/old-ablauf).

## License

MIT
