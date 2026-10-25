# Security

Thanks for looking. ablauf is built by a small team, so this page is short.

## Reporting a vulnerability

Report it privately through
[GitHub private vulnerability reporting](https://github.com/uberblick-ai/ablauf/security/advisories/new).
Please don't open a public issue, pull request or discussion.
If you can't use GitHub, email security@uberblick.ai.

A useful report has what you found, what an attacker gains, the
`@uberblick/ablauf` version and the smallest input that shows it.

## What happens next

- We confirm we have your report within 3 working days.
- Within 10 working days we tell you whether we see a vulnerability and what we plan.
- We fix it in a release and publish a GitHub security advisory, with a CVE
  when it qualifies. We credit you unless you'd rather we didn't.
- Please wait for the fix, or 90 days, before you publish. If we go quiet, ping the report.

## Supported versions

Only the latest release on npm gets security fixes. There are no backports:
updating is the fix.

## Scope

ablauf turns text into SVG that a host page shows. In Uberblick that
text can come from anyone who can edit a workspace, so it is untrusted input.
We especially want to hear about:

- input that makes the rendered SVG run script, add event handlers or
  load anything from outside the host page,
- small input that makes the renderer hang or use runaway memory,
- a published npm package that holds something it shouldn't, or doesn't
  match its source commit.

Out of scope:

- Diagrams that look misleading but stay inert.
- How a host page embeds the output. Report Uberblick's side through
  [uberblick-2's SECURITY.md](https://github.com/uberblick-ai/uberblick-2/blob/main/SECURITY.md).
- Versions older than the latest release.

## Good-faith research

If you follow this page, we won't take legal action against you or ask
GitHub to. Test against your own copy of the package, never against
hub.uberblick.ai or anyone else's hub.
