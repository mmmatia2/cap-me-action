# Cap Me Action Audit Pack

Historical snapshot notice: this folder is a March 2026 audit baseline, not the current source of truth. Reconcile against `docs/STATE.md`, `docs/CHANGELOG.md`, `docs/team-library-protocol.md`, and current repo code before relying on it.

Latest recorded runtime validation evidence in `HEAD` indicates a deployed-backend mismatch, but `docs/validation/2026-03-07-linux-mint-auth-boundary-runtime.md` is currently deleted in the working tree and is therefore not an active local source during this refresh.

This folder consolidates a March 2026 snapshot of the project for external documentation and UI/UX audit by another GPT.

## Purpose

- Give a complete March 2026 baseline of the app behavior.
- Document message contracts and data model so audit feedback is technically grounded.
- Capture the March 2026 UI implementation snapshot so a refactor proposal can target real constraints.

## Document Index

1. `docs/archive/audit-pack/01-product-scope-and-goals.md`
2. `docs/archive/audit-pack/02-system-architecture.md`
3. `docs/archive/audit-pack/03-data-model-and-contracts.md`
4. `docs/archive/audit-pack/04-extension-runtime-behavior.md`
5. `docs/archive/audit-pack/05-web-editor-runtime-behavior.md`
6. `docs/archive/audit-pack/06-ui-as-built-inventory.md`
7. `docs/archive/audit-pack/07-quality-risks-and-known-gaps.md`
8. `docs/archive/audit-pack/08-gpt-audit-brief.md`

## Primary Repo Reference Files For This Snapshot

- `extension/manifest.json`
- `extension/background.js`
- `extension/content-script.js`
- `extension/ui-record-popup/index.html`
- `extension/ui-record-popup/popup.js`
- `extension/ui-floating-control/index.html`
- `extension/ui-floating-control/dock.js`
- `extension/inspector.html`
- `extension/inspector.js`
- `app/src/App.jsx`
- `app/src/main.jsx`
- `docs/STATE.md`

## Notes

- This pack describes what this March 2026 snapshot treated as implemented, not an ideal target architecture or current source of truth.
- UI handoff assets are included in repo and referenced where relevant:
  - `app/src/ui-step-editor/index.html`
  - `extension/ui-record-popup/index.html`
  - `extension/ui-floating-control/index.html`
