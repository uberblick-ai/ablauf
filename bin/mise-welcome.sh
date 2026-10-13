#!/bin/sh
# The quick-start, printed by mise's `enter` hook and by `mise run welcome`.
# Static text only: no installs, no network, nothing started. Silent unless a
# person is at a terminal.
set -eu

[ -t 1 ] || exit 0
[ -z "${CI+set}" ] || exit 0
[ "${MISE_QUIET:-}" != "1" ] || exit 0

printf 'ablauf\n'
printf '\n'
printf '  first time   mise run setup\n'
printf '  review       mise run playground\n'
printf '  one flow     mise run check FILE\n'
printf '  check        mise run ci\n'
printf '  all commands mise tasks\n'
