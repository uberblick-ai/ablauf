# Releasing ablauf

Publishing is effectively permanent: npm allows a qualifying unpublish only
within 72 hours of the publish, and after that the version is there for good.
So the release path is deliberately narrow — one manually dispatched GitHub
Actions workflow, run from `main` by the owner, with the npm credential held
as an environment secret; plus the same procedure by hand as a fallback.

The package is `@uberblick/ablauf`, public, ESM-only, zero runtime
dependencies. Versions follow the promise in the README: pre-1.0 a minor may
break the root export surface, a patch never does (D14).

Nothing releases on its own. `.github/workflows/release.yml` has exactly one
trigger, `workflow_dispatch`: merging a PR, pushing to `main`, or creating a
tag never publishes. (This supersedes the "no release automation until there
is a second release worth automating" note that stood here before #51; D14
itself is unchanged.)

## The ordering rule

Everything below follows from one rule:

```
gates → publish → verify the copy npm is serving → tag
```

The tag is pushed last, by a separate job, only after the *registry* artifact
has been re-checked — never the local checkout, which was already proven
before the publish. A tag naming a version consumers cannot install is worse
than no tag, so a run that publishes and then fails leaves no tag at all and
prints the recovery path below.

## The normal path: Actions → Release

1. Land the version bump on `main` and let CI go green. `package.json`'s
   `version` must already be exactly the version you intend to publish;
   nothing in the release run edits the manifest.
2. **Actions → Release → Run workflow**, branch `main`, version `0.1.0`
   (no leading `v`).
3. Approve the run: the publish job targets the `release` environment, so it
   waits for its required reviewer before a single step executes.
4. Watch it. It publishes at most once, and tags only on success.

Before it contacts npm with credentials, the run refuses unless every one of
these holds — `node scripts/release-preflight.mjs 0.1.0` asks the same
questions on a laptop, and prints every answer rather than the first failure:

- the dispatched ref is `refs/heads/main` (checked in the workflow);
- the input is a release version — `x.y.z`, no leading `v`, no prerelease or
  build metadata;
- the manifest is `@uberblick/ablauf` (D14) and carries exactly that version;
- it declares nothing installed at run time — `dependencies`,
  `optionalDependencies` and `peerDependencies` all empty;
- `HEAD` is the commit `origin/main` currently points at — asked again in the
  workflow immediately before the publish, since the gates take minutes and
  `main` can move under a run;
- no `v<version>` tag exists locally or on the remote;
- the version is not already on the registry. A registry that cannot be
  reached is a failure, not a green light — "we could not ask" must never be
  read as "not published".

Then the gates, on that same commit and the toolchain pinned in `mise.toml`:
`mise run install`, `lint`, `typecheck`, `test`, `build`, `agent-check`,
`acceptance` twice (the second run is the drift check), and `pack-check`.

`pack-check` is the release gate proper. It fails if the tarball ships source,
tests, fixtures, the demo, the acceptance output or `scripts/`; if it is
missing `dist/` JavaScript, declarations, `agent/`, `docs/spec/`, README or
LICENSE; if the published types do not resolve under either `bundler` or
`node16` resolution; or if parse → snap → render does not run in a project
whose only dependency is the tarball.

The publish itself is `npm publish --access public`, which runs `prepack` →
`npm run build`. Any registry error stops the run.

Afterwards the workflow runs `node scripts/pack-check.mjs --registry 0.1.0`,
which asks the same three questions of the copy npm is serving: it waits for
the version to appear, requires the registry's own metadata to list no
`dependencies`, `optionalDependencies` or `peerDependencies`, packs
`@uberblick/ablauf@0.1.0` *from the registry*, checks the shipped paths, and
installs that exact version into a throwaway consumer that typechecks the
public API and runs parse → snap → render. Only then does the `tag` job push
`v0.1.0` at the verified commit.

Finally, create the GitHub release from the tag if you want release notes to
have a home; nothing in the toolchain depends on one existing.

## Owner setup: the npm credential

The token is an **environment secret** of the `release` environment, which the
publish job declares. Only that job can read it, and reaching that job means
passing the environment's required reviewer. Say the consequence plainly: with
the token as a plain *repository* secret and no environment, anyone with write
access who can dispatch a workflow could publish. The environment is the
approval gate, not a formality.

Within the job, the secret reaches one step, the publish. The gates, the
registry verification and the tag job never see it, and no token, `.npmrc` or
credential value is committed, uploaded as an artifact, or echoed. The
`.npmrc` the publish step writes into the runner's temp directory contains the
*name* `${NODE_AUTH_TOKEN}`, which npm interpolates from the environment when
it reads the file; the value never reaches disk or the log.

To set it up, once:

1. On npmjs.com, as the account that owns the `@uberblick` org, create a
   **granular access token**: *Read and write* on the package
   `@uberblick/ablauf` only, no org or user scopes, and the shortest expiry
   you are willing to renew. Classic tokens no longer exist — npm removed them
   in November 2025 — so granular is the only kind there is.
