# Security policy

## Reporting a vulnerability

Report suspected vulnerabilities through GitHub's private reporting:
**[Security → Report a vulnerability](https://github.com/uberblick-ai/ablauf/security/advisories/new)**.
Please do not open a public issue for a security report.

Expect an acknowledgement within a week. This is a small project and there is
no paid bounty.

## Scope

ablauf is a **library**: text and positions in, an SVG string out. It has no
network access, no filesystem access, no child processes, and zero runtime
dependencies. That shape rules out most of what "vulnerability" usually means
here, and it also means the interesting reports are narrow:

- **Output that escapes its context.** The renderer emits SVG built from user
  text — node labels, edge labels, the `title` option. A label that breaks out
  of an attribute or a text node, or that closes an element early, would let
  chart source inject markup into a host page. This is the report we most want.
- **A parser that does not terminate**, or that consumes memory without bound,
  on input a host might accept.
- **A determinism break**: the same graph and positions rendering differently on
  two engines. It is a correctness bug rather than a classic vulnerability, but
  in a collaborative host it can mean two people acting on different pictures.
- **Anything that makes the library reach outside its process** — a network
  call, a file read, a dependency added without justification.

Out of scope: how a host sanitises what it embeds, a host's own storage or
transport, and the deliberate limits recorded in
[`docs/decisions.md`](docs/decisions.md) — a rejected mermaid construct is not a
vulnerability, and neither is an edge routed through a node box.

## Supported versions

The latest published version. This project has no long-term support branches.
