# Releasing ablauf

Publishing is effectively permanent: npm allows a qualifying unpublish only
within 72 hours of the publish, and after that the version is there for good.
So the release path is deliberately narrow — one manually dispatched GitHub
Actions workflow, run from `main` by the owner, with the npm credential held
as a repository secret; plus the same procedure by hand as a fallback.

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
3. Watch the run. It publishes at most once, and tags only on success.

Before it contacts npm with credentials, the run refuses unless every one of
these holds — `node scripts/release-preflight.mjs 0.1.0` asks the same
questions on a laptop, and prints every answer rather than the first failure:

- the dispatched ref is `refs/heads/main` (checked in the workflow);
- the input is a release version — `x.y.z`, no leading `v`, no prerelease or
  build metadata (a prerelease goes the manual path);
- `package.json` carries exactly that version, and declares no runtime
  dependencies;
- `HEAD` is the commit `origin/main` currently points at;
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
the version to appear, requires the registry's own metadata to list no runtime
dependencies, packs `@uberblick/ablauf@0.1.0` *from the registry*, checks the
shipped paths, and installs that exact version into a throwaway consumer that
typechecks the public API and runs parse → snap → render. Only then does the
`tag` job push `v0.1.0` at the verified commit.

Finally, create the GitHub release from the tag if you want release notes to
have a home; nothing in the toolchain depends on one existing.

## Owner setup: the npm credential

The workflow reads the token from the repository secret `NPM_TOKEN` and gives
it to one step, the publish. Nothing else in the run — the gates, the registry
verification, the tag job — can see it, and no token, `.npmrc` or credential
value is ever committed, uploaded as an artifact, or echoed. The `.npmrc` the
publish step writes into the runner's temp directory contains the *name*
`${NODE_AUTH_TOKEN}`, which npm interpolates from the environment when it
reads the file; the value never reaches disk or the log.

To set it up, once:

1. On npmjs.com, as the account that owns the `@uberblick` org, create a
   **granular access token** with *Read and write* permission on
   `@uberblick/ablauf` only, no org or user scopes, and the shortest
   expiry you are willing to renew. (A classic **automation** token works
   too; it is just less scoped.) A granular token also skips 2FA on publish,
   which is what makes an automated publish possible at all.
2. GitHub → **Settings → Secrets and variables → Actions → New repository
   secret**, name `NPM_TOKEN`, paste the value. Never put it in a file, an
   issue, a PR, or a commit.
3. Recommended, and configured in the repository rather than in YAML: protect
   `main` (required checks, no force-push), add a **tag protection rule** for
   `v*` so only this workflow's token can create release tags, and give the
   `Release` workflow an **environment** with a required reviewer, so a
   dispatch waits for a human approval before the job starts.

Rotation: create the new token first, update the secret, run one release with
it, then revoke the old token on npmjs.com. Revoke immediately — and
independently of any release — if a token is ever pasted anywhere it can be
read, including a log. Nothing in this repository needs to change when the
token does.

## If the run fails

**Before the publish step** — nothing happened. Fix the cause and dispatch
again; the version is still unpublished and untagged.

**After the publish step** — the version is on npm and was *not* verified, and
no tag was pushed. That state is intentional and recoverable:

1. Read the failing step. The usual causes are a slow registry (the
   verification waits a minute and gives up) and a genuine packaging problem
   that `pack-check` did not catch locally.
2. Re-run the verification by hand against the registry:
   `node scripts/pack-check.mjs --registry 0.1.0`.
3. If it passes, the artifact is good and only the tag is missing. Push it
   from a clean checkout of the released commit:
   `git tag v0.1.0 <sha> && git push origin v0.1.0`.
4. If it fails, do **not** tag. The version is broken on the registry: fix
   forward with a patch release, and deprecate the bad one
   (`npm deprecate @uberblick/ablauf@0.1.0 "…"`). Do not reuse the version
   number — npm never lets you.

## The manual path (fallback)

Use this when Actions is unavailable, when publishing a prerelease, or when
the token has to stay off GitHub. It is the same sequence by hand, in the same
order. From a clean checkout of the commit you intend to release, on `main`:

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
npm view @uberblick/ablauf@0.1.0 dependencies   # expect empty
npm pack @uberblick/ablauf@0.1.0                # the published tarball
tar -tzf uberblick-ablauf-0.1.0.tgz             # the shipped paths
```

## If something is wrong after publishing

npm's unpublish window is 72 hours, and only for a version nothing depends on;
past that the version is permanent. Even inside the window, do not use it
unless the release is minutes old and demonstrably broken — pulling a version
other people may already have pinned is worse than superseding it. The normal
repair is `npm deprecate @uberblick/ablauf@0.1.0 "…"` plus a patch release.
