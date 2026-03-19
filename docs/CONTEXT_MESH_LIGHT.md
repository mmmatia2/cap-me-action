# Documentation Operating Model

This project uses a direct model-to-model Architect/Executor workflow so documentation stays aligned with implementation reality.

## Goals

- Keep operational context current with minimal overhead.
- Preserve key decisions and interfaces.
- Make direct model-to-model collaboration reliable.

## Canonical Active Docs

- Living state: `docs/STATE.md`
- Release memory: `docs/CHANGELOG.md`
- Active protocol contract: `docs/team-library-protocol.md`
- SOP export schema: `docs/export-schema.json`
- Decision memory: `docs/adr/*.md`

## Active Workflow Truth

- `ARCHITECT` thread:
  - Leads analysis, sequencing, auditing, and definition of the next smallest safe increment.
  - Validates plan quality and risk framing before execution work begins.
- `EXECUTOR` thread:
  - Performs repo-aware inspection and implementation.
  - Executes edits, migration, and validation commands against repository reality.
- Human role:
  - Product owner, final decision-maker, and validator of outcomes.
  - Approves direction changes, scope decisions, and final acceptance.

## Supporting Runbooks / Checklists

- `docs/TEAM_SYNC_APPS_SCRIPT.md`
- `docs/team-library-fresh-setup.md`

## Historical Snapshots Under `docs/archive/`

- `docs/archive/audit-pack/`
- `docs/archive/roadmaps/`
- `docs/validation/` snapshots when present in the working tree

These historical snapshots are retained for context only. They are not current source of truth unless explicitly refreshed.
The latest recorded runtime validation evidence remains in `HEAD` at `docs/validation/2026-03-07-linux-mint-auth-boundary-runtime.md`, but that file is currently deleted in the working tree and is therefore not an active local source during this refresh.

## Rules

1. Every behavior or contract change must update at least one canonical artifact.
2. Every non-trivial architecture change should include an ADR.
3. Keep docs concise and linked; avoid duplicating the same truth in many files.
4. `ARCHITECT` should define and hand off the next smallest safe increment before `EXECUTOR` begins implementation.
5. `EXECUTOR` should validate against repository reality and keep implementation reports explicit about validated vs unvalidated claims.
6. If uncertain where to write, update `docs/STATE.md` first.
7. If a historical snapshot conflicts with canonical active docs or repo code, treat the snapshot as stale until refreshed.

## Recommended Cadence

- Per execution increment: update `STATE` and/or ADR/changelog when behavior, contracts, or decisions change.
- Weekly: quick `STATE` cleanup and risk review.
- Per milestone/release: run `pnpm docs:bundle` to generate the active-context bundle and attach it to release notes.
