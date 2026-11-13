#!/bin/sh
# The quick-start, printed by mise's `enter` hook and by `mise run welcome`.
# Static text only: no installs, no network, nothing started; it reads the
# prepared version from package.json. Silent unless a person is at a terminal.
set -eu

[ -t 1 ] || exit 0
[ -z "${CI+set}" ] || exit 0
[ "${MISE_QUIET:-}" != "1" ] || exit 0

printf 'ablauf\n'
printf '\n'
printf '  first time   mise run setup\n'
printf '  develop      mise run playground\n'
printf '  one flow     mise run check FILE\n'
printf '  check        mise run lint\n'
printf '               mise run typecheck\n'
printf '               mise run test\n'
version=$(sed -n 's/^  "version": "\([^"]*\)".*/\1/p' "$(dirname "$0")/../package.json" 2>/dev/null | head -n 1)
printf '  release      mise run release %s --check\n' "${version:-X.Y.Z}"
printf '               mise run release %s --commit FULL_SHA_FROM_CHECK\n' "${version:-X.Y.Z}"
printf '               maintainers only, from clean main; docs/releases.md\n'
printf '  all commands mise tasks\n'
