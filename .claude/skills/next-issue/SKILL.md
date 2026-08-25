---
name: next-issue
description: One iteration of the implementation loop — observe GitHub, advance open PRs through the gates, dispatch Opus sub-agents for eligible issues per .github/ISSUE_SPEC.md. Designed to be driven by /loop (e.g. `/loop /next-issue`); a single manual invocation runs exactly one iteration.
---

# next-issue — one iteration of the implementation loop

You are the coordinator: you observe, decide, validate, and merge — you never
write feature code. All implementation happens in Opus sub-agents. The issue
contract is `.github/ISSUE_SPEC.md`; read it before triaging — it is
authoritative for the header grammar, labels, claim protocol, scheduling
semantics, and lint. The gates and merge tiers are CLAUDE.md's "Workflow"
section. This file restates neither.

## Hard rules

- **Trusted authors only — never execute a stranger's PR.** Before checking
  out, installing, building, or testing any PR head, confirm the PR author is
  the repo owner or a collaborator with write access
  (`gh api repos/{owner}/{repo}/collaborators/{author}/permission`). Any
  other author — including once this repo is public — means: no checkout, no
  install, no script execution; label the PR `needs-human`, comment that it
  awaits a trusted review, and move on. CI runs it under GitHub's sandbox;
  this machine does not.
- Dispatch implementation to Opus sub-agents: `model: opus`,
  `isolation: worktree`. Never edit feature code in the main checkout — it may
  hold the user's uncommitted work; worktrees only.
- The coordinator's own repo edits (skill or docs changes, commits) also
  happen in a worktree (EnterWorktree), never in the shared checkout. Even
  small doc/skill edits are dispatched to Opus sub-agents; the coordinator
  briefs, validates, and merges.
- The loop never commits to `main`. Code reaches `main` only through a PR
  that passed every gate.
- Bounce nonconforming input per the spec's lint; never fill gaps by guessing.
- Escalate genuine product decisions via the spec's `needs-decision` path
  (comment with concrete options + your recommendation), notify the user
  (PushNotification), then park the issue and move on — never block the loop
  on it.
- Edit issue/PR bodies only via `--body-file` with a file written by the Write
  tool. Never build the file with shell redirection (`>` — noclobber has
  silently emptied issue bodies before), and verify body length after editing.

## Iteration

1. **Observe.** First, self-update the checkout: `git fetch origin main`
   unconditionally; then, only when the checkout is on `main` **and**
   `git status --porcelain` is empty, `git merge --ff-only origin/main` —
   `--ff-only` alone is not a cleanliness check (it can fast-forward around
   non-overlapping uncommitted edits, silently moving user work onto a new
   base, against the hard rule above). A dirty worktree or a refused
   fast-forward is reported and skipped, never forced — continue the
   iteration as-is. Note the built-in lag: this invocation loaded its instructions
   before the pull, so a protocol change on `main` governs from the next
   invocation onward.
   Then `gh issue list --state open`, `gh pr list --state open`, and for each
   open PR its checks and reviews. Reconcile claims: apply the spec's
   stale-claim recovery rule.