2. Enable **Bypass 2FA** on that token. It is an explicit option, not a
   property granular tokens have by default, and without it an unattended
   `npm publish` cannot complete. npm recommends **trusted publishing** (OIDC)
   for CI instead, and has signalled that bypass tokens may lose the ability to
   publish directly; re-read <https://docs.npmjs.com/about-access-tokens> when
   you rotate, and move to trusted publishing if this stops working.
3. GitHub → **Settings → Environments → New environment**, name it exactly
   `release`. Add yourself under **Required reviewers**, so a dispatch waits
   for a human approval before the job starts. Optionally limit its deployment
   branches to `main`.
4. In that environment — not in *Secrets and variables → Actions* — add an
   **environment secret** named `NPM_TOKEN` and paste the value. The workflow
   still refers to it as `secrets.NPM_TOKEN`; environment secrets resolve
   through the same context, they are just scoped to the job. Never put the
   value in a file, an issue, a PR, or a commit.
5. Also recommended, configured in the repository rather than in YAML: protect
   `main` (required checks, no force-push). Do **not** add a tag protection
   rule or ruleset for `v*` casually — those apply to `GITHUB_TOKEN` as well,
   and a rule without a bypass for it makes the tag job fail *after* a
   successful publish, which is the one outcome this design exists to avoid.
   If you do add one, verify the workflow's token is allowed to create `v*`
   tags before the first real release.

Rotation: create the new token first, update the secret, run one release with
it, then revoke the old token on npmjs.com. Revoke immediately — and
independently of any release — if a token is ever pasted anywhere it can be
read, including a log. Nothing in this repository needs to change when the
token does.

## If the run fails

**Before the publish step ran** — nothing happened. Fix the cause and dispatch
again; the version is still unpublished and untagged.

**The publish step ran** — including when the publish step is itself the one
that failed, because an upload can land and the step still fail afterwards.
Only the registry knows, so ask it first:

```
npm view @uberblick/ablauf@0.1.0 version
```

The registry lags a moment behind an upload, so an immediate 404 proves
nothing: ask again after a minute or two — `pack-check --registry` waits for
the same reason. Only a 404 that persists means nothing was published, and then
you fix the cause and dispatch again. A version number means it is on npm,
unverified, and untagged — intentional, and recoverable:

1. Read the failing step. The usual causes are a slow registry (the
   verification waits a minute and gives up) and a genuine packaging problem
   that `pack-check` did not catch locally.
2. Re-run the verification by hand against the registry:
   `node scripts/pack-check.mjs --registry 0.1.0`.
3. If it passes, the artifact is good and only the tag is missing. Push it
   from a clean checkout of the released commit:
   `git tag v0.1.0 <sha> && git push origin v0.1.0`. Do not re-dispatch the
   workflow: the version cannot be published twice.
4. If it fails, do **not** tag. The version is broken on the registry: fix
   forward with a patch release, and deprecate the bad one
   (`npm deprecate @uberblick/ablauf@0.1.0 "…"`). Do not reuse the version
   number — npm never lets you.

**The tag job failed** — the release is published and verified; only the tag
is missing. Step 3 above is the whole repair. The likeliest cause is a tag
ruleset the workflow's token may not bypass (see owner setup).

## The manual path (fallback)

Use this when Actions is unavailable, or when the token has to stay off
GitHub. It covers stable `x.y.z` versions, the same ones the workflow takes —
prereleases are not covered by this procedure, and `release-preflight` rejects
them. It is the same sequence by hand, in the same order. From a clean checkout
of the commit you intend to release, on `main`:

```
node scripts/release-preflight.mjs 0.1.0
mise run install
mise run lint
mise run typecheck
mise run test
mise run build
mise run agent-check
mise run acceptance     # twice — the second run is the drift check
mise run pack-check     # builds, packs, installs the tarball into a consumer
```

Then publish, verify the registry copy, and only then tag:

```
npm whoami                          # expect the account that owns @uberblick
npm publish --access public         # `--dry-run` first if in doubt
node scripts/pack-check.mjs --registry 0.1.0
git tag v0.1.0
git push origin v0.1.0
```

`publishConfig.access` already says `public`, so the flag is belt and braces
on a scoped package that would otherwise default to restricted. `prepack`
calls `npm run build`, which needs nothing but the checkout's own
`node_modules` — the pinned toolchain matters for the gates above, not for
the publish itself.

If you want to look at the published artifact yourself, that is what the
registry check does under the hood:

```
# expect all three empty; ask one at a time, `npm view` flattens its output
# when only one of several requested fields exists
npm view @uberblick/ablauf@0.1.0 dependencies
npm view @uberblick/ablauf@0.1.0 optionalDependencies
npm view @uberblick/ablauf@0.1.0 peerDependencies
npm pack @uberblick/ablauf@0.1.0                # the published tarball
tar -tzf uberblick-ablauf-0.1.0.tgz             # the shipped paths
```

## If something is wrong after publishing

npm's unpublish window is 72 hours, and only for a version nothing depends on;
past that the version is permanent. Even inside the window, do not use it
unless the release is minutes old and demonstrably broken — pulling a version
other people may already have pinned is worse than superseding it. The normal
repair is `npm deprecate @uberblick/ablauf@0.1.0 "…"` plus a patch release.
