# Web Editor Runtime Behavior

Historical snapshot notice: this document captures a March 2026 editor-runtime baseline, not the current source of truth. Reconcile against `docs/STATE.md`, `docs/team-library-protocol.md`, and current repo code before relying on it.

## Main Entry

- `app/src/main.jsx` mounts `App` into `#root`.
- This snapshot treated `app/src/App.jsx` as the primary editor implementation file. Current repo code has some extracted editor modules/components around it, so do not read the single-file description as current truth.

## Input Paths

## 1) Local file import

- User selects JSON file.
- Expected shape: `{ session: {...}, steps: [...] }`.
- Payload normalized:
  - guarantees step IDs
  - resequences `stepIndex`
  - derives title/instruction when missing
  - normalizes annotations

## 2) Extension storage import

- If direct extension APIs exist (`chrome.storage.local` + runtime id): read sessions/steps directly.
- Else fallback to content-script page bridge:
  - send `REQUEST_SESSIONS` with `requestId`
  - await matching `SESSIONS_RESPONSE` with timeout

This snapshot underdescribes the repo-backed team-library load/import path now visible in current repo code.

## Editor interactions

- Select step in left panel.
- Edit:
  - `title`
  - `instruction`
  - `note`
- Reorder:
  - button up/down
  - drag-and-drop reordering
- Delete step.
- Annotation mode (if step has thumbnail):
  - drag rectangle to create highlight
  - select highlight
  - set highlight label
  - delete selected highlight

## Heuristics for generated step titles/instructions

- Attempts to avoid noisy labels from raw selectors.
- Filters out asset-like strings and weak tags (`svg`, `span`, etc. with low semantic value).
- Builds label candidates from:
  - target label/text/placeholder/id/name
  - selector hints
  - semantic fallback by element type

## Export paths

- JSON:
  - full editable payload, including annotations and thumbnails
- Markdown:
  - title/instruction/note/url/highlights
- HTML:
  - title/instruction/note/url/highlights
  - embedded screenshot image if available
  - rendered highlight overlays and labels

## Theme behavior

- Built-in light/dark theme toggle.
- Inline style palette in app:
  - `dark`: deep navy surfaces
  - `light`: neutral light surfaces

## Current technical shape

- Editor orchestration was still heavily centered in `app/src/App.jsx` in this snapshot; current repo code has some extracted components/state helpers.
- Minimal dependencies (React + Vite only).
- No routing/state management library.
- No automated tests in app package currently.
