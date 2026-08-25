# Issue spec — loop-ready issues

The contract for issues the implementation loop (`/next-issue`) may pick up.
The loop's triage step lints against this spec: an issue labeled `ready` that
fails any check below gets a comment listing exactly what's missing, loses the
`ready` label, and is skipped. Bad input is bounced, never interpreted — the
loop must not fill gaps by guessing.

Design principle: anything **derivable** (blocked state, execution order) is
computed, never stored; anything **not derivable** (dependencies, footprint,
scope) must be declared.

## Machine-readable header

The first lines of the issue body, before any heading:

```
Depends-on: #2, #3
Touches: core, docs
```

- **`Depends-on`** — mandatory, even when empty. `none` or a comma-separated
  list of issue refs. Grammar: `^Depends-on: (none|#[0-9]+(, #[0-9]+)*)$`.
  A missing line means *untriaged*, which is different from `none`; untriaged
  issues are never eligible.
- **`Touches`** — mandatory. Comma-separated footprint names, lowercase, from:
  `core` (parser, layout, renderer — the dependency-free library), `demo`
  (the dependency-free demo page and gallery under `demo/`), `docs` (README,
  docs/), `repo` (root config, CI, `.github/`, `.claude/`). Grammar:
  `^Touches: [a-z0-9-]+(, [a-z0-9-]+)*$`, every name from that list.
- **`Priority`** — optional third line. `high`, `normal`, or `low`; absent
  means `normal`. Grammar when present: `^Priority: (high|normal|low)$`.

### Scheduling semantics

- **Eligible** = labeled `ready` AND every `Depends-on` issue is closed AND
  not claimed.
- Parallelism is judged at **file** level, not `Touches`-set level. From the
  issues' scope and Pointers the loop forms an expectation of which files each
  will edit, and dispatches in parallel (separate worktrees) whenever those
  are expected to be disjoint; where files cannot be foreseen with confidence,
  the issues queue. A wrong expectation costs a rebase, not a lost gate.
- `core` grammar changes (the parser's accepted subset or the serializer)
  **serialize globally** — every adapter depends on them; nothing else is
  dispatched while such an issue is in flight.
- Order among eligible issues: dependency topology, then `Priority`
  (high → normal → low), then ascending issue number.

### Gate check

`Touches` is a declared claim, verified at review time: the PR diff must stay
within the declared footprint. A diff that escapes it is a finding — either
the issue was mis-scoped or the agent scope-crept. Resolve explicitly, never
silently.

## Labels — lifecycle

| Label | Meaning | Set by |
|---|---|---|
| *(none)* | Draft — invisible to the loop | — |
| `ready` | Spec-complete; the loop may claim it | Human (or agent with human sign-off) |
| `in-progress` | Claimed; branch named in a comment | Loop |
| `needs-decision` | Parked on a question only a human can answer | Loop |

There is deliberately **no `blocked` label**: blocked is derived from
`Depends-on` plus issue closed-state.

`needs-decision` exit path: the loop asks the question as an issue comment
(concrete options, its recommendation). A human answers in a comment; whoever
resolves it removes `needs-decision` and restores `ready` — restoring `ready`
asserts the decision is now written into the issue body, not just the thread.

### Claim protocol

On claiming, the loop adds `in-progress` and comments `Claimed: <branch>`
(e.g. `Claimed: feat/parser-subgraphs`). Recovery rule: an issue carrying
`in-progress` whose named branch has no live worktree and no open PR is stale
and may be reclaimed. Claims live on GitHub, never in a session's memory.

## Body sections

Five required `##` headings after the header. The bar for all of them:
**would the implementing agent have to make a product decision the issue
doesn't answer? Then the issue is not `ready`.**

- **What** — one paragraph, the outcome in behavioral terms.
- **Why** — a sentence or two, tied to the README charter or a decision in
  `docs/decisions.md`. Keeps the agent from "improving" beyond intent.
- **Acceptance criteria** — a checkbox list (`- [ ]`) where **every item is
  verifiable by running something**: a test, a command, an observable
  behavior. For ablauf the standing bar is the mermaid contract: "this input
  renders identically in mermaid" and "the hint round-trip survives edit X"
  are the shape of a good criterion.
- **Out of scope** — explicit non-goals, or `None.`
- **Pointers** — where a fresh agent should look first: files, prior PRs
  and issues, CLAUDE.md sections, `docs/decisions.md` entries, known
  gotchas. Cite, never restate. `None.` only when CLAUDE.md genuinely
  covers it.

## Sizing

One issue = one PR by default, reviewable in one sitting. Work that needs
multiple PRs becomes a parent issue split into loop-ready children; parents
are never labeled `ready`.

The exception runs the other way: individually-trivial issues declaring the
same `Touches` set may go to one agent as one PR closing several
(`Closes #a, #b`), provided the combined diff is reviewable in one sitting,
the gate check is applied to the combined diff, and the PR carries a merge
report checking each issue's acceptance criteria separately.

## Lint — the exact checks

An issue labeled `ready` must pass all of:

1. `Depends-on` line present, first section, matching the grammar.
2. `Touches` line present, matching the grammar, every name valid.
3. `Priority` line, when present, matches its grammar.
4. All five `##` sections present: What, Why, Acceptance criteria,
   Out of scope, Pointers.
5. At least one `- [ ]` checkbox under Acceptance criteria.
6. Out of scope and Pointers are non-empty (explicit `None.` is acceptable).

Sizing and decision-completeness are judgment calls, not lintable — the
coordinator applies them when granting or revoking `ready`.
