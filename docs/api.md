# API

The package has two entry points: `@uberblick/ablauf` renders source to SVG,
and `@uberblick/ablauf/playback` plays rendered flows in a browser. Both are
ES modules, ship TypeScript declarations and are safe to import without browser
globals.

## render

`render(source, options?)` returns `{ svg, diagnostics, layout, timelines }`. Source
problems return diagnostics with one-based `line`, `severity` and `message`
fields while still producing SVG. Invalid caller options can throw.
`idPrefix` defaults to `"ab"`; supply distinct prefixes for diagrams sharing
a page. Omit `scheme` to follow the system theme, or pin it to `"light"` or
`"dark"`. The `fonts` option accepts host font families and synchronous width
metrics. Both fan-out styles use `fonts.mono` for all text and its layout;
`fonts.text` affects flow text only. Omitting `fonts` or supplying `{}` keeps
the default SVG bytes. See [host fonts and width metrics](plan.md#host-fonts-and-width-metrics).
TypeScript consumers can import `RenderOptions`, `Diagnostic`, `FontOptions`,
`FontsOptions` and `TextStyle` from the same entry point. `LIGHT` and `DARK`
export the default palettes.

## Playback

For diagrams with [play sections](plan.md#playback), pass the rendered inline
`SVGSVGElement` and its `timelines` to the player. Use a distinct `idPrefix` for
each figure on the page, including figures in shadow roots.

### Built-in controls

Mount scenario tabs, buttons, a step range and captions in an element or
shadow root below the inline SVG:

```ts
import { mountPlayback } from "@uberblick/ablauf/playback";

const mount = mountPlayback(controlsContainer, svgElement, result.timelines);
// Starts idle; the user presses Play. The host can also call mount.player.
// Before replacing the SVG or its timelines:
mount.destroy();
```

<summary><b>Playback details and the headless player</b></summary>

The container can hold other host content. `mount.destroy()` and
`mount.player.destroy()` perform the same idempotent cleanup: stop playback,
clear highlighting, remove the mount's controls, style and listeners, and leave
host content intact. Destroy the old mount before rendering changed source,
then mount again. No timelines adds no controls or style. A single timeline
has no tabs; an empty scenario stays selected and shows “No playable steps”.
Tabs activate immediately on Left/Right (wrapping), click or Enter/Space;
selection pauses on the first step. The range includes the full figure at `-1`.
Controls follow the SVG's automatic or pinned scheme and accept host `--ab-*`
colour overrides on their container. `PlaybackMount` is exported from the same
entry. Both entries are safe to import without browser globals.

For custom controls, use the headless player:
For custom controls, use the headless player:

```ts
import { createPlayer } from "@uberblick/ablauf/playback";
import type { Timeline } from "@uberblick/ablauf";

export function attachPlayback(svg: SVGSVGElement, timelines: Timeline[]) {
  const player = createPlayer(svg, timelines, {
    onChange(state) {
      // The SVG and player.state already match this stable snapshot.
      console.log(state.scenario, state.step, state.status);
    },
  });
  return player;
}
```

Creation shows the full figure at `{ scenario: 0, step: -1, status: "idle" }`
without a timer or callback. Call `play()` from a host interaction to start;
`pause()` keeps the frame, and resuming restarts its full dwell. Each step,
including the last, stays current for its `ms`. Playback ends on the last
frame; `play()` replays it, or `{ loop: true }` loops the selected scenario.
Repeated `play()` during playback leaves the timer alone.

`next()`, `previous()` and `seek(step)` pause and clamp integer steps to
`-1..last`; `-1` clears highlighting. `select(scenario)` pauses on that
scenario's first step, including when reselecting it. Invalid scenario indices
and non-integer indices are ignored. Empty scenarios stay at step `-1`;
playing them stays idle. The player never chooses another scenario for you.

Reduced motion is checked through the SVG's window on every `play()` and
observed during playback. Enabling it resets to the full idle figure without
a timer. Disabling it never starts playback. Manual navigation still works.
The player adds no animations, transitions, controls or layout changes.

`onChange` fires once per changed scenario/step/status tuple, after the SVG
and `player.state` update. Call `destroy()` when removing a figure: it clears
timers, preference listeners and highlighting, silently returns to idle at
step `-1`, and makes later methods inert. Both package entries can be imported
in Node; only creating and using a player needs an SVG. `Player` and
`PlayerState` types are exported from the playback entry.
