# Releasing ablauf

Publishing is the one step in this repo that an agent cannot do and must not
try: it needs the owner's npm credentials and it is irreversible within 72
hours. Everything an agent *can* prove is proven by `mise run pack-check`
before this file is opened at all. What follows is the owner's procedure, and
it is deliberately manual — no release automation until there is a second
release worth automating (D14).

The package is `@uberblick/ablauf`, public, ESM-only, zero runtime
dependencies. Versions follow the promise in the README: pre-1.0 a minor may
break the root export surface, a patch never does.

## Before tagging

From a clean checkout of the commit you intend to release, on `main`:

```
mise run install
mise run lint
mise run typecheck
mise run test
mise run build
mise run agent-check
mise run acceptance     # twice — the second run is the drift check
mise run pack-check     # builds, packs, installs the tarball into a throwaway consumer
```

`pack-check` is the release gate proper. It fails if the tarball ships source,
tests, fixtures, the demo, the acceptance output or `scripts/`; if it is
missing `dist/` JavaScript, declarations, `agent/`, `docs/spec/`, README or
LICENSE; if the published types do not resolve under either `bundler` or
`node16` resolution; or if parse → snap → render does not run in a project
whose only dependency is the tarball.

Check that `package.json`'s `version` is the version you mean to publish and
that `dependencies` is still absent.

## Publishing

```
npm whoami                                # expect the account that owns the @uberblick org
mise exec -- npm publish --access public  # runs prepack → build; `--dry-run` first if in doubt
git tag v0.1.0
git push origin v0.1.0
```

`publishConfig.access` already says `public`, so the flag is belt and braces
on a scoped package that would otherwise default to restricted. Publish
through `mise exec` because `prepack` shells out to `pnpm build`: that is the
one command in the procedure that needs the pinned toolchain on `PATH`.

Tag *after* the publish succeeds: a tag that points at a version nobody can
install is worse than no tag.

## After publishing

```
npm view @uberblick/ablauf@0.1.0 dependencies   # expect empty
npm pack @uberblick/ablauf@0.1.0                # the published tarball, not a local build
tar -tzf uberblick-ablauf-0.1.0.tgz             # the shipped paths, worth recording on the issue
```

Then the same clean-consumer check `pack-check` runs locally, but against the
registry rather than a local tarball:

```
mkdir /tmp/ablauf-consumer && cd /tmp/ablauf-consumer
npm init -y && npm pkg set type=module
npm install @uberblick/ablauf@0.1.0
node --input-type=module -e '
  import { parse, snap, toSvg, DEFAULT_THEME } from "@uberblick/ablauf";
  const g = parse("flowchart TD\n  a[Start] --> b[End]");
  const { positions } = snap(g, { a: { x: 100, y: 100 } }, [
    { id: "b", rel: { of: "a", dir: "below" } },
  ]);
  const svg = toSvg(g, positions, { theme: DEFAULT_THEME });
  if (!svg.startsWith("<svg")) throw new Error("no SVG");
  console.log("ok", svg.length, "bytes");
'
```

Finally, create the GitHub release from the tag if you want release notes to
have a home; nothing in the toolchain depends on one existing.

## If something is wrong after publishing

Do not unpublish unless the release is minutes old and demonstrably broken —
unpublishing a version other people may already have pinned is worse than
superseding it. `npm deprecate @uberblick/ablauf@0.1.0 "…"` and a patch
release is the normal repair.
