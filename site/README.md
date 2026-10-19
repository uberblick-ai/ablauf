# ablauf.uberblick.ai

The site for ablauf: a landing page at `/` and a showcase at `/showcase`, in
the shell the uberblick.ai sites share (top bar, sidebar, "Who builds this").

```sh
mise run site        # or: node site/build.ts
mise run site-serve  # then open http://127.0.0.1:8000/
```

- `pages/<path>.html` is the page served at `/<path>`: a `<head>` block with
  the title and description, then the page's content. `shell.ts` wraps it.
- `kinds.ts` lists the diagram kinds in showcase order, each with its header
  line, one sentence and its examples from `spike/examples`. A new kind is one
  entry there: it gets its showcase section, a sidebar link and a line on the
  landing page. An example with `editOf` marks the lines it changed or added
  against the example it edits.
- Placeholders in a page: `<!-- example NAME -->`, `<!-- kinds -->` and
  `<!-- showcase -->`.
- Diagrams are rendered by the current renderer at build time, inline and
  themed by the site's tokens. Any diagnostic, a kind whose example has another
  header, or a link to a page that is not built fails the build.
- `static/` is copied as it is. `shared.css` is a copy of uberblick-2's
  `site/static/shared.css`; switch to linking `https://uberblick.ai/shared.css`
  once the new uberblick.ai serves there. `site.css` is what ablauf adds.

`spike/site.test.ts` builds the site in `mise run ci`. Nothing here enters the
npm package.

## Deploying

A Cloudflare Pages project connected to this repository builds the site on
every push to `main`. Its settings are a maintainer step; no token lives in the
repository:

| Setting | Value |
| --- | --- |
| Production branch | `main` |
| Framework preset | None |
| Root directory | empty: the build imports the renderer from `spike/flow` |
| Build command | `node site/build.ts` |
| Build output directory | `site/out` |
| Build watch paths | `site/*`, `spike/flow/*`, `spike/examples/*` |
| `NODE_VERSION` | `26`, as in `mise.toml` (22.18 or newer works) |
| `SITE_URL` | the origin the project serves; omitted, canonical links name `https://ablauf.uberblick.ai` |
| `SITE_NOINDEX` | `1` on a preview host search engines should not index |
| Custom domain | `ablauf.uberblick.ai`; Cloudflare adds the DNS record when the zone is on Cloudflare, otherwise add a CNAME to the project's `pages.dev` host |

The build needs no `pnpm install`: Node strips the renderer's types itself.
Pages serves `404.html` for unknown paths and redirects `/<path>.html` to
`/<path>`, which is why the build writes extensionless pages.