2. **Advance open PRs first** — an open PR is closer to value than a new
   dispatch, and this includes PRs that predate the loop. For each, drive the
   CLAUDE.md gates in order:
   - resolve and record the PR's immutable `headRefOid`, fetch it, and run
     the gates at that commit in a throwaway worktree
     (`git worktree add <dir> <headRefOid>`) — never against a mutable shared
     checkout. Run the repo's test and typecheck scripts from `package.json`
     when they exist; until tooling lands, reproduce the verification the PR
     body claims (the render-as-mermaid check, the hint round-trip) and record
     what you ran. Remove the worktree once the PR is settled;
   - probe failure behavior when the change crosses a stateful boundary
     (parser recovery on malformed input, hint survival under semantic edits,
     adapter lifecycle); happy-path tests alone do not close those criteria;
   - record every gate result against the commit SHA it ran at. Any new
     commit on the branch (fix-ups included) invalidates the evidence: re-run
     the gates at the new `headRefOid` rather than carrying a verdict forward;
   - your validation against every acceptance checkbox on each linked issue —
     check a box only with evidence (command output, test name);
   - gate check: the diff stays within the declared `Touches` — the shared set
     when the PR closes a batch;
   - GitHub Copilot review requested and returned;
   - a second-model review (the codex plugin, or under herdr —
     `test "${HERDR_ENV:-}" = 1`, herdr skill — the Codex pane directly) when
     the diff touches `core`'s grammar or serializer, is large or
     architectural, or your judgment says an outside read helps; a trivial or
     docs-only diff may skip it. Brief: be critical, hunt for overtesting and
     overengineering per CLAUDE.md's principles. Under herdr, answer its
     findings, push fixes, and re-request within the re-review scoping below,
     never open-endedly.
   **Finding triage — before any fix-up brief.** A finding is not
   automatically a work item; every finding is triaged explicitly against
   the supported usage model (a library consumed by one host — uberblick —
   through the documented contracts: the mermaid-subset text, the layout
   store, `snap`, `toSvg`; deterministic across CRDT replicas; parallel
   loop-dispatched agents; pre-1.0 API). Record three independent decisions
   per finding — severity does not decide the other two:
   - **Severity.** P1: supported usage can corrupt or lose layout, break a
     CLAUDE.md Hard rule (a frozen node moves, non-deterministic output, a
     grammar that mermaid elsewhere rejects, a forbidden import), or render
     the library materially unusable. P2: a real correctness, reliability,
     or maintainability defect within supported usage, without P1 impact.
     P3: minor, local, or low-impact.
   - **Disposition.** *Fix now* — the default for P1 and for contained
     supported-usage P2s. *Defer* — only for a non-blocking P2/P3 whose fix
     is disproportionate right now: create a linked issue and record the
     concrete accepted risk on the PR; never defer a Hard-rule violation or
     layout loss. *Document boundary* — reachable only outside the usage
     model: the smallest useful code/doc statement naming the boundary; no
     behavior changes, no tests for an unsupported scenario. *Reject* — not
     reachable, factually wrong, or cost clearly exceeds stake: reply with
     evidence on the thread. Never silent dismissal, and no category
     shortcuts ("hosts won't pass that" is not evidence — the host is an
     editor with agents writing into it).
   - **Verification.** Who confirms the fix: the coordinator (focused diff
     read, the finding's test failing-then-passing, failure-path probe where
     stateful) or an external re-review round per the scoping below. A
     subtle P2 fix may need outside eyes; a tiny P1 correction with a
     focused proof may not.
   **One batched fix-up wave per review head.** Collect Codex, Copilot and
   coordinator findings against the same head and triage them all first;
   then one decision-complete brief, one Opus dispatch, one re-gate at the
   new head — never a dispatch per finding or per reviewer. Standing brief
   constraints: smallest diff that closes the accepted findings; tests only
   for the contract or invariant a finding names, never for the mechanics
   of the fix. Fix-up diffs face the same Touches, scope-escape and
   overtesting checks as feature diffs. Late findings still get an explicit
   disposition, but reviewer timing must not manufacture extra waves.
   **Risk-scoped external re-review.** A further Codex round is required
   while a P1 remains open; and for a P2/P3 fix when it sits at a
   contract boundary (the freeze rule and snap validation, the layout-store
   format or host-integration contract, the accepted grammar subset or
   serializer output, determinism of `snap`/`toSvg`, the core's import
   boundary) **and** is non-local, introduces new state, changes the design
   that answered the original finding, or lacks a focused test proving it —
   a one-line mechanical fix at such a boundary, proven by its test, is
   coordinator territory; and whenever reviewer or coordinator names a
   concrete risk rationale. Re-review briefs are delta-first: the fixes and
   the invariants they touch, expanding to the whole PR only when a fix
   invalidates earlier reasoning. After four external rounds, a further full
   round needs a PR comment naming the concrete unresolved risk. Record
   every round as a PR comment — `Codex round N (head <sha>): <verdict>` —
   so round counts stay derivable from the thread.
   **Exit and convergence.** Review exits only when: no P1 remains; every
   supported-usage P2 is fixed or explicitly deferred (linked issue,
   accepted-risk rationale); every remark is fixed, deferred, documented or
   rejected explicitly; all gate evidence is fresh at the exact merge head;
   and any earlier external-review reasoning carried across a later local
   fix is recorded on the PR with scope and rationale. If a confirmation
   round surfaces a net-new triaged P1, or the open-P1 set fails to shrink
   after a directed correction wave, park the PR `needs-human` with the
   finding list instead of looping — but never park for a false positive, an
   unrelated pre-existing issue, or a finding rejected with evidence.
   **Final gate, immediately before merging:** re-fetch the
   PR's reviews and comment threads (`gh pr view <n> --comments` plus review
   threads via `gh api graphql` — inline review comments don't show in the
   former) and confirm zero unaddressed remarks, human or bot. Confirm the
   PR's base is `main` (`gh pr view <n> --json baseRefName`); a stacked PR
   merges into its parent and orphans the reviewed work — retarget first.
   **Tier check, before any merge:** classify the PR against CLAUDE.md's
   merge tiers by reading its full diff (`gh pr diff <n>`) and how its review
   findings were dispositioned — never from the issue's `Touches` alone. The
   semantic triggers live in the hunks: a `package.json` entry under
   `dependencies`, a grammar change that loosens the mermaid subset, a hint
   format change, a CLAUDE.md Hard-rules hunk. A tier-3 trigger means you do
   not merge: label the PR `needs-human`, comment which trigger fired, fire a
   PushNotification naming the PR and the trigger, park it, continue. Tier 1
   and Tier 2 self-merge as specified (Tier 2 requires the merge-report
   comment first). Every merge report ends with two machine-readable lines —
   `findings_p1_p2_p3: <n>/<n>/<n>` and `deferred_findings: <refs or none>` —
   and only these two: timestamps, round counts and run counts stay
   derivable from the PR thread and are never restated (ISSUE_SPEC's
   derivability principle). Syntax, so the lines parse the same way every
   time: counts are **distinct triaged findings for the whole PR** (a remark
   repeated across rounds or reviewers counts once); refs are
   comma-separated `#<n>` issue numbers, or the literal `none`.
   **Gate freshness, at merge time:** `gh pr merge <n> --match-head-commit
   <gate-sha> …` so a commit landing after the last check fails the merge
   instead of riding stale evidence; a mismatch returns to the gates. After
   merging, confirm every issue the PR closes auto-closed, then update
   `docs/decisions.md` when the PR settled a decision the log does not yet
   record.

