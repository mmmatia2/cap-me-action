# Web Editor Runtime Behavior

## Main Entry

- `app/src/main.jsx` mounts `App` into `#root`.
- `app/src/App.jsx` is currently a single-file implementation for editor logic and rendering.

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

- Single React component file for both logic and UI.
- Minimal dependencies (React + Vite only).
- No routing/state management library.
- No automated tests in app package currently.
