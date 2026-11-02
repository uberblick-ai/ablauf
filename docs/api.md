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

const mount = mountPlayback(controlsContainer, svgElement, result.timelines, { autoplay: true });
// Starts idle. With autoplay it plays once half the figure is in view, pauses
// when it leaves and resumes when it returns, unless the reader paused it.
// Without autoplay, Play or a scenario tab starts it; the host can also call mount.player.
// After rendering changed source, replace only the old SVG in the host:
svgElement.replaceWith(replacementSvg);
mount.update(replacementSvg, replacementResult.timelines);
// The same player and action controls remain. Update always leaves it paused.
const unsubscribe = mount.player.subscribe(state => console.log(state));
mount.player.select("clean-merge"); // Exact Timeline.slug, or a numeric index.
unsubscribe(); // Idempotent; other subscriptions and controls keep working.
// When the host no longer needs the mount:
mount.destroy();
```

### Playback details and the headless player

The container can hold other host content. `mount.destroy()` and
`mount.player.destroy()` perform the same idempotent cleanup: stop playback,
clear highlighting, remove the mount's controls, style and listeners, and leave
host content intact. `mount.update(svg: SVGSVGElement, timelines: Timeline[]): void`
rebinds an existing mount. It keeps the selected scenario by exact slug after
reordering, otherwise chooses the first (index `0` with no timelines), cancels
playback and pauses at step `0`, or `-1` for an empty scenario or no timelines.
It refreshes all controls and the SVG's scheme even when the state tuple is
unchanged. It clears the old SVG's player classes and stops observing it.
The returned player identity and subscriptions stay usable.

While controls remain, the panel, buttons and range retain their identity and
focus. A focused tab survives by slug after reordering; removing that tab or
reducing to one scenario focuses the panel. Other focus stays put. No timelines
removes owned controls and style without focusing unrelated host content;
later updates can add controls again. Updating never starts playback, even with
autoplay: viewport events cannot start the replacement until explicit Play or
scenario activation. A single timeline
has no tabs; an empty scenario stays selected and shows “No playable steps”.
Tabs activate immediately on Left/Right (wrapping), Home/End, click or
Enter/Space, and play the chosen scenario from its first step; under reduced
motion they only select it. The headless `player.select()` still pauses on the
first step. The range includes the full figure at `-1`. The panel itself is a
visible-focus tab stop, including for one scenario. With focus on the panel
itself, unmodified Space toggles Play/Pause (Replay when ended), Left calls
`previous()` and Right calls `next()`. Handled keys prevent browser defaults.
Descendant controls keep native behavior, tabs keep their own activation, and
editable targets (including inherited contenteditable) never trigger shortcuts.
Shortcuts are local to each mount, including in shadow roots.
Controls follow the SVG's automatic or pinned scheme and accept host `--ab-*`
colour overrides on their container. `PlaybackMount` is exported from the same
entry. Both entries are safe to import without browser globals.

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
scenario's first step, including when reselecting it.
`select(scenario: number | string): void` accepts a numeric index or exact
`Timeline.slug`. Unknown slugs, invalid indices and non-integer indices are
ignored. Empty scenarios stay at step `-1`;
playing them stays idle. The player never chooses another scenario for you.

Reduced motion is checked through the SVG's window on every `play()` and
observed during playback. Enabling it resets to the full idle figure without
a timer. Disabling it never starts playback. Manual navigation still works.
The player adds no animations, transitions, controls or layout changes.

Both creation APIs accept `pauseWhenOffscreen?: boolean` (default `false`):
`createPlayer(svg, timelines, { loop?, onChange?, pauseWhenOffscreen? }?)` and
`mountPlayback(container, svg, timelines, { loop?, autoplay?, pauseWhenOffscreen? }?)`.
With viewport pausing, an IntersectionObserver report of no intersection pauses
on the current frame and blocks playback while known to be off screen. Entry
alone never starts a standalone player or a mount without autoplay. Without
IntersectionObserver, both viewport pausing and autoplay are unavailable.
Scenario tabs still select while off screen; with viewport pausing enabled,
the selected scenario stays paused until an allowed start. Autoplay alone
does not block explicit Play or scenario activation off screen.

Autoplay starts initially and resumes viewport-caused pauses only with
`isIntersecting` and `intersectionRatio >= 0.5`. Falling below half visibility
does not pause: exit means no intersection. Manual pause/navigation cancels
automatic resume, including a manual pause while already viewport-paused.
These rules also apply with both options enabled and respect reduced motion.

Both APIs check the SVG's `isConnected` and its owning document's
`hidden`/`visibilityState` before Play and at every step timer callback.
Disconnection found at a callback pauses without advancing or arming another
timer; removal and reinsertion entirely between checks is not detected.
`visibilitychange` to hidden pauses immediately and cancels the timer.
While hidden or disconnected, Play and scenario-tab activation are no-ops,
without selecting, resetting or notifying. Manual navigation and `select`
still work and pause as usual. Restoration/reconnection never resumes a
lifecycle-paused player, including through autoplay; start it explicitly.
If a lifecycle check finds an idle or already viewport-paused player, it
preserves first-view autoplay or pending viewport resume. Those starts still
require a later half-visible viewport report while connected and visible.
These guards work for both document and shadow-root SVGs.

`subscribe(fn: (state: PlayerState) => void): () => void` adds a listener
alongside `onChange`, returning an idempotent unsubscribe. Registration does
not notify. Each changed scenario/step/status tuple notifies active listeners
once, with stable snapshots, after the SVG, `player.state` and built-in controls
synchronize. Unchanged tuples (including same-tuple updates) and destruction
do not notify. Subscribing never replaces controls synchronization.
Call `destroy()` when removing a figure permanently: it clears
timers, observers, visibility/preference listeners and highlighting, silently returns to idle at
step `-1`, and makes later methods, updates and browser callbacks inert.
Subscribing after destruction returns an inert unsubscribe. Both package entries can be imported
in Node; only creating and using a player needs an SVG. `Player` and
`PlayerState` types are exported from the playback entry.
