# Project loop policy

Read [AGENTS.md](../AGENTS.md) first: it holds the project facts and the
constraints every change keeps.

## Checks

Run `mise run ci` (lint, typecheck and tests) on the final change and record the
result. A change that alters rendered output updates the committed renders in the
same PR and names in the PR body which ones changed and why. A check that passes
only after changing its environment or skipping tests has not passed.

## Merging

The integrator squash-merges when the reviewer approved the current head and the
`lint, typecheck and tests` check is green on it. A PR that changes
`ub-agents.yaml`, `.agents/`, `AGENTS.md`, CI workflows, the package name, its
exports or version, or the licence is a maintainer merge. Never enable
auto-merge, approve your own PR, change branch protection, publish to npm, or
create tags or releases. Implementation PR bodies start with `Closes #N`.

## Human decisions

`@uberblick-ai/maintainers` answers scope and policy questions. The format is
free to change throughout 0.x: when implementing it or an example shows a better
form, change the code and update `docs/plan.md` in the same PR. A keyword, key or
syntax rule the issue doesn't need is still a scope question. An issue's author
may answer only if they have write access.

## Review focus

- Behavior matches `docs/plan.md` together with the PR's changes to it. A
  mismatch is a finding; never quietly change either side.
- The constraints in AGENTS.md: no runtime dependencies, deterministic and inert
  output, diagnostics instead of silent drops or moved nodes.
- The public API: everything exported is a promise. The PR names additions;
  removals and renames need a maintainer.
- Every new diagnostic has a test with its line number. Every new kind or key
  appears in an example.
