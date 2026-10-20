# Host page themes

An inline ablauf SVG inherits the host page's `--ab-*` CSS custom properties.
Set them on the document root to follow the page's light/dark switch, including
when the selected theme differs from the system theme. Changing the properties
updates the existing SVG immediately; there is no need to render it again.

## Supported properties

These are the complete palette and the built-in defaults:

| Property | Use | Light | Dark |
| --- | --- | --- | --- |
| `--ab-bg` | Canvas colour for edge-crossing knockouts | `#ffffff` | `#171c24` |
| `--ab-ink` | Main text, including pill labels and panel text | `#17202c` | `#e5e9ef` |
| `--ab-muted` | Secondary text, ink/muted tone foregrounds and edges | `#5a6575` | `#98a2b0` |
| `--ab-line` | Ink/muted outlines, pill outlines and separator rules | `#d3d9e2` | `#2c3440` |
| `--ab-band` | Shaded section backgrounds | `#e9eef5` | `#151b23` |
| `--ab-surface` | Pill and ink/muted node backgrounds | `#ffffff` | `#1d232d` |
| `--ab-neutral` | Neutral tone foreground | `#59616c` | `#b6bbc3` |
| `--ab-neutral-bg` | Neutral tone background | `#e1e3e6` | `#303640` |
| `--ab-agent` | Agent tone foreground | `#3f6562` | `#80b3ad` |
| `--ab-agent-bg` | Agent tone background | `#e6efed` | `#202d2c` |
| `--ab-system` | System tone foreground | `#465b83` | `#98acd2` |
| `--ab-system-bg` | System tone background | `#eaedf4` | `#232a38` |
| `--ab-done` | Done tone foreground | `#4c7155` | `#8cbb9a` |
| `--ab-done-bg` | Done tone background | `#e6eee8` | `#1f2b22` |
| `--ab-rework` | Rework tone foreground | `#8c6544` | `#c4a078` |
| `--ab-rework-bg` | Rework tone background | `#f6f0e6` | `#2d271d` |
| `--ab-stop` | Stop tone foreground | `#925149` | `#c68981` |
| `--ab-stop-bg` | Stop tone background | `#f1e5e3` | `#301f1d` |

A tone foreground colours box/end text and outlines, pill dots, edges,
arrowheads, edge labels and legend samples. Its background colours box, end
and panel shapes and their legend samples. Pill labels, panel contents and
legend descriptions use the base text colours; pill shapes use the base
surface and outline colours. The SVG canvas itself is transparent. Set
`--ab-bg` to the host canvas colour so crossing knockouts blend into it;
knockouts over shaded sections use `--ab-band` instead.

## Complete host CSS

Copy this into the host page's stylesheet and embed the rendered `<svg>`
directly in the page. The values below reproduce the built-in palettes; replace
them with your page's colours as needed. Set every property for each theme to
keep the whole palette consistent when the system and page themes disagree.

```css
:root[data-theme="light"] {
  --ab-bg: #ffffff;
  --ab-ink: #17202c;
  --ab-muted: #5a6575;
  --ab-line: #d3d9e2;
  --ab-band: #e9eef5;
  --ab-surface: #ffffff;
  --ab-neutral: #59616c;
  --ab-neutral-bg: #e1e3e6;
  --ab-agent: #3f6562;
  --ab-agent-bg: #e6efed;
  --ab-system: #465b83;
  --ab-system-bg: #eaedf4;
  --ab-done: #4c7155;
  --ab-done-bg: #e6eee8;
  --ab-rework: #8c6544;
  --ab-rework-bg: #f6f0e6;
  --ab-stop: #925149;
  --ab-stop-bg: #f1e5e3;
}

:root[data-theme="dark"] {
  --ab-bg: #171c24;
  --ab-ink: #e5e9ef;
  --ab-muted: #98a2b0;
  --ab-line: #2c3440;
  --ab-band: #151b23;
  --ab-surface: #1d232d;
  --ab-neutral: #b6bbc3;
  --ab-neutral-bg: #303640;
  --ab-agent: #80b3ad;
  --ab-agent-bg: #202d2c;
  --ab-system: #98acd2;
  --ab-system-bg: #232a38;
  --ab-done: #8cbb9a;
  --ab-done-bg: #1f2b22;
  --ab-rework: #c4a078;
  --ab-rework-bg: #2d271d;
  --ab-stop: #c68981;
  --ab-stop-bg: #301f1d;
}
```

The switch changes the root attribute, for example:

```js
document.documentElement.dataset.theme = "dark";
// To switch back:
document.documentElement.dataset.theme = "light";
```

The renderer does not interpret `data-theme` itself: the host CSS maps that
attribute to the supported properties. Page CSS reaches **inline SVG**. It
does not reach an SVG loaded through `<img>` or a `<picture>` image source,
which has its own document and styles.

Without host overrides, SVGs automatically follow `prefers-color-scheme`.
The render option `scheme: "light"` or `scheme: "dark"` pins the fallback
palette and omits the media query. Host `--ab-*` overrides take precedence
even with a pinned scheme. An omitted property keeps its automatic or pinned
fallback, so partial overrides can mix palettes.

## Verify a page integration

With the CSS above and an inline diagram containing all tones, emulate
each system colour scheme in browser developer tools. Under **each** system
scheme, switch the root attribute light → dark → light without replacing the
SVG. Check node text, outlines and fills, edges, arrowheads, edge labels and
legend samples. All should follow the host palette, including host light on
system dark and host dark on system light.

Remove the host CSS and check that the automatic SVG follows the emulated
system scheme. Render once with each pinned `scheme` and check that its
fallback stays fixed under both system settings. Reapply the host CSS to
confirm that its overrides also work for pinned SVGs.
