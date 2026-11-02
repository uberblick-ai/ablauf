# ablauf playground: plan

Draft for review, 2026-10-13. Modelled on wireframe-md's playground
(`playground/` there, `mise run playground`). It goes into the fresh
`uberblick-ai/ablauf` repository once the spike's direction is accepted.

## Status

A first cut runs on the spike branch: `mise run playground`. It has the
sidebar, the editor beside a live render, clickable diagnostics, Save, the
light/dark and 710 px toggles, a node-box overlay, and the hand-drawn
reference beside the loop. Approval, entry pages, hover links and the
what-moved view are still to come.

Open `#examples/neutral` for filled grey boxes and panels beside the
surface-filled `ink` and `muted` variants, with matching neutral legend samples,
pill dots and edges. Use the scheme toggle to review light and dark.

Every render with timelines now mounts the built-in playback controls; editing
source or switching examples destroys the previous mount. Open
`#examples/loop-play` for three scenario tabs. Examples without timelines keep
their static presentation.

For the system-step comparison, open `#examples/system-steps` and select the
710 px document column. Check both light and dark: “The loop” is a blue system
box with explanatory text, beside a neutral note and connected to a label,
an agent role and a person panel. The legend includes matching samples.

## Playback browser review

Run `mise run playground` and open
[http://localhost:4620/playback-review](http://localhost:4620/playback-review),
or follow **Playback browser review** from the playground. If port 4620 is busy,
use the printed server URL with `/playback-review`. No build or setup script is
needed beyond that command.

The fixture shows two independently rendered copies of
`spike/examples/loop-play.flow`, one in the light DOM and one inside a shadow
root, using distinct `idPrefix` values. `spike/examples/playback-fade.flow` adds
all six node kinds and inline label gaps on canvas and band backgrounds, with
zero diagnostics. The playground-only `spike/playground/playback-crossings.flow`
visibly exercises canvas and band knockouts; its two crossing warnings are
intentional and shown on the page. It stays outside the rendered example set.
The page also shows a single timeline without tabs, a direct `createPlayer`
case without built-in controls, a tabbed case with an empty scenario, and a
**Compact controls** case with overflowing tabs, short captions, a long wrapping
caption, an absent actor and an empty scenario at the end of the tab strip.
Each mounted case has replacement-data controls and immediate/delayed rebinding;
every case has SVG removal/reinsertion and a subscription state readout.
Separate cases exercise viewport pausing alone (mounted and standalone),
autoplay alone, and autoplay with viewport pausing in a shadow root.
Current-colour and zero-glow controls apply host overrides to every case,
including the shadow root. Each document is 710px wide,
with 16px side padding giving a 678px figure at full width.

A maintainer checks these in a real browser before merging playback changes,
including #95, #112, #113 and #116. Capture light and dark screenshots of
`/playback-review` at the 678px figure width. Compare the controls with the
[gallery controls reference](https://raw.githubusercontent.com/uberblick-ai/ablauf/9ba61d5485c89010c57ce6eb4c0111e7e6fac8de/spike/gallery/controls.png)
and the figures with the [scenario playback GIF](images/playback/scenario-tabs.gif).
The fixture supplies no host control CSS. Source inspection and DOM fakes do
not satisfy this visual gate.

The compact-controls captures from this fixture are [light](images/playback/controls-light.png)
and [dark](images/playback/controls-dark.png); the overflowing-tab case with its
long caption is captured in [light](images/playback/controls-overflow-light.png)
and [dark](images/playback/controls-overflow-dark.png). They show 678px figures
without host control CSS; the interactive checks below still need a maintainer.

- Use the SVG/controls scheme selector for automatic, pinned light and pinned
  dark; choose a matching or contrasting host background separately. Automatic
  follows the browser/OS colour preference, including changes while mounted.
- Check the mint defaults and switch the Current colour host override: the
  current stroke, glow and built-in controls must follow it in both schemes.
  Toggle Zero glow (`--ab-play-glow: 0`): no glow, with the heavier current
  outlines preserved. Check every control glow too: selected tab text and the
  current segment must lose their glow in both light DOM and shadow roots.
  Toggle back without rerendering; all glows return in the chosen play colour.
- Check the borderless monospace tabs on one rule with a 2px selected underline,
  compact 30px buttons, and fixed Play/Pause/Replay minimum width. In **Compact
  controls**, the tab strip must scroll horizontally within the figure without
  wrapping or widening the document; scroll to the last empty scenario and back.
- At initial idle and range `-1`, the counter is blank and visually hidden with
  its space reserved; no segment is current or played. Step forward: the counter
  reads `1/total`, then follows the one-based current step during playback and
  navigation. Earlier segments are muted play colour, the current segment is
  full play colour with glow, and future segments are subdued. Click a segment
  while playing: it seeks to that step and pauses. Seek with range arrows and
  switch scenarios: counter, segment count and highlights stay synchronized.
- In **Compact controls**, compare idle, both short-caption steps, the scenario
  without an actor, and empty: the step row reserves the same two-line minimum
  and the action row stays at the same height. Select **Long caption wrapping**:
  all text wraps visibly and the row grows, with no clipping or overlap. Repeat
  in light and dark, including a narrower document.
- Play and pause both the direct `createPlayer` case and built-in controls.
  Current node outlines/decision shapes and incoming strokes glow, including
  when paused or ended; played parts do not glow. Playing incoming dashes move
  toward fixed arrowheads with no jump at the loop seam. No incoming edge means
  no running stroke. Fades and colours change gently over about 0.35s while
  playing; manual navigation and scenario changes are instant. Paused/ended
  figures are still. Gaps and crossing knockouts have no glow or running dashes.
- Play two figures simultaneously, switch scenarios and navigate. Check that
  each counter, segment bar, caption, actor, range and Play/Pause/Replay label
  follows only its player.
  Enable looping and watch the last step return to the first.
- In light and dark at document width, play or manually step the **Fade · inline
  labels** figure. On the first Request step, later labels fade to 0.3; their
  gaps must keep opaque canvas and band backgrounds. The unplayed parts remain
  readable while the active path stands out. Pause, seek forward/backward,
  switch to Review only and loop: current/played parts stay fully opaque and
  the other parts fade. At range `-1` or Empty, the entire figure is unfaded.
- In **Fade · crossing knockouts**, select each vertical and horizontal path.
  Both canvas and band crossing breaks must remain fully opaque, with no
  underlying edge showing through even when either path fades. Its two crossing
  diagnostics remain visible. Drive another figure independently to check
  isolation between distinct `idPrefix` values.
- Use Tab to reach the single selected tab; Left/Right wrap and activate
  immediately. Enter/Space and click also activate. Check visible focus remains
  on the control during playback; use native range arrows, including `-1` for
  the full figure. The hidden native range must remain a tab stop with a visible
  outline around the segment bar; segments must add no tab stops or announced
  controls. Verify the three buttons' accessible names are Previous,
  Play/Pause/Replay and Next. Check announcements with a screen reader: actor
  and remark announce once on step changes, while pause/end alone do not repeat
  them, and the counter/segments add no announcements. Repeat in the shadow root.
- Select the empty scenario: “No playable steps”, disabled buttons/range and
  usable tabs, a blank reserved counter and no segments. Verify the single-timeline
  case has no tab row.
- For document and shadow-root cases, choose **Reorder scenarios**, then
  **Rebind in 2 seconds** and focus a tab before it fires. Selection and focused
  tab follow the exact slug. Repeat with focus on each action button, range and
  panel: the same control keeps focus. With **Remove selected scenario** and
  focus on that tab, focus falls back to the panel and selection to the first
  scenario. **Keep selected scenario only** removes tabs and focuses the panel
  if a tab had focus. Other host focus stays put. The panel remains a visible
  tab stop with a single scenario.
- Use **Refresh labels, counts and scheme** twice while paused on step 0.
  Actor, caption, announcement, counter, range, segments, tab names and scheme
  refresh even when the state tuple is unchanged. **Empty selected scenario**
  pauses at `-1` with no segments. **No timelines** removes controls/style;
  **Restore original data** adds them again without duplicates. Focus must
  never move to unrelated host content. Rebinding always pauses on step 0
  (or `-1` when empty); scrolling cannot restart it, including autoplay cases,
  until Play or a scenario activation explicitly starts the new binding.
- While playing each document, shadow-root and direct case, **Remove SVG**,
  wait longer than a dwell, then **Reinsert SVG**. The state readout pauses on
  the same step; reinsertion and scrolling do not resume it. Explicit Play
  resumes. Switch browser tabs while playing, then return: it pauses on the
  same step immediately and never resumes automatically. Manual navigation
  still works while an SVG is removed; scenario activation must not select or
  reset it. Removal/reinsertion entirely between timer checks is not detected.
- In **Viewport pause only**, press Play, scroll until no part intersects,
  then return. It pauses on the same frame and needs explicit Play. Entry
  alone never starts it. Repeat with **Direct createPlayer · viewport pause
  only**. In **Autoplay** and **Autoplay and viewport pause**, initial entry
  and automatic resume require half visibility. Below half but still
  intersecting keeps playing; no intersection pauses. Manual pause/navigation,
  including Pause via the API when already viewport-paused, cancels resume.
  Reduced motion and lifecycle pauses also prevent automatic starts.
- Before first reaching an autoplay figure, switch browser tabs and return,
  then scroll it to half visibility: first-view autoplay still starts. Repeat
  after scrolling a playing figure fully out of view: hiding/restoring the tab
  while it is viewport-paused preserves resume at half visibility. Test both
  autoplay cases. If hiding actually paused playback, it still needs Play.
  With the SVG fully off screen and controls visible, autoplay alone permits
  Play, panel Space and scenario activation. With viewport pausing enabled,
  scenario tabs still select, but playback stays paused; entry alone must
  not start that manually selected scenario.
- Focus the panel itself in the single, multiple and shadow-root cases:
  Space toggles Play/Pause (Replay after ending), Left/Right step and pause,
  with browser defaults prevented. Focus buttons/range/tabs: native actions
  and existing tab activation remain, with no double handling. Modifier keys,
  editable descendants and inherited contenteditable must not trigger panel
  shortcuts (use browser devtools to toggle contenteditable for this check).
  Play two document/shadow figures: keys and focus affect only the targeted
  panel; outside focus does nothing. Repeat updates and both teardown paths:
  no duplicate controls, timers, callbacks or announcements.
- Enable reduced motion before Play and during playback. The figure resets
  to full idle, manual stepping still works, and disabling the preference does
  not start playback. No running dashes or transitions remain; a manually
  shown step may still glow.
- While playing, try both `mount.destroy()` and `player.destroy()` for each
  case, including the shadow root. The figure and host content remain, controls
  disappear, the full unfaded figure returns, and other mounts continue.
  Exercise both entry points on the loop and both fade fixtures in light and
  dark. Remount repeatedly: one set of controls,
  idle state and no old timers or announcements.

DOM fakes, CSS selector checks and SVG source inspection do not satisfy this
maintainer browser gate.

## What it is for

It is a local page for people to review flows. You write or paste a flow, see
it render in light and dark beside its source, click a problem to jump to its
line, and approve the examples that should become golden figures. Agents use
`check` and the tests; the playground is for the human eye.

## What carries over from wireframe-md unchanged

- `mise run playground` installs dependencies and serves `localhost:4620`. It
  takes a free port if that one is busy. It renders from sources on each
  request, so there's no build step.
- Examples live at `examples/FAMILY/ENTRY/NAME.flow`. The sidebar has
  collapsible families of entries, ordered the same way: a leading number sets
  the order and stays out of the label.
- An entry page shows all its examples, each with its source beside its render
  and a compact bar: name, status, unsaved mark, **Save**, **Approve** and
  **Review**. Ctrl+S or ⌘S saves.
- Diagnostics show only when there are any. Clicking one selects its line.
- Toggles switch light and dark, and the bare page and Uberblick's 710 px
  document column.
- Each family has an overview of tiles. Addresses work the same way:
  `#flows/1-loop`, `#flows/1-loop/insert`, `#flows/` and `#scratch`. Scratch has
  an Add form.
- **Approval belongs to people.** Only the Approve control writes
  `examples/approvals.json`, and agents never touch it. Each fingerprint is the
  SHA-256 of the saved source and the rendered SVG. The SVG carries its own
  styles, so there is no separate stylesheet to cover. Review shows the
  approved SVG source, or a diff against the current one.

## What a flow needs on top

1. **Grid overlay.** A toggle draws the author's grid over the render: column
   names, row lines, section boundaries, and numbered ports on each side. That
   makes the text-to-picture mapping visible, and it's where slot and span
   choices get checked.
2. **Hover links source and picture.** Hovering a node or edge line in the
   source highlights it in the render, and the other way round. Hovering a
   diagnostic highlights every element it names.
3. **Reference beside the render.** An example can have
   `NAME.reference.svg`, for example the hand-drawn loop. A third pane then
   shows it, with a slider overlay for comparing the two.
4. **What moved.** Any two examples in one entry can be compared, such as the
   loop and the loop with a role inserted. The view shows `measure.ts`'s table,
   and outlines the moved nodes and routes in the render.
5. **Copy as Markdown.** One button copies the ```` ```ablauf ```` fenced
   block, ready to paste into a corpus doc.

## Starting families

| Family | Entries |
| --- | --- |
| Flows | the ub-agents loop, the loop with a role inserted, the primer example |
| Parts | text, pill, box, end, panel, and each tone |
| Edges | the four elbow shapes, slots on a top or bottom, spans with straight edges, dashed edges, label at start or end |
| Diagnostics | one example per diagnostic: crossing, through a node, each label overlap, overlapping nodes, unknown ids |
| Trials | the ten agent files from the spike, kept as found |

## Build order

Each step is one small PR:

1. **Package skeleton.** Move `spike/flow` to `src/` and adopt wireframe-md's
   tooling (pnpm, Biome, tsc, the test runner, mise tasks). The examples
   become `examples/` and the tests run every example.
2. **Playground core.** Copy wireframe-md's server, catalog, editor and
   approval files, swap its renderer for ours, and fingerprint the SVG. Use
   Node's built-in type stripping, so no TypeScript dependency is needed at
   runtime.
3. **Grid overlay and hover links.** These need the renderer to tag SVG
   elements with node and edge ids (`data-id`), which also helps tests.
4. **Reference pane and what-moved view.**
5. **A showcase site** (later, as in wireframe-md): a static page built only
   from approved examples.

## Left out on purpose

- Drag editing. The text stays the only source.
- Running agent trials from the page.
- An AI assistant panel.
- Any layout or routing help beyond showing problems.

## Decided

- Port 4620, beside wireframe-md's 4610.
- One fingerprint covers light and dark, unless that causes a problem.
- The showcase site (`site/`, ablauf.uberblick.ai) shows each kind in its own
  section, so it started with two kinds and grows a section per new kind.
