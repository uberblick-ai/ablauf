# agent/

The enablement pack: what a session needs in order to edit an ablauf chart
without wrecking its layout. Prose, not code — ablauf has no model in the loop
and no model dependency (`docs/decisions.md` D10).

- **`layout-preserving-edit.md`** — the procedure, read on every edit. Text and
  store in, an edit and a directive list out, `snap` between the model and the
  canvas.

## Using it

The file is plain markdown with YAML frontmatter, and works three ways
unchanged:

- **As a Claude skill** — drop it in as `layout-preserving-edit/SKILL.md`; the
  frontmatter's `name` and `description` are what the host indexes.
- **As an `AGENTS.md` section** — paste the body in, or link to the file.
- **In any system prompt** — paste the whole file. The frontmatter is inert
  wherever it is not understood.

Nothing in it names a host, a framework, or a model.

## Why prose

Preservation is a property of the pipeline, not of a model's memory: a node
that has a position and is not named by a directive is emitted verbatim (D6),
so the procedure only has to get *new* nodes right (D7, D11). And image input
is never a precondition — a capable session works from the layout JSON alone,
and rendering to look at the result is a host capability, offered as an
escalation (D20).

## The CI cross-check

`scripts/check-agent-pack.mjs` (run by `mise run agent-check`, and in CI) greps
`docs/spec/layout-store.md` for the directive forms and warning codes it
defines, and fails if the pack teaches a form the spec does not define, or
leaves one of them without a worked example. It is a drift guard, not a test:
the examples themselves were produced by running `snap`.
