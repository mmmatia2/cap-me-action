# System Architecture

Historical snapshot notice: this document captures a March 2026 architecture baseline, not the current source of truth. Reconcile against `docs/STATE.md`, `docs/team-library-protocol.md`, and current repo code before relying on it.

This snapshot underdescribes the repo-backed team-library sync/auth path and some newer contract/version signals now visible in repo code.

## Monorepo Layout

- Workspace manager: `pnpm`
- Root scripts:
  - `pnpm dev:app`
  - `pnpm build:app`
- Workspace packages:
  - `app/` (React + Vite)
  - `extension/` (Chrome MV3 extension, no bundler for extension assets)

## Runtime Components

## 1) Extension Service Worker

- File: `extension/background.js`
- Responsibilities:
  - Handle runtime commands (`START_CAPTURE`, `STOP_CAPTURE`, `GET_DOCK_STATE`, `DISCARD_LAST_STEP`).
  - Create sessions and persist steps.
  - De-duplicate near-identical consecutive steps.
  - Capture and compress thumbnails.
  - Maintain sync/auth/upload state for the repo-backed team-library flow.
  - Return dock state for content script UI.

## 2) Content Script

- File: `extension/content-script.js`
- Responsibilities:
  - Listen to DOM/browser events and emit normalized `STEP_CAPTURED` payloads.
  - Detect SPA/history navigation events.
  - Throttle scroll event capture.
  - Inject/manage floating dock iframe.
  - Handle dock postMessage commands and keyboard shortcuts.
  - Provide page-bridge handoff for session reads and team auth between the web app and extension/runtime.

## 3) Extension Popup

- Files:
  - `extension/ui-record-popup/index.html`
  - `extension/ui-record-popup/popup.js`
- Responsibilities:
  - Start/stop capture.
  - Show recent sessions summary.
  - Open advanced inspector page.

## 4) Extension Inspector (Advanced)

- Files:
  - `extension/inspector.html`
  - `extension/inspector.js`
- Responsibilities:
  - Full control panel for session operations.
  - Sync settings and auth controls for the repo-backed team-library flow.
  - Export/copy JSON, copy compact steps, clear/reset data.
  - Preview recent step thumbnails.

## 5) Floating Dock UI

- Files:
  - `extension/ui-floating-control/index.html`
  - `extension/ui-floating-control/dock.js`
- Responsibilities:
  - In-page compact controls for stop/pause/discard/minimize.
  - Timer + step count display.
  - Drag-to-reposition interaction via content-script mediation.

## 6) Web Step Editor

- File: `app/src/App.jsx`
- Responsibilities:
  - Import session JSON files.
  - Load local sessions from extension storage directly or via content-script bridge.
  - Load/import team sessions through the repo-backed team-library path.
  - Edit step title/instruction/note.
  - Reorder/delete steps.
  - Annotate screenshot with highlight rectangles.
  - Export JSON, Markdown, HTML.

## High-Level Event Flow

1. User action on page.
2. Content script normalizes action payload.
3. Message sent to service worker.
4. Service worker updates session/step state in `chrome.storage.local`.
5. Popup/inspector/dock refresh state from storage/runtime.
6. Web editor loads sessions and exports docs.

## Storage Topology

This storage list focuses on the capture-side keys emphasized in the March 2026 snapshot. Current repo code also includes sync-related state beyond the keys listed below.

- `chrome.storage.local` keys:
  - `captureState`
  - `sessions`
  - `steps`
  - `sessionByTab`
  - `eventLog`
  - `dockUi`

## Manifest/Permission Model

- File: `extension/manifest.json`
- MV3 permissions:
  - `storage`
  - `tabs`
  - `scripting`
  - `activeTab`
- Content script on `<all_urls>`.
- Web accessible resources for dock iframe assets.
