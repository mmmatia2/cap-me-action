# UI As-Built Inventory

This document captures the current UI implementation baseline so GPT can propose a practical refactor.

## UI Surfaces

## 1) Extension Popup (default action)

- Files:
  - `extension/ui-record-popup/index.html`
  - `extension/ui-record-popup/popup.js`
- Dimensions:
  - fixed narrow panel (`~286px` wide, `~560px` min-height).
- Visual direction:
  - dark blue gradient shell.
  - indigo/purple primary CTA block.
  - soft rounded cards and pill toggles.
- Main sections:
  - topbar with brand and icon buttons.
  - primary capture toggle card.
  - static options card (microphone/click effects placeholders).
  - recent captures list with thumbnail previews.
  - footer with settings/dashboard placeholders.
- Design status:
  - close to Stitch look but simplified.
  - some controls are visual-only placeholders.

## 2) Floating Dock (in-page)

- Files:
  - `extension/ui-floating-control/index.html`
  - `extension/ui-floating-control/dock.js`
  - orchestration in `extension/content-script.js`
- Frame sizing:
  - expanded target around `400x72`
  - minimized target around `220x64`
- Visual direction:
  - dark translucent capsule, subtle glow/shadow.
  - red live indicator + timer + step pill.
- Controls:
  - drag handle
  - discard
  - pause/toggle capture
  - finish/stop
  - minimize
- Behavior:
  - dock injected only while capture active
  - persisted position and minimized state
  - toast feedback for discard action

## 3) Inspector Page (advanced)

- Files:
  - `extension/inspector.html`
  - `extension/inspector.js`
- Visual direction:
  - utilitarian dev-tool style
  - system font, plain buttons, pre blocks
- Strength:
  - high control density for debugging and operations
- Weakness:
  - visually disconnected from popup/dock/editor

## 4) Web Editor (React)

- File:
  - `app/src/App.jsx`
- Layout:
  - top toolbar with import/export and theme toggle
  - two-column workspace:
    - left session step list
    - right step detail editor
- Step list UX:
  - select step
  - drag reorder
  - button reorder/delete
- Step detail UX:
  - title/instruction/note editing
  - screenshot annotation canvas with highlight boxes
  - metadata JSON panel
- Export UX:
  - JSON, Markdown, HTML buttons in toolbar

## Color/Token Snapshot

## React editor palette (`getPalette`)

- Dark:
  - `bg: #0b1220`
  - `surface: #111b2e`
  - `surfaceAlt: #18253e`
  - `border: #243652`
  - `text: #e7edf7`
  - `textSoft: #9bb0cd`
  - `accent: #60a5fa`
- Light:
  - `bg: #f7fafc`
  - `surface: #ffffff`
  - `surfaceAlt: #f8fafc`
  - `border: #dbe4f0`
  - `text: #0f172a`
  - `textSoft: #475569`
  - `accent: #2563eb`

## Popup CSS tone

- Deep navy gradient backgrounds.
- Indigo/purple action gradients.
- Rounded cards and subtle borders for depth.

## Dock CSS tone

- Dark glass capsule with low-saturation neutrals.
- Accent red for live/stop emphasis.

## Visual Consistency Assessment

- Strengths:
  - popup and dock share a dark "recorder" mood.
  - annotation affordance in editor is functional.
- Inconsistencies:
  - inspector visual language diverges strongly.
  - editor uses inline styles and different token semantics than popup/dock.
  - typography and iconography are not unified across surfaces.
  - spacing, border radius, and control patterns differ by surface.

## Interaction Model Snapshot

- Capture controls exist in 4 places:
  - popup
  - inspector
  - floating dock
  - keyboard shortcuts
- Export controls exist in 2 places:
  - inspector (session JSON + copy)
  - web editor (JSON/Markdown/HTML)
- Session management is split:
  - capture-side tooling in extension
  - authoring/editing in web app

## Handoff Assets In Repo

- `app/src/ui-step-editor/index.html`
- `extension/ui-record-popup/index.html`
- `extension/ui-floating-control/index.html`

These are useful for visual direction, but only popup/dock assets are runtime-wired directly in extension today. The React editor currently uses its own implementation in `app/src/App.jsx`.
