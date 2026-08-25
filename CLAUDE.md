# ablauf

Standalone library: text-sourced flowcharts (mermaid-compatible semantics +
a layout store outside the text + a deterministic snap/render pipeline).

## Hard rules

- The core NEVER imports yjs, tiptap, react, a model SDK, or anything
  host-specific — text plus positions in, SVG out, positions back.
- The semantic grammar stays a strict mermaid-flowchart subset: any ablauf
  file must render as valid mermaid elsewhere. ablauf never rewrites the
  user's semantic text to store geometry.
- Layout lives in the layout store, keyed by stable node id, never in the
  text. `%% @pos` comments are an export format only.
- Rendering is deterministic: same graph + same positions, byte-identical
  SVG, on every replica. No randomness, no clock, no font measurement, no
  iteration over unordered structures — and none of the banned constructs
  in `docs/decisions.md` D21 (`localeCompare`, `Intl`, approximated `Math`).
- A node that already has a position is frozen: no directive, and no
  validation step, may move it.

## Principles

KISS/YAGNI, least code wins, write for humans, don't overtest — the
contracts worth tests are the parser grammar, the mermaid round-trip, and
the snap-pass safety properties. The core ships zero runtime dependencies;
any dependency needs a justification and its licence named in the PR, and
nothing may restrict distributing this library or what is built with it
(`docs/decisions.md` D15).

## Working on this repo

Read `docs/decisions.md` before changing behavior — it is the standing
status quo, edited in place, and code comments cite its D-numbers. Do not
re-litigate a decision in a PR; if one looks wrong, say so and stop.

Issue → branch → PR; no direct commits to `main`; squash-merge. Gates, all
green before a PR is ready:

```
mise run lint
mise run typecheck
mise run test
mise run build
mise run acceptance   # end-to-end gate, run it twice — the second run is the drift check
```

`mise run demo` builds and serves the drag demo for eyes-on verification.
(`mise` may be a shell function rather than a binary in non-interactive
shells — fall back to `mise exec -- pnpm <script>` by absolute path.)

### Merge policy

- **Tier 1 — self-merge.** `Touches ⊆ {docs, repo}`, no new dependencies,
  no change to `.github/ISSUE_SPEC.md` or `.claude/skills/`.
- **Tier 2 — self-merge with evidence.** `core`, `demo`: all gates green
  plus a merge-report comment on the PR (acceptance criteria checked one by
  one, gate outcomes, rejected review findings with reasons).
- **Tier 3 — `needs-human`, pre-merge.** Any new runtime dependency; a
  change to the accepted grammar subset that could break the "valid mermaid
  elsewhere" rule; the layout-store format or its persistence contract;
  changes to the Hard rules above; overruling a major review finding; and
  any change to the process itself (`.github/`, `.claude/skills/`).

The implementation loop (`/next-issue`, `.claude/skills/next-issue/`) picks
up issues that satisfy `.github/ISSUE_SPEC.md`. It executes only PRs from
trusted authors (owner or write-access collaborators) — a stranger's PR is
never checked out or run on a local machine, only read and labeled. The
loop itself never commits to `main`.

MIT.
