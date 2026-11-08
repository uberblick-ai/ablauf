# API

The package has three entry points: `@uberblick/ablauf` renders source to SVG,
`@uberblick/ablauf/playback` plays rendered flows in a browser, and
`@uberblick/ablauf/viewer` opens any rendered figure in a full-window zoomable
viewer. All are ES modules, ship TypeScript declarations and are safe to import
without browser globals. The viewer entry includes no playback code, and core
includes neither.

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
shadow root containing the inline SVG:

```ts
import { mountPlayback } from "@uberblick/ablauf/playback";

const mount = mountPlayback(figureContainer, svgElement, result.timelines);
// Starts idle with the full figure. Play or a scenario tab starts it;
// the host can also call mount.player.
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

Autoplay is off by default. Opt in with `{ autoplay: true }` as the fourth
argument: mounting still shows the full idle figure until half of it is in
view. Playback then starts, pauses when it leaves and resumes when it returns,
unless the reader paused it.

`layout: "auto"` (the default) places captions beside a figure when its natural
height exceeds its width and the container leaves at least 320px beside that
width; it switches back to below on resize. Use `layout: "side"` or `"below"`
to select explicitly. Side has a sticky, independently scrolling column with
all steps; activate any row to seek and pause. Below has the single caption and
no step list. [The controls contract](plan.md#built-in-controls-and-lifetime)
describes numbering, state and keyboard access.

Pass the figure's container, rather than a separate controls container below
the SVG. The mount moves the SVG into its own wrappers inside that container,
even if the SVG was nested or in another parent. Mount styles set the SVG to
`display: block`, `max-width: 100%` and `height: auto` on the controls' background;
destroy removes those styles and restores the SVG's original parent and position.

`expand: true` adds an **Expand** button in its own right-aligned row above the
inline controls. Every mount also offers `mount.expand(options?)` for host
controls, with or without that option. Both open the [viewer](#viewer) with the
figure's zoomable drawing region above the same tabs, counter, actor, single-line
caption, playback buttons and step navigation. Playback overlays zoom and pan
with the figure. Expansion uses the below layout; closing restores the requested
inline layout. The mount option `viewer` sets default viewer options for both
entries, and `expand(options)` overrides them key by key for that call.
`expand()` returns the open `Viewer`, or `undefined` with no timelines or after
destruction.

The same `mount.player` reports and controls the active view, preserving scenario,
step, playback status and remaining dwell in both directions. Opening never
starts idle or paused playback. Viewport autoplay and off-screen pausing are
suspended while expanded; opening also ends initial autoplay and pending automatic
resume. After closing, subsequent viewport exits can pause playing figures as
usual. Reduced motion and hidden/disconnected lifecycle guards still apply.
Close, Escape or a click that starts and ends in the backdrop gutter closes the
dialog and returns focus to Expand or the previously focused host control.
Tab stays within the modal; content clicks and drags into the gutter do not close
it. Host `--ab-*` overrides and automatic or pinned schemes stay live, including
in shadow roots.

Repeated `expand()` or `openViewer()` calls for an open figure return the open
viewer without resetting zoom or playback. `mount.update()` refreshes the
expanded SVG, controls and scheme without closing; updating to no timelines
closes the view. Both destroy entry points close any open viewer, firing its
`onClose`, and restore the current SVG's host position.

### Playback details and the headless player

The container can hold other host content. `mount.destroy()` and
`mount.player.destroy()` perform the same idempotent cleanup: stop playback,
clear highlighting, remove the mount's controls, wrappers, style, listeners and
observers, restore the current SVG's host position, and leave host content intact.
`mount.update(svg: SVGSVGElement, timelines: Timeline[]): void`
rebinds an existing mount. It keeps the selected scenario by exact slug after
reordering, otherwise chooses the first (index `0` with no timelines), cancels
playback and pauses at step `0`, or `-1` for an empty scenario or no timelines.
It refreshes all controls and the SVG's scheme even when the state tuple is
unchanged. It clears the old SVG's player classes and stops observing it.
The replacement moves into the existing figure wrapper. A replacement supplied
inside that wrapper or detached inherits the previous SVG's host position for
teardown; one supplied in another parent returns to that parent and position.
The outgoing SVG is removed if still inside the wrapper. The returned player
identity and subscriptions stay usable. The `layout` option stays in effect;
auto reevaluates the replacement's natural dimensions and still responds to
resize. Side lists refresh their names, numbers, actors, captions and counts.

While controls remain, the panel, buttons and range retain their identity and
focus. A focused tab survives by slug after reordering; removing that tab or
reducing to one scenario focuses the panel. Side-list row buttons survive by
scenario slug and step position; removing a focused row or switching below
focuses the panel. Other focus stays put. No timelines restores the current SVG
and removes owned controls, wrappers, style and resize handling without focusing
unrelated host content; later updates can add controls again. Updating never starts playback, even with
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
Automatic controls inherit the host's CSS `color-scheme`, including live changes;
controls from pinned-light/dark SVGs retain that pinned scheme. The automatic
SVG still follows the OS. Controls sit transparently on the host surface and
accept host `--ab-*` colour overrides in all modes. Set `--ab-font-text` once
for captions, side remarks and other body text, and `--ab-font-mono` for buttons,
tabs, actors and numbers; these are independent of SVG render `fonts` and
inherit through shadow roots. Defaults are `system-ui,sans-serif` and
`ui-monospace,monospace`. Under `(any-pointer: coarse)`, every button and step
segment has a minimum 44px width/height, action and segment rows wrap, and tabs
keep horizontal scrolling. Fine-only pointers retain compact sizing. Defaults
are in the `ablauf-playback` cascade layer: ordinary unlayered host selectors
such as `.ab-playback`, `.ab-playback button` and `.ab-playback .abp-segment`
override them even when the host stylesheet precedes mount styles. Place scoped
rules inside a shadow root to select its controls; inherited hooks cross its host.
`PlaybackMount` is exported from the same
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
including the last, stays current for its `ms`. A non-looping scene then ends
at `{ scenario, step: last, status: "ended" }`, preserving the selected scenario
and last step in `player.state`, `onChange` and subscribers. The last step stays
current, earlier visited parts stay played and off-path parts stay dimmed.
The SVG retains `ab-in-progress` and removes `ab-playing`; motion stops.
Pausing mid-scene retains the current highlight and fade.
`play()` replays from step `0`, or `{ loop: true }` loops the selected scenario.
Repeated `play()` during playback leaves the timer alone.

Off-path flow shapes use `--ab-play-unreached-opacity` (default 0.3); all node
and edge text uses `--ab-play-unreached-text-opacity` (default 0.8), on individual
elements. Both accept CSS numbers/percentages clamped to [0, 1]. Either
`prefers-contrast: more` or `forced-colors: active` forces full text opacity even
with a host override. Current/played parts keep their native colours and full
opacity; gaps and knockouts stay unfaded. Sequence fade styling is unchanged.
For host checks, `PlaybackContrast` adds optional `unreachedTextOpacity` defaulting
to 0.8; `play` and `unreachedOpacity` remain required. Playback `checkPalette`
results use per-pair `threshold: 3 | 4.5`, `minimum` for 4.5 pairs and
`unreachedMinimum` for 3 pairs. Check every pair against its threshold. See
[theming](theming.md) and the [host testing guide](https://ablauf.uberblick.ai/guides/testing)
for resolving both opacity knobs and contrast preferences. Static one-argument
checks retain their types, pairs, ratios, minimum and validation.

After completion the built-in controls retain the last counter, actor, caption
and its scroll position, current/played segments, step list and range value.
The status region retains the current position without repeating it. The toggle
reads “Replay” and starts at step `0`. Under reduced motion Replay resets to idle
and the full figure, as `play()` does.

`next()`, `previous()` and `seek(step)` pause and clamp integer steps to
`-1..last`; `-1` clears highlighting and shows the full figure. From ended,
`next()` stays at the last step paused and `previous()` goes to the preceding
step paused (or `-1` for a one-step scenario). `select(scenario)` pauses on that
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
`mountPlayback(container, svg, timelines, { loop?, autoplay?, pauseWhenOffscreen?, layout? }?)`.
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

## Viewer

`openViewer(svg, options?)` from `@uberblick/ablauf/viewer` opens any rendered
inline SVG (flow, sequence, fan-out, playable or not) in a full-window native
modal dialog and returns `Viewer { readonly zoom: number; readonly closed: boolean; close(): void }`.
`close()` is idempotent. Opening an SVG that is already open, through either
`openViewer` or a playback mount's `expand()`, returns the existing handle.
`Viewer`, `ViewerOptions` and `ViewerAction` types are exported from both the
viewer and playback entries.

```ts
import { openViewer } from "@uberblick/ablauf/viewer";

