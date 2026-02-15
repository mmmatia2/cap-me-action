# System Architecture

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
  - Return dock state for content script UI.

## 2) Content Script

- File: `extension/content-script.js`
- Responsibilities:
  - Listen to DOM/browser events and emit normalized `STEP_CAPTURED` payloads.
  - Detect SPA/history navigation events.
  - Throttle scroll event capture.
  - Inject/manage floating dock iframe.
  - Handle dock postMessage commands and keyboard shortcuts.
  - Provide bridge for web app to read extension sessions on localhost via `window.postMessage`.

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
  - Load sessions from extension storage directly or via content-script bridge.
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
