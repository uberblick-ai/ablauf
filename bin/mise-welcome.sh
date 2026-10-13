#!/bin/sh
# The quick-start, printed by mise's `enter` hook and by `mise run welcome`.
#
# Static `printf` calls and nothing else, so entering the checkout costs
# nothing. Only for a human at a terminal: a pipe, CI or `MISE_QUIET` gets
# silence.
set -eu

[ -t 1 ] || exit 0
[ -z "${CI+set}" ] || exit 0
[ "${MISE_QUIET:-}" != "1" ] || exit 0

printf 'ablauf\n'
printf '\n'
printf '  render examples  mise run render       spike/examples -> spike/out\n'
printf '  check one file   mise run check FILE   writes FILE.svg beside it\n'
printf '  what moved       mise run measure      loop vs loop-insert\n'
printf '  test             mise run test\n'
printf '  playground       not built yet; plan in docs/playground.md\n'
printf '  all commands     mise tasks\n'
