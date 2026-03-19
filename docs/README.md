# Documentation Hub

This folder is the operational memory of the project.
It is intentionally lightweight and optimized for fast iteration without drift.

## Truth Boundary

- Canonical active docs:
  - `docs/STATE.md`: living product + architecture + contract snapshot.
  - `docs/CONTEXT_MESH_LIGHT.md`: active Architect/Executor operating model and documentation workflow rules.
  - `docs/CHANGELOG.md`: release-level user-visible changes.
  - `docs/team-library-protocol.md`: current team-library contract.
  - `docs/export-schema.json`: canonical SOP export JSON schema.
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

## Local Smoke Start (No Team Auth)

Use this path to smoke-test the SOP editor locally without real team-library auth.

1. Install dependencies: `pnpm install`
2. Start the editor app: `pnpm dev:app`
3. Open `http://localhost:5173/?sample=1` to auto-load the bundled sample session.
4. Alternative: open `http://localhost:5173/` and click `Load Sample SOP` in the import card.

Smoke sample source: `app/public/samples/local-smoke-session.json`

Auth boundary:
- Not required for this smoke path: team-library sign-in, Apps Script deployment, remote sync.
- Still required for team flows: `Load Team Sessions`, `Import Team Session`, and any live sync/auth validation.

## Local Extension -> Editor Smoke (No Auth)

Use this as the primary no-auth product smoke path for real captured artifacts.

1. Start the editor app: `pnpm dev:app`
2. Open `chrome://extensions`, enable Developer mode, and load unpacked: `extension/`
3. Use the extension popup to start/stop a short capture on any page.
4. In popup recent sessions, click a captured session card or `Open Last Capture In Editor`.
5. In the editor, confirm local session import, edit one step, then export JSON/Markdown/HTML.

Notes:
- Default local editor handoff now targets `http://localhost:5173` for no-auth smoke runs.
- If the editor tab does not load, verify `pnpm dev:app` is still running.
- Popup and inspector both include `Check Local Editor` to confirm reachability before handoff.
