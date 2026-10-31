# Sequence diagram spike (#75)

Throwaway code for choosing the syntax and layout of `sequence v0` (#74). It is
not wired into `render()`, has no tests and will be deleted when #74 lands.

- [claim-mermaid.flow](claim-mermaid.flow): Mermaid spelling: `participant`,
  `A ->> B: label`, `-->>` for responses, `note over X:`, `alt`/`else`/`end`.
- [claim-ablauf.flow](claim-ablauf.flow): flow spelling: `person`/`system`
  kinds with tones, `a --> b : label`, `-.->` for responses, `section` bands
  for phases, `note x "text"`.

Messages 1 to 6 come from #74. The rest of the claim sequence (7 to 15) is
filled in for the spike and may differ from the real handshake.

```sh
node spike/sequence-spike/shots.ts /tmp/seq
```

writes screenshots of every syntax and layout mode, light and dark.