3. **Lint `ready` issues** against the spec's checklist. Failures: comment
   exactly what's missing, remove `ready`, skip.

4. **Compute the eligible set and order it** per the spec's scheduling
   semantics (deps closed, unclaimed; topology → Priority → number).

5. **Conflict analysis.** Apply the spec's scheduling rules (grammar changes
   serialize globally; expected file-level overlap decides, not the `Touches`
   sets). Cap work in flight — claimed issues plus unmerged PRs — at 4: the
   bottleneck is the gates, not implementation.

6. **Dispatch.** For each issue to start: add `in-progress`, comment
   `Claimed: feat/<slug>` (or `fix/`). **Announce the work to the user** in
   your visible output: one or two plain sentences on what the issue is and
   why it's next, plus the direct GitHub URL (`gh issue view <n> --json url`).
   Then spawn an Opus sub-agent whose brief is decision-complete but pulled,
   not pushed: pass the full issue body and the applicable CLAUDE.md Hard
   rules, and instruct the agent to START by reading the docs its Pointers
   cite — `docs/decisions.md` and `docs/spec/` in this repo — before any
   implementation. You inline only what those cannot serve: PR diffs, review
   threads, decisions taken in this session.
   Then the contract: branch from fresh `main`, implement, test + typecheck
   green (or, pre-tooling, a reproducible verification recipe in the PR
   body), push, open a PR with `Closes #N` and a body stating what changed
   and how it was verified; any live doc the agent finds contradicting the
   code is named as a discrepancy in that PR body. Sub-agents never merge.
   Several individually-trivial issues with the same `Touches` set may go to
   one agent as one batch per the spec's sizing exception: claim each
   separately, brief all bodies, one PR closes them all with a merge report
   per issue.

7. **Report.** End with a short status a human can skim: PRs advanced (which
   gate), issues dispatched / bounced / parked, what the loop is waiting on.
   Every issue or PR named carries its direct GitHub URL.

## Pacing under /loop (dynamic mode)

- Running sub-agents re-invoke you when they finish — never schedule short
  wakeups to poll them. Long fallback: 1200s.
- Waiting only on an external signal (Copilot review, a human answering a
  `needs-decision`): ~300s.
- Nothing eligible and nothing in flight: 300s with `noop: true` — the owner
  wants idle-time change detection at least every 5 minutes. Do not stop the
  loop yourself; the user stops it.
