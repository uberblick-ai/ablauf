# Host page themes

An inline ablauf SVG inherits the host page's `--ab-*` CSS custom properties.
Set them on the document root to follow the page's light/dark switch, including
when the selected theme differs from the system theme. Changing the properties
updates the existing SVG immediately; there is no need to render it again.

## Supported properties

These are the supported properties and their built-in defaults. Playback
properties stay separate from the 18-colour `TOKENS`/`Palette`; the optional
second argument to `checkPalette` adds playback text checks.

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
| `--ab-agent` | Agent tone foreground | `#3e6563` | `#85aaa5` |
| `--ab-agent-bg` | Agent tone background | `#e7eeed` | `#232d2b` |
| `--ab-system` | System tone foreground | `#4f5d76` | `#98a5bf` |
| `--ab-system-bg` | System tone background | `#ebedf3` | `#262a31` |
| `--ab-done` | Done tone foreground | `#536e5a` | `#95b09c` |
| `--ab-done-bg` | Done tone background | `#e8ede9` | `#222a24` |
| `--ab-rework` | Rework tone foreground | `#806752` | `#b29d87` |
| `--ab-rework-bg` | Rework tone background | `#f3f0eb` | `#2c2720` |
| `--ab-stop` | Stop tone foreground | `#815f5a` | `#ac8c88` |
| `--ab-stop-bg` | Stop tone background | `#ede6e5` | `#2b2221` |
| `--ab-play` | Glow of untoned current parts; controls accent | `#0a7a60` | `#6ff0cf` |
| `--ab-play-glow` | Glow blur; literal `0` removes glow | `6px` SVG; `10px` selected tab; `8px` current segment | `6px` SVG; `10px` selected tab; `8px` current segment |
| `--ab-play-unreached-opacity` | Unplayed flow shapes, strokes and arrowheads; CSS number or percentage, clamped to [0, 1] | `0.3` | `0.3` |
| `--ab-play-unreached-text-opacity` | Unplayed flow text; CSS number or percentage, clamped to [0, 1]; contrast preferences force full opacity | `0.8` | `0.8` |
| `--ab-font-text` | Controls body, caption, side-list remark and empty-state face | `system-ui,sans-serif` | `system-ui,sans-serif` |
| `--ab-font-mono` | Controls tabs, buttons, actors and counters/numbers | `ui-monospace,monospace` | `ui-monospace,monospace` |

A tone foreground colours box/end text and outlines, pill dots, edges,
arrowheads, edge labels and legend samples. Its background colours box, end
and panel shapes and their legend samples. Pill labels, panel contents and
legend descriptions use the base text colours; pill shapes use the base
surface and outline colours. The SVG canvas itself is transparent. Set
`--ab-bg` to the host canvas colour so crossing knockouts blend into it;
knockouts over shaded sections use `--ab-band` instead.

Playback never recolours a part: current and played parts keep their tone
colours, dashes and arrowheads, so a stop edge stays a red dashed line and a
pill keeps its dot. The current step glows in its own tone, derived with
`color-mix()`: toned outlines and edges in their tone, a pill in its dot's tone,
and untoned parts in `--ab-play`. Set `--ab-play-glow: 0` to remove the glow
while keeping the heavier outline. Only playing figures run incoming edge dashes
and ease fades; paused and ended figures stay still. Reduced motion disables animation and transitions, while manual
stepping can still show the glow. Built-in controls have matching current-colour
defaults and honour the same host override in automatic and pinned schemes.

In flows, unplayed means neither current nor played while a step is shown,
including after completion. Shapes fade independently with the shape knob;
all node titles, subtitles, panel contents and edge labels fade with the text
knob. Opacity applies to individual shapes and text elements, never groups.
Inline label gaps and crossing knockouts retain opacity multiplier 1 (host
colour alpha still applies). Current and played parts stay fully opaque in
their own tones. Built-in palettes are unchanged: with defaults 0.3/0.8,
off-path text meets a checked 3:1 floor (minima about 3.15 light / 3.94 dark);
static/full-figure text, current/played text and controls keep the 4.5:1 bar.
Under either `prefers-contrast: more` or `forced-colors: active`, off-path flow
text stays fully opaque even with a host text-opacity override. Opacity does
not remove text from the accessibility tree; captions and the polite status
continue to describe the current position. Sequence fading keeps its existing
styling; the two flow knobs and text preference guards do not change it.

Control font defaults are independent of render `fonts`. These properties
update mounted controls immediately through normal CSS inheritance, including
across shadow hosts. Set overrides on a common ancestor of SVG and controls.
SVG text never reads either control-font property: changing them changes no
static or playable SVG bytes, metrics or geometry. Check caption wrapping,
tab overflow and font loading with the actual host fonts in a browser.

Map the host faces once on a common ancestor; per-mount font rules are unnecessary:

```css
:root {
  --ab-font-text: var(--font-sans);
  --ab-font-mono: var(--font-mono);
}
```

