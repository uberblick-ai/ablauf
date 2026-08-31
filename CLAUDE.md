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

Issue → branch → PR; no direct commits to `main`; squash-merge. Delivery is
executed by the role contracts under `.agents/roles/` (D28): `AGENTS.md` is the
canonical agent-neutral workflow, `.github/ISSUE_SPEC.md` owns the issue
grammar and lifecycle, and `/next-issue <role>`
(`.claude/skills/next-issue/`) launches one fresh session of one role. Three
continuous entry roles (`issue-preparer`, `implementer`, `integrator`)
self-pick under their contracts; two exact-key internal roles
(`issue-adversary`, `implementation-reviewer`) follow their parent's durable
assignment and never search a queue; `program-coordinator` is called only for
explicit program work. No session reviews or merges a diff it authored, and no
role commits to `main`.

Only PRs from trusted authors (owner or write-access collaborators) are ever
executed — a stranger's PR is never checked out, built, or run on a local
machine, only read and labeled `needs-human`. CI runs it under GitHub's
sandbox; this machine does not.

Gates, all green before a PR is ready:

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

**Outside-read gate.** Two independent implementation challenges — a fresh
Codex `implementation-reviewer` delegated by the implementer before handoff,
then a separate Opus challenge owned by the integrator — are required when the
diff touches `core`'s grammar or serializer, runs large or architectural, or
the implementer or integrator judges an outside read worthwhile. Both actively
hunt for counterexamples, missing failure paths, incorrect assumptions,
overengineering and overtesting; the integrator's own gate work and Copilot do
not substitute for either challenge. Only when none of those triggers fire does
the relaxation apply: a trivial or docs-only diff merges on the remaining gates
without the pair.

### Merge policy

- **Tier 1 — self-merge.** `Touches ⊆ {docs, repo}`, no new dependencies,
  no change to the process itself (`.github/`, `.claude/`, `.agents/`,
  `.codex/`, `AGENTS.md`).
- **Tier 2 — self-merge with evidence.** `core`, `demo`: all gates green
  plus a merge-report comment on the PR (acceptance criteria checked one by
  one, gate outcomes, rejected review findings with reasons).
- **Tier 3 — `needs-human`, pre-merge.** Any new runtime dependency; a
  change to the accepted grammar subset that could break the "valid mermaid
  elsewhere" rule; the layout-store format or its persistence contract;
  changes to the Hard rules above; overruling a major review finding; and
  any change to the process itself (`.github/`, `.claude/`, `.agents/`,
  `.codex/`, `AGENTS.md`). The owner authorizes a parked tier-3 merge by
  swapping `needs-human` for `human-approved`, or explicitly directing a
  session to do so for named PRs with a provenance comment; the integrator
  then executes that merge as tier 2, every other gate unchanged.

MIT.
