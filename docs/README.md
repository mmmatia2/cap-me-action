# Documentation Hub

This folder is the operational memory of the project.
It is intentionally lightweight and optimized for fast iteration without drift.

## Truth Boundary

- Canonical active docs:
  - `docs/STATE.md`: living product + architecture + contract snapshot.
  - `docs/CONTEXT_MESH_LIGHT.md`: active Architect/Executor operating model and documentation workflow rules.
  - `docs/CHANGELOG.md`: release-level user-visible changes.
  - `docs/team-library-protocol.md`: current team-library contract.
  - `docs/adr/`: accepted architecture decisions. `docs/adr/README.md` and `docs/adr/0000-template.md` are helpers, not runtime truth.
- Supporting runbooks/checklists:
  - `docs/TEAM_SYNC_APPS_SCRIPT.md`
  - `docs/team-library-fresh-setup.md`
  - `backend/google-apps-script/team-library/README.md`
- Historical snapshots under `docs/archive/`:
  - `docs/archive/audit-pack/`
  - `docs/archive/roadmaps/`
  - `docs/validation/` snapshots when present in the working tree

Historical snapshots are not current source of truth. If they conflict with canonical active docs or repo code, trust the canonical active docs and repo code first.
The latest recorded runtime validation evidence remains in `HEAD` at `docs/validation/2026-03-07-linux-mint-auth-boundary-runtime.md`, but that file is currently deleted in the working tree and is therefore not an active local source during this refresh.

## Update Contract

When code behavior changes, update at least one of:

- `docs/STATE.md` (behavior/contracts/priorities)
- `docs/CHANGELOG.md` (user-visible release note)
- `docs/adr/*.md` (intentional architecture decision)

Pull requests are expected to include doc impact in the PR checklist.
CI enforces this with `scripts/check-doc-sync.mjs`.

## Commands

- `pnpm docs:check`: verify code changes are paired with documentation updates.
- `pnpm docs:bundle`: generate a shareable active-context bundle at `docs/context-bundle.md`.
