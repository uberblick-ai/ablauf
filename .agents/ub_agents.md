# Project loop policy

## Checks

`mise run ci` runs lint, typecheck and tests; `AGENTS.md` lists the project's
commands. Run it before handoff and record the result. A check that passes only
after changing its environment or skipping tests has not passed.

A change that affects rendering also runs `mise run render` and commits what it
rewrites in `spike/out/` and `docs/images/`. A test covers only
`spike/out/loop.svg`, so the reviewer and the integrator rerun `mise run render`
at the candidate: it must report no diagnostics and leave `git status` clean.

## Merging

The integrator squash-merges a PR when, at the head it merges:

- the reviewer approved the candidate SHA (the integrator's own clean base merge
  keeps that approval);
- the `lint, typecheck and tests` check passed on GitHub for that head
  (`gh pr checks N --watch` waits for it);
- `mise run ci` and `mise run render` pass as above;
- the body starts with `Closes #N` for an open issue.

A PR that meets those gates is still a maintainer merge (`maintainer-merge`) when
it:

- changes a figure in `spike/out/` or `docs/images/`: no agent sees the render,
  so a maintainer checks it in light and dark with `mise run playground`;
- changes the workflow, policy or checks: `.github/`, `.agents/`,
  `ub-agents.yaml`, `AGENTS.md`, `mise.toml`, `biome.jsonc` or `tsconfig.json`;
- changes `package.json` or `pnpm-lock.yaml`, or works on packaging, publishing
  or releases;
- changes `examples/approvals.json`, which only a person's Approve writes.

Never enable auto-merge, approve your own PR, change branch protection or
repository settings, create tags or releases, or publish to npm.

## Human decisions

`@uberblick-ai/maintainers` answer scope and policy questions. An issue's author
may answer only if they have write access. Use the responsible role's correction
or handoff route when that role must act next.

## Review focus

Breaking a constraint in `AGENTS.md` is P1:

- a runtime dependency: anything outside `devDependencies`;
- output that is not deterministic and inert: the same source gives the same SVG
  bytes, styles stay under the root class, colours come from `--ab-*` properties
  with light and dark defaults, all source text is escaped, and no script, event
  handler or URL from the source is emitted;
- the renderer moving a node or rerouting an edge to avoid a problem: every
  problem is a diagnostic with its line number, the diagram still draws, and
  nothing in the source is silently dropped;
- any change to `examples/approvals.json`.

Also check:

- The change stays within the issue's scope; other ideas become follow-up issues.
- New behavior has tests that fail without the change.
- No secrets, and no untrusted text reaching commands or output.
- A change to the format or the renderer's rules updates `docs/plan.md`, and
  `spike/PRIMER.md` when an authoring agent needs to know it.
- The simplest working change wins; no dead code or speculative options.
