---
name: release
description: Check a prepared ablauf release, obtain maintainer confirmation, hand publication to the maintainer, and verify its npm and GitHub identities. Not for release preparation or agent publication.
---

# Release ablauf

Use [docs/releases.md](../../../docs/releases.md) for setup, checks and recovery.
Work in a clean checkout at current `origin/main`. Use literal versions and SHAs.

1. Run `mise run release X.Y.Z --check`. A refusal is no-go. For pending CI,
   wait for the exact run and repeat the check. Present go/no-go with the checked
   version, full SHA and **complete verbatim release notes**. Request explicit
   maintainer confirmation for that exact version and commit. A changed version
   or commit requires another check and confirmation.
2. After confirmation, hand the maintainer the exact command
   `mise run release X.Y.Z --commit CHECKED_FULL_SHA` with the literal checked
   version and SHA, for them to execute
   themselves (prefix it with `!` in Claude Code). Explain
   that it repeats preflight and may need their `npm` environment approval.
   **No agent executes publication**, including after confirmation. Wait for
   the maintainer's execution result. If its repeated check identifies a new
   SHA, the pinned command refuses; request review/confirmation of that version,
   SHA and notes before handing over another command.
3. After the maintainer executes it, read npm's exact-version metadata with
   `npm view @uberblick/ablauf@X.Y.Z version gitHead --json`; confirm version and
   `gitHead` equal the checked values. Inspect `git ls-remote --tags origin`
   for the version tag and its peeled commit, then
   `gh release view vX.Y.Z --repo uberblick-ai/ablauf --json tagName,targetCommitish,body,url`.
   Confirm the release uses that tag at the checked commit and its full body
   matches the checked notes. Report verified links and identities. On any
   failure or mismatch, report completed/remaining steps and artifacts and
   refer the maintainer to partial recovery; do not retry publication or repair
   tags/releases yourself.
