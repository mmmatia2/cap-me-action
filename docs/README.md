# Documentation Hub

This folder is the operational memory of the project.
It is intentionally lightweight and optimized for fast iteration without drift.

## Truth Boundary

- Canonical active docs:
  - `docs/STATE.md`: living product + architecture + contract snapshot.
  - `docs/CONTEXT_MESH_LIGHT.md`: active Architect/Executor operating model and documentation workflow rules.
  - `docs/CHANGELOG.md`: release-level user-visible changes.
  - `docs/internal-operator-handoff.md`: canonical internal operator handoff for packaged extension + hosted editor baseline.
  - `docs/team-library-protocol.md`: current team-library contract.
  - `docs/export-schema.json`: canonical SOP export JSON schema.
  - `docs/internal-oauth-bootstrap.md`: supporting first-run OAuth/team-sync bootstrap (used when team sync is required).
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
- `pnpm extension:package`: create a versioned unpacked-extension artifact at `artifacts/extension/<extension-name>-v<manifest.version>/extension`.
- `pnpm extension:verify-package`: verify the packaged artifact path, version, and expected extension ID before manual Chrome loading.

## Operator Baseline (Hosted Editor)

Canonical operator handoff path:

- `docs/internal-operator-handoff.md`

Hosted editor default:

- `https://cap-me-action.vercel.app`

Use localhost only as an explicit developer override.

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
- Default editor handoff uses hosted editor.
- Localhost remains supported as an explicit developer override by setting Inspector `Sync Settings -> Editor URL` to `http://localhost:5173`.
- If using localhost override and the editor tab does not load, verify `pnpm dev:app` is still running.
- Popup and inspector both include `Check Local Editor` to confirm reachability before handoff.
- For operator handoff, use `docs/internal-operator-handoff.md`.
- For first-run internal team sync bootstrap (when team sync is needed), use `docs/internal-oauth-bootstrap.md`.
- Inspector readiness auth now reflects non-interactive token availability at check time (not only stored account email).
- Inspector `Sign Out` now signs out team-sync access for this extension profile (best-effort token revoke + local auth gate), so readiness reports token unavailable until `Sign In`.

## Internal Extension Artifact

Use `pnpm extension:package` to build a versioned artifact folder for internal handoff.
Canonical handoff verification/loading steps live in:

- `docs/internal-operator-handoff.md`

- Output path: `artifacts/extension/<extension-name>-v<manifest.version>/`
- `extension/` inside that folder is the unpacked extension payload for `chrome://extensions`.
- `artifact-manifest.json` records included files and SHA-256 hashes.

This does not package or host the editor app. Operators still need either:
- local app runtime (`pnpm dev:app`), or
- a configured hosted editor URL in extension sync settings.

It also does not automate Chrome installation. Use the verification command above, then load the packaged `extension/` folder manually in `chrome://extensions`.
