# Project loop policy

## Checks

Project checks are documented in `AGENTS.md`.

Run the relevant checks before handoff and record the results. A check that passes
only after changing its environment or skipping tests has not passed.

## Merging

The integrator squash-merges when the reviewer approved the current head and both
`mise run ci` and GitHub CI pass on it. A maintainer (`@uberblick-ai/maintainers`)
merges PRs that change `.agents/`, `ub-agents.yaml`, `AGENTS.md`, `.github/`,
`examples/approvals.json` or the package version, and anything else that touches
workflow, permissions or release policy.
Never enable auto-merge, approve your own PR, change branch protection or publish
releases. Implementation PR bodies start with `Closes #N`.

## Human decisions

`@uberblick-ai/maintainers` answers scope and policy questions. An issue's author
may answer only if they have write access. Use the responsible role's correction or
handoff route when that role must act next.

## Review focus

Defaults; adjust them to the project's priorities.

- The change stays within the issue's scope; other ideas become follow-up issues.
- New behavior has tests that fail without the change.
- No secrets, and no untrusted text reaching commands or output.
- Changed behavior is documented where users and agents read it.
- The simplest working change wins; no dead code or speculative options.
