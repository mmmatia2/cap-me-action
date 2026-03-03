# Documentation Hub

This folder is the operational memory of the project.
It is intentionally lightweight and optimized for fast iteration without drift.

## Core Docs

- `docs/STATE.md`: living product + architecture + contract snapshot.
- `docs/CONTEXT_MESH_LIGHT.md`: documentation operating model and update rules.
- `docs/CHANGELOG.md`: release-level user-visible changes.
- `docs/adr/`: architecture decision records.
- `docs/audit-pack/`: point-in-time deep audit baseline.

## Update Contract

When code behavior changes, update at least one of:

- `docs/STATE.md` (behavior/contracts/priorities)
- `docs/CHANGELOG.md` (user-visible release note)
- `docs/adr/*.md` (intentional architecture decision)

Pull requests are expected to include doc impact in the PR checklist.
CI enforces this with `scripts/check-doc-sync.mjs`.

## Commands

- `pnpm docs:check`: verify code changes are paired with documentation updates.
- `pnpm docs:bundle`: generate a shareable context bundle at `docs/context-bundle.md`.