Automatic controls inherit the host's CSS `color-scheme`. Their fallback colours
use `light-dark()` and update while mounted: a host pinned light wins over an
OS-dark preference, and vice versa. With inherited `light dark`, the browser
chooses using the user's preference; `normal` keeps its default. Controls from
a pinned-light/dark SVG keep that scheme. Host `--ab-*` overrides win in every
mode. This changes only automatic controls: automatic SVGs still follow the OS,
so set SVG colour properties as well when pinning the whole page theme.
The controls root is transparent and sits on the host surface; set `--ab-bg`
to that surface for opaque button backgrounds and SVG knockouts.

On devices matching `(any-pointer: coarse)`, including mixed fine/coarse devices,
every button (tabs and side-list rows included) and step segment is at least
44px wide and tall. Actions and segments wrap; tabs keep horizontal scrolling.
Fine-only pointers keep compact sizing. All defaults live in the
`ablauf-playback` cascade layer, so ordinary unlayered scoped rules win even if
the host stylesheet precedes the injected style:

```css
.ab-playback { color-scheme: dark; }
.ab-playback button { min-height: 48px; }
.ab-playback .abp-segment { min-width: 48px; }
```

In a shadow mount, put selectors in that shadow root. Scheme and font/colour
properties inherit through its host; document selectors do not cross the boundary.

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
  --ab-agent: #3e6563;
  --ab-agent-bg: #e7eeed;
  --ab-system: #4f5d76;
  --ab-system-bg: #ebedf3;
  --ab-done: #536e5a;
  --ab-done-bg: #e8ede9;
  --ab-rework: #806752;
  --ab-rework-bg: #f3f0eb;
  --ab-stop: #815f5a;
  --ab-stop-bg: #ede6e5;
  --ab-play: #0a7a60;
  --ab-play-glow: 6px;
  --ab-play-unreached-opacity: 0.3;
  --ab-play-unreached-text-opacity: 0.8;
  --ab-font-text: system-ui,sans-serif;
  --ab-font-mono: ui-monospace,monospace;
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
  --ab-agent: #85aaa5;
  --ab-agent-bg: #232d2b;
  --ab-system: #98a5bf;
  --ab-system-bg: #262a31;
  --ab-done: #95b09c;
  --ab-done-bg: #222a24;
  --ab-rework: #b29d87;
  --ab-rework-bg: #2c2720;
  --ab-stop: #ac8c88;
  --ab-stop-bg: #2b2221;
  --ab-play: #6ff0cf;
  --ab-play-glow: 6px;
  --ab-play-unreached-opacity: 0.3;
  --ab-play-unreached-text-opacity: 0.8;
  --ab-font-text: system-ui,sans-serif;
  --ab-font-mono: ui-monospace,monospace;
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

Use the exported `TOKENS`, `Token`, `Palette` and DOM-free `checkPalette`
paint contract. [Test your integration](https://ablauf.uberblick.ai/guides/testing)
shows how to resolve effective colours inside an inline SVG, including a shadow
root, and documents accepted colour forms, composited grounds, font and CSP checks.

`checkPalette(palette, { play, unreachedOpacity, unreachedTextOpacity })` retains
every static pair and adds controls and current/played/unplayed flow text pairs.
`play` and `unreachedOpacity` remain required. Optional `unreachedTextOpacity`
defaults to 0.8 when omitted or undefined, preserving legacy two-field callers.
Both opacities accept finite numbers or trimmed CSS numeric/percentage strings,
clamped to [0, 1]. Invalid/non-finite/unresolved forms throw `TypeError`; extra
keys are ignored. Resolve both knobs through CSS `opacity`, using fallbacks 0.3
and 0.8. Check the media queries: pass effective text opacity **1** when either
contrast preference matches, otherwise the resolved text knob. Reading the
custom property alone misses the guard. `play` is the effective colour with the
same accepted forms and alpha as palette colours. Fonts and glow are not inputs.

Every playback pair has `threshold: 3 | 4.5`. Ordinary off-path flow pairs use 3;
static/full-figure, current/played and controls pairs use 4.5. Separate full-opacity
off-path preference witnesses also use 4.5, identified in `where` by
`(full-opacity contrast preference witness)`. Both sets remain when effective
text opacity is 1. Playback `minimum` is the lowest unrounded ratio among 4.5
pairs; `unreachedMinimum` is the lowest among 3 pairs. Hosts must replace hard-coded
4.5 comparisons with `pair.ratio >= pair.threshold` and report both minima.
Playback pairs may use `ink: "play"`; grounds still use palette tokens.
`inkOpacity` multiplies text alpha over the actual layered ground, independently
of faded fills. Decorative glow/text-shadow is excluded. Focus rings, progress
segments and faded shapes need separate browser non-text review. One-argument
calls retain their existing types, pairs, ratios, minimum and colour validation.
