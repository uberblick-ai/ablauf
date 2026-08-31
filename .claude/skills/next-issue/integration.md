# integration — advancing one PR through the gates to a merge

The mechanics of the `integrator` role, for one PR at one head SHA. CLAUDE.md's
"Working on this repo" owns *which* gates exist and when each applies,
including the outside-read gate; drive them in the order it lists. This file
owns only their mechanics, and `review-protocol.md` beside it owns the
findings-conditional protocol.

## Gate mechanics

- **Trusted authors only — before any checkout.** Confirm the PR author is the
  repo owner or a collaborator with write access
  (`gh api repos/{owner}/{repo}/collaborators/{author}/permission`). Any other
  author means: no checkout, no install, no build, no script execution on this
  machine; label the PR `needs-human`, comment that it awaits a trusted review,
  and stop. CI runs it under GitHub's sandbox; this machine does not.
- Resolve and record the PR's immutable `headRefOid`, fetch it, and run the
  gates at that commit in a throwaway worktree
  (`git worktree add <dir> <headRefOid>`) — never against a mutable shared
  checkout, and never treat tests from one as merge evidence. The gates are the
  documented `mise` tasks: `lint`, `typecheck`, `test`, `build`, and
  `acceptance` twice — the second run is the drift check. Remove the worktree
  once the PR is settled.
- Probe failure behavior when the change crosses a stateful boundary (parser
  recovery on malformed input, hint survival under semantic edits, adapter
  lifecycle); happy-path tests alone do not close those criteria.
- Record every gate result against the commit SHA it ran at — the worktree
  gates, CI, the acceptance validation, both adversarial verdicts where the
  outside-read gate applied, and any Copilot result when one was requested. A
  Copilot platform refusal is recorded once and does not block merge. Any new
  commit on the branch (fix-ups included) invalidates the gate evidence: re-run
  at the new `headRefOid`. For either earlier adversarial verdict, follow
  `review-protocol.md`'s risk-scoped re-review rule; either run a fresh round
  or record exactly which reasoning still applies and why. The integrator's own
  gate work does not fill a missing challenger slot.
- Check an acceptance box on a linked issue only with evidence (command output,
  test name), and check that the diff stays within the declared `Touches` — the
  shared set when the PR closes a batch.

**Re-read before ruling.** Immediately before any ruling — a triage disposition,
an acceptance validation, a tier call, a merge — re-read the linked issue thread
and the PR thread (`gh issue view <n> --comments`, `gh pr view <n> --comments`).
Owner decisions land there mid-flight; a ruling made from session memory can
contradict one that was written down while you were elsewhere.

**Findings.** `review-protocol.md` is the whole findings-conditional protocol —
the external round's mechanism and brief, finding triage, the one batched fix-up
wave per review head, risk-scoped re-review with the round-count rule, and the
exit condition. Read it whenever a PR has a round to request or a finding to
disposition.

## Immediately before merging

Re-fetch the PR's reviews and comment threads (`gh pr view <n> --comments` plus
review threads via `gh api graphql` — inline review comments don't show in the
former) and confirm zero unaddressed remarks, human or bot, including any that
arrived after the earlier gates passed; anything open is triaged first. Confirm
the PR's base is `main` (`gh pr view <n> --json baseRefName`) — a stacked PR
merges into its parent feature branch and can orphan the reviewed work; retarget
the PR to `main` (or merge the parent first) before merging.

**Tier check.** Classify the PR against CLAUDE.md's merge tiers by reading its
full diff (`gh pr diff <n>`) and how its review findings were dispositioned —
never from the issue's `Touches` alone. `--name-only` is just the pathname
inventory: it identifies hunks to classify but never fires tier 3 by itself.
The triggers live in the change — for example a `package.json` entry under
`dependencies`, a grammar change that loosens the mermaid subset, a
layout-store or hint format change, a CLAUDE.md Hard-rules hunk, or a
process-directory hunk. A tier-3 trigger means you do not merge: label the PR
`needs-human`, comment which trigger fired, fire a PushNotification naming the
PR and the trigger so the owner learns a merge decision awaits them, then park
it and report.

**Exception — `human-approved`.** A PR carrying the owner-set `human-approved`
label is merge-authorized: execute the merge as tier 2 (merge report first),
every other gate unchanged — evidence fresh at the exact merge head, zero
unaddressed remarks. The owner sets the label directly or explicitly directs a
session to set it for named PRs; that session posts the direction as provenance.
Never infer approval from `ready` or an unrelated owner comment. Approval covers
the intended PR shape plus fix-ups and non-rewriting synchronization with
`main`; if later commits materially expand the design or scope, replace it with
`needs-human` and name the delta.
Tier 1 and Tier 2 self-merge as CLAUDE.md specifies (Tier 2 requires the
merge-report comment on the PR first). Every merge report ends with two
machine-readable lines — `findings_p1_p2_p3: <n>/<n>/<n>` and
`deferred_findings: <issue refs or none>` — and only these two: timestamps,
round counts and run counts stay derivable from the PR thread and are never
restated (ISSUE_SPEC's derivability principle). Syntax, so the lines parse the
same way every time: counts are **distinct triaged findings for the whole PR**
(a remark repeated across rounds or reviewers counts once); refs are
comma-separated `#<n>` issue numbers, or the literal `none`.

**Gate freshness, at merge time.** Make the merge itself conditional on the
recorded gate SHA — `gh pr merge <n> --match-head-commit <gate-sha> …` — so a
commit landing after the last check fails the merge instead of riding stale
evidence; comparing `gh pr view <n> --json headRefOid` beforehand is for the
report, not the guarantee. Freshness covers the base too: if `origin/main`
advanced after the gates and its changed files overlap the PR, gate the
prospective merged tree and repeat if the base moves again. Either kind of
mismatch returns to the gates.

## After merging

Confirm every issue the PR closes auto-closed. Then update `docs/decisions.md`
when the PR settled a decision the log does not yet record, per its edited-in-
place convention. Record the result on the PR. A fresh integrator does not own
or restart another session's development processes.
