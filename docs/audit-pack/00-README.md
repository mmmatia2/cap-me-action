# Cap Me Action Audit Pack

This folder consolidates the current state of the project for external documentation and UI/UX audit by another GPT.

## Purpose

- Give a complete, current baseline of the app behavior.
- Document message contracts and data model so audit feedback is technically grounded.
- Capture the current UI design implementation so a refactor proposal can target real constraints.

## Document Index

1. `docs/audit-pack/01-product-scope-and-goals.md`
2. `docs/audit-pack/02-system-architecture.md`
3. `docs/audit-pack/03-data-model-and-contracts.md`
4. `docs/audit-pack/04-extension-runtime-behavior.md`
5. `docs/audit-pack/05-web-editor-runtime-behavior.md`
6. `docs/audit-pack/06-ui-as-built-inventory.md`
7. `docs/audit-pack/07-quality-risks-and-known-gaps.md`
8. `docs/audit-pack/08-gpt-audit-brief.md`

## Source-of-Truth Files

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

- This pack describes what is implemented today, not an ideal target architecture.
- UI handoff assets are included in repo and referenced where relevant:
  - `app/src/ui-step-editor/index.html`
  - `extension/ui-record-popup/index.html`
  - `extension/ui-floating-control/index.html`