const viewer = openViewer(svgElement, {
  source,              // Optional: adds Copy, which copies exactly this string.
  initialZoom: "auto", // Or "fit" to start at Fit even for a small figure.
  actions: [{ label: "Source", onClick: viewer => { viewer.close(); openEditor(); } }],
  onClose: () => syncHostHistory(),
});
// Ablauf never pushes or rewrites history. Close the viewer on the host's Back:
addEventListener("popstate", () => viewer.close(), { once: true });
```

The SVG moves into the dialog and returns to its place on close. The dialog
sits beside the figure, so host `--ab-*` overrides, fonts and automatic or
pinned schemes apply, including in shadow roots. It is labelled from the SVG's
accessible name, focuses **Close** first, keeps Tab inside, and closes on
Close, Escape, native `close()`, a press and release on the backdrop, the
handle or a playback mount's teardown. Focus returns to the element focused
before opening. `onClose` runs once for every close path, after the SVG is back
and the viewer's styles, listeners, observers and gestures are released. The
page behind does not scroll while the viewer is open.

A persistent toolbar holds Close, minus, the live zoom percentage, plus and Fit,
then Copy (only when `source` is supplied, even as an empty string) and the
host `actions`, all native buttons at least 44×44 CSS pixels. Action labels are
plain text, never HTML. Copy announces "Copied source" or, when the clipboard is
denied or missing, "Copy failed" in a polite status.

The figure opens centred at natural size (100%) when it fits the drawing region,
otherwise at Fit. Fit uses the smaller of the width and height ratios, capped at
100% and floored at 25%, and recentres; overflow at the floor stays scrollable,
and an active Fit follows resizes. Minus and plus change zoom by 25 percentage
points around the region's centre. Zoom stays within 25%–400%, disabling the
bound buttons. A two-finger pinch zooms around its midpoint, Cmd/Ctrl + wheel
(and a trackpad pinch) around the pointer, and dragging pans; a plain wheel
scrolls. Touch gestures stay in the drawing region. Zoom changes apply
immediately, with or without reduced motion. Zoom resizes the SVG's box only,
so layout, routes, playback overlays and player state are unchanged.
