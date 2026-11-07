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

Every render with timelines mounts the built-in playback controls with
`layout: "auto"`; editing
source or switching examples destroys the previous mount. Open
`#examples/loop-play` for three scenario tabs. Examples without timelines keep
their static presentation.

For sequence playback, open `#examples/claim-play` and select the 710px
document column (678px figure). Before merging #138, a maintainer must play
both **Claim the show** and **Wrong code** in light and dark in a browser.
Check current/played/faded messages, participant headers and attached phase,
branch and note annotations; the wrong-code scenario skips the success branch.
Current messages glow without running dashes, numbers become bold in the play
colour, and current header dots grow and glow. Structural lines/backgrounds
stay fully visible. Check the chosen treatment C against the pinned
[prototype](https://github.com/uberblick-ai/ablauf/blob/48fd77324024cbe37bdd331fb1e61f7a39756f39/spike/sequence-playback-prototype/README.md),
with receiver activation bars removed per the
[maintainer browser review](https://github.com/uberblick-ai/ablauf/pull/143#issuecomment-6581639769):
arrows draw sender to receiver in about 0.55s with ease-out timing, a small dot
rides the tip and fades on arrival, and no receiver activation bar appears.
Check reverse responses (including messages 2, 6, 8, 14 and 15):
they regain their dashes after drawing. Check message 11's packet follows the
whole self-message loop without a bar at the loop end. Current, played and
unplayed messages have no activation bars. A soft play-colour band spans the figure
behind the current label and arrow, taller for the self-message. Check the
band's placement and cross-fade on every step in both scenarios.

Pause midway through drawing: the arrow completes immediately, the packet
disappears, and the band shows immediately. Resume: that step redraws.
Navigate manually and check the complete arrow and band without travel or
transitions. Return to idle and check the full figure with no overlays. Only
playing states ease or animate. Enable reduced motion before Play and during
playback: it resets to idle and the full figure; manual steps still show their
band instantly, with no animation or transitions. Verify
`--ab-play-glow: 0`. The packet uses a round dash on the arrow path, so no CSS
motion-path/offset is used. Any replacement that uses it must verify travel in
current Chromium, Firefox and Safari, or supply a compatible fallback.
Reading SVG source or using DOM fakes does not satisfy this visual review.

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
**Compact controls** case with overflowing tabs, successive short, horizontally
overflowing and blank captions, an absent actor and an empty scenario at the end
of the tab strip. Its source is `spike/playground/playback-compact.flow`, shared
with the caption regression test and checkable with `mise run check`.
Each mounted case has replacement-data controls and immediate/delayed rebinding;
every case has SVG removal/reinsertion and a subscription state readout.
Separate cases exercise viewport pausing alone (mounted and standalone),
autoplay alone, and autoplay with viewport pausing in a shadow root.
Current-colour and zero-glow controls apply host overrides to every case,
including the shadow root. Most documents are 710px wide,
with 16px side padding giving a 678px figure at full width. The first case,
**Claim · responsive side captions**, uses `claim-play.flow` in a document up
to 1088px wide. Its **Claim layout** selector offers Auto, Side and Below;
other cases keep Auto.
**Claim · side captions in shadow root** uses the same wide document, always
uses Side and includes the same replacement-data controls. Use delayed rebinding in both Claim cases to review
row focus, alongside the below-layout flow cases.

For #139, a maintainer must review in a real browser in **light and dark** at
viewport widths of **1160px and 760px**. Use the approved
[side-column reference](https://github.com/uberblick-ai/ablauf/blob/48fd77324024cbe37bdd331fb1e61f7a39756f39/spike/sequence-playback-prototype/README.md).
Select Side for Claim wherever Auto falls back, and review `loop-play.flow`
below. Verify caption readability, the side column sticking to the viewport
top while scrolling, and independent column scrolling when its list exceeds
the viewport. Play and seek through both claim scenarios: keeping the current
row visible must cause no page jumps or focus changes. Tab to row buttons,
check their visible focus, and activate them with Enter and Space to seek and
pause. Verify message numbers (`09`, `10`, `11`, `14`, `15` for Wrong code),
played/current styling and scenario changes. Return Claim layout to Auto and
resize across a **998px figure container** (678px natural SVG + 320px beside
it): it must switch below when narrower and back to side at or above 998px.
The review document adds 32px padding and the page has 48px margins, so the
threshold here is a 1078px viewport. The SVG's natural size, rather than its
scaled narrow-screen size, determines this choice. Source inspection and DOM
fakes do not satisfy this visual review. The #137 dependency is now available
as `spike/examples/claim-play.flow`.

For #127, use a 720×680 browser viewport and open **Expand** on
[Loop · light DOM](http://localhost:4620/playback-review#review-light-dom) or
[Loop · shadow root](http://localhost:4620/playback-review#review-shadow).
Both loops also offer **Host expand()**; the
[host-only case](http://localhost:4620/playback-review#review-host-expand) omits
the built-in Expand button to exercise the always-available API.
The captured expanded loops are [light](images/playback/expanded-light.png),
[dark](images/playback/expanded-dark.png),
[shadow light](images/playback/expanded-shadow-light.png) and
[shadow dark](images/playback/expanded-shadow-dark.png).

- Expand appears in its own right-aligned row, separate from the three playback
  buttons. Close is at the modal's top right and receives initial focus.
- The loop retains its natural 786×780 size and overflows both axes in this
  viewport. Scroll the figure; tabs, counter, actor, caption and navigation stay
  below it without moving. Try a smaller figure too.
- Tab and Shift+Tab stay in the modal. Close, Escape and a click in its narrow
  outer backdrop gutter close it; content clicks and drags from the content into
  the gutter do not. Check focus return to
  Expand and to Host expand(), including the host button outside the shadow root.
- Open idle, paused, playing and ended figures; change scenarios and use every
  control while expanded. Closing retains the latest state and Play/Pause/Replay
  text. Enable reduced motion while playing: the figure resets; manual stepping
  still works and disabling the preference never starts playback.
- Check automatic and pinned light/dark schemes and host overrides in both DOM
  types. Both destroy entry points must remove an open modal, restore the host
  SVG and leave host content intact. These interactions still require maintainer
  review before merging.
- In Compact controls, step through short, long and blank captions while expanded:
  the caption stays one horizontally scrollable line and reserves its scrollbar
  space. Same-step Pause/Play and opening/closing preserve caption scroll; changing
  step/scenario or reaching ended resets it. Ended shows the full unfaded figure,
  clears step details and offers Replay from step 0.
- Open a Claim side-layout case: expansion places the figure above the controls
  and shows the single-line caption. Closing restores Side and its step list.
  Use delayed rebinding while expanded to check the modal stays open and refreshes
  its figure, controls and scheme; no timelines closes it. Repeat expansion after
  restoring data, and test both teardown paths with a replacement SVG.
- In the autoplay/viewport cases, open idle or paused before entry: expansion
  never starts playback and ends initial autoplay/pending automatic resume.
  Explicit playback continues despite viewport observations while expanded.
  Hidden/disconnected guards still pause it; closing restores viewport pausing.

A maintainer checks these in a real browser before merging playback changes,
including #95, #112, #113, #116 and #146. Capture light and dark screenshots of
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
- In **Compact controls**, play and manually step **Single-line caption scrolling**
  through its short, overflowing and blank captions. Compare idle/full figure,
  the scenario without an actor and the empty scenario: at the 678px figure width,
  the actor and caption lines remain reserved, and the step-row height and button
  positions stay constant. Long text stays on one line within the figure. Read
  all of it by pointer/touch and keyboard scrolling; confirm the ending is reachable.
  Tab to the “Step caption” region before Previous in short, blank, idle and empty
  states too. Check its visible focus outline, and that Left/Right scroll the
  caption without changing playback state, step or scenario. Home and End are
  left to the browser, which scrolls the page with them; they must not change
  playback state, step or scenario either.
  Scroll partway through the long caption: pause/resume preserves that position,
  while a scenario or step change resets instantly to the beginning. Make the
  document narrow enough to scroll the last caption of **Short captions**, scroll
  partway through it and let playback finish: the full figure returns, the caption
  clears and its scrolling resets without animation or focus movement.
  Playback must not move focus, pan automatically or announce scrolling;
  the complete actor and caption still announce once per
  playable-step change through the polite status. Repeat in light and dark, with
  reduced motion, a narrower document and a browser using non-overlay scrollbars:
  scrollbar space must stay reserved even for short or blank captions, and scroll
  reset must have no animation.
- Play and pause both the direct `createPlayer` case and built-in controls.
  Current node outlines/decision shapes and incoming strokes glow, including
  when paused; played parts do not glow. Playing incoming dashes move
  toward fixed arrowheads with no jump at the loop seam. No incoming edge means
  no running stroke. Fades and colours change gently over about 0.35s while
  playing; manual navigation and scenario changes are instant. Paused
  figures are still. Gaps and crossing knockouts have no glow or running dashes.
- Open `#examples/loop-play` in the playground and disable looping. A maintainer
  must review it in a real browser in light and dark at initial idle, while
  playing and after the scene ends. Idle and completion show the full unfaded
  figure without current/played highlights or glow; pausing mid-scene keeps
  the highlight and fade. Let the last step finish its full duration: the
  counter becomes blank, actor/caption empty, all segments unhighlighted,
  range `-1` with “Full figure”, and the toggle reads Replay. Replay starts
  at the first step; from ended, Next shows the first step paused and Previous
  stays at the full figure paused. SVG-source inspection does not satisfy this check.
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
  and remark announce once on step changes, pause does not repeat them, and
  completion clears the status without repeating the last step. The
  counter/segments add no announcements. Repeat in the shadow root.
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
- Repeat the rebinding cases in Claim with **Claim layout** set to Side and
  Below, and in **Claim · side captions in shadow root**. Side lists must follow
  reordered/renamed/removed scenarios and changed step counts, message numbers,
  actors and captions. Focus a row before delayed rebinding: it survives by
  scenario slug and step position, or falls back to the panel if removed.
  After rebinding from a playing or ended scene, play the replacement with
  looping disabled and let it finish: the full figure returns, the side list
  has no current or played row, controls and announcements clear, and Replay,
  Next and Previous behave as above. Repeat in light and dark in both layouts.
  Restore data, choose Auto and resize across the threshold after rebinding:
  layout still switches both ways using the replacement's natural size, with
  synchronized lists. Try No timelines and Restore original data repeatedly,
  then both teardown buttons: no duplicate wrappers, stale lists or resize
  callbacks; the current SVG remains and unrelated host content is intact.
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
