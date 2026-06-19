# Project Maintenance Vault

This `psi/` directory is for maintaining the `maw-ui` repository.

`maw-ui` is the UI/control surface for MAW and ARRA Office. This vault records
maintainer handoffs, decisions, readouts, and project-specific learnings. It is
not runtime UI state, not a task queue, and not a deployment surface.

## Rules

- GitHub Issues and pull requests are the durable queue.
- This vault is memory and handoff, not a task claim system.
- Do not store secrets, tokens, API keys, generated databases, build artifacts,
  screenshots, or runtime state.
- Do not run `maw ui --install`, `maw ui --dev`, or Cloudflare deploys as part
  of a vault maintenance note.
- Keep user-facing UI documentation in `README.md` and source-facing changes in
  `src/`.

## Structure

```text
psi/
  active/     current maintainer context and checkpoints
  handoff/    session handoffs for future maintainers
  decisions/  project decisions, reversals, and rationale
  learn/      repo readouts, proofs, and investigations
  memory/     durable project learnings and retrospectives
```
