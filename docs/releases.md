# Maintainer releases

Release preparation is separate work: merge the intended stable `X.Y.Z` in
`package.json` and create/update `CHANGELOG.md`. This command neither bumps a
version nor writes notes. Each release needs exactly one heading of the form
`## X.Y.Z — YYYY-MM-DD`, with a valid calendar date and a non-empty body.
The complete body is used verbatim, from after the heading's line ending to
before the next level-two heading (or EOF). Blank lines and trailing newlines
are retained. A missing file, duplicate version heading or empty body is no-go.

From a clean checkout at current `origin/main`, with the pinned mise toolchain,
Git, authenticated GitHub CLI (`gh`) and npm available, a maintainer runs:

```sh
mise run release 0.3.0 --check
mise run release 0.3.0
```

Replace `0.3.0` with the prepared version. Both commands fetch main and require
HEAD to equal it, the package version to match, no existing local/origin version
tag, and the latest `ci.yml` run for that exact SHA to have completed successfully.
`--check` prints the version, full commit SHA and complete notes. It does not
dispatch, publish, tag, create a release or change project files. Fetching updates
Git's remote-tracking refs. Wait for pending CI with `gh run watch RUN_ID --exit-status`,
then repeat the check. Failed CI is no-go.

Review the version, SHA and notes before publication. Agents may run `--check`
and read remote state; only a maintainer executes the publication command. The
[release skill](../.agents/skills/release/SKILL.md) requires explicit confirmation
and hands that command to the maintainer. The publication command repeats all
checks, so a changed main or checkout requires reviewing the new checked SHA.
For a confirmed skill handoff, use `mise run release X.Y.Z --commit CHECKED_FULL_SHA`
with literal values: it refuses if HEAD differs from the confirmed SHA, before
dispatching. This binds the maintainer's confirmation even if main advances
between the check and execution. The unpinned command releases current main.

The command dispatches `release.yml` from main with the full checked SHA, version
and a unique request identity, prints the run URL and waits. Approve its `npm`
environment deployment if prompted. The workflow checks out the requested SHA
and, before running repository code, independently verifies that HEAD matches,
that it is contained in freshly fetched main, and that the stable version and
package name match. Main may advance after preflight: publication, the npm
`gitHead`, the tag and release still identify the original checked commit.

The package job runs CI, records the guarded SHA as `gitHead` in its disposable
checkout's package metadata, and packs once without OIDC rights. This does not
change any committed project file or version. A separate job
downloads that tarball and publishes it with provenance and scripts disabled.
Only after that exact run succeeds and npm reports the checked version and
`gitHead` does the command create an annotated local tag, push it without force,
and create a GitHub release using the checked notes. It never advances the tag
to a newer main. All changes here require maintainer merge under project policy.

## One-time setup (maintainer only)

1. Merge the workflow before attempting a release. In GitHub repository settings,
   create the `npm` environment, require maintainer review, and restrict its
   deployment branches to `main`. Keep repository Actions permissions read-only;
   only the publish job requests `id-token: write`.
2. An npm organization maintainer configures a trusted publisher for
   `@uberblick/ablauf`: GitHub Actions, owner `uberblick-ai`, repository `ablauf`,
   workflow filename `release.yml`, environment `npm`, with direct `npm publish`
   allowed. npm must allow public
   scoped packages. Use npm's trusted-publishing-supported CLI (the pinned Node
   toolchain supplies modern npm); no npm token belongs in repository secrets.
3. If npm requires the package name to exist first, a maintainer must arrange
   that bootstrap separately, preserving the intended release version for this
   workflow. After trusted publishing is working, restrict the package's
   publishing access to disallow traditional tokens, following npm's settings.

Neither this implementation nor its tests perform setup or an actual release.
See [npm trusted publishing](https://docs.npmjs.com/trusted-publishers/) and
[GitHub deployment environments](https://docs.github.com/en/actions/reference/workflows-and-actions/deployments-and-environments).

## Partial failure and recovery

The command stops unsuccessfully at the failed step and reports the checked
version/SHA, completed steps, remaining steps, and known or possible artifacts.
A network failure can occur after a service accepted a request: absence of a
success response never proves nothing happened. Never rerun publication blindly,
move or delete a pushed tag, or change an already published npm version.

Inspect state with literal values substituted for these placeholders:

```sh
gh run list --repo uberblick-ai/ablauf --workflow release.yml --event workflow_dispatch --limit 100 --json databaseId,displayTitle,status,conclusion,url
gh run view RUN_ID --repo uberblick-ai/ablauf
npm view @uberblick/ablauf@X.Y.Z version gitHead dist.attestations --json
git ls-remote --tags origin refs/tags/vX.Y.Z 'refs/tags/vX.Y.Z^{}'
git rev-parse 'vX.Y.Z^{commit}'
gh release view vX.Y.Z --repo uberblick-ai/ablauf --json tagName,targetCommitish,body,url
```

Find the run by the reported unique request title, which includes the checked
version and full SHA. The run's `headSha` is the dispatch ref and can differ when
main advances; its requested checkout and npm `gitHead` must equal the checked
SHA. An annotated remote tag's peeled `^{}` value must also equal that SHA.
For the release, check its `tagName`, resolve that tag to the checked commit, and
compare the complete `body` with the checked changelog section; `targetCommitish`
alone is not proof of identity.

- If dispatch is uncertain or a run is pending, find it first, approve/wait for
  that run, and inspect npm. Do not queue another publication.
- If publication failed, confirm in the workflow logs and registry whether npm
  accepted the version. If it did, never republish it. If it did not, a maintainer
  may correct the cause and dispatch again only after establishing absence of
  both the package version and any pending publication. Repeat preflight for
  a new attempt; review its version, SHA and notes again.
- If npm has the correct version/commit but no tag exists, create the annotated
  tag at the recorded SHA and push it. If a local tag already exists, verify
  its peeled commit first and push only if correct. An unexpected tag or npm
  identity is a stop for maintainer investigation, not permission to overwrite.
- If the pushed tag is correct but no GitHub release exists, create only the
  GitHub release. If the release already exists, inspect its notes and tag
  instead of recreating it. Finish only missing steps.

A maintainer finishing the last steps uses the original full SHA, never HEAD:

```sh
git tag -a vX.Y.Z CHECKED_FULL_SHA -m '@uberblick/ablauf X.Y.Z'
git push origin refs/tags/vX.Y.Z:refs/tags/vX.Y.Z
gh release create vX.Y.Z --repo uberblick-ai/ablauf --verify-tag --title '@uberblick/ablauf X.Y.Z' --notes-file release-notes.md
```

Run each command only when its artifact is absent. Write `release-notes.md`
outside the checkout with exactly the body printed by the original check (or
extract it from `CHANGELOG.md` at the recorded SHA); do not reconstruct it from
newer main. Confirm the npm version and `gitHead`, peeled remote tag and GitHub
release notes after recovery.
