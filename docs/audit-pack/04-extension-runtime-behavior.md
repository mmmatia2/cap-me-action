# Extension Runtime Behavior

## Service Worker: `extension/background.js`

## Capture lifecycle

- `START_CAPTURE` sets `captureState.isCapturing = true` and `startedAt = now`.
- `STOP_CAPTURE` sets `captureState.isCapturing = false` (keeps prior `startedAt`).
- New session is lazily created on:
  - `CONTENT_SCRIPT_READY` when needed
  - or first `STEP_CAPTURED` when no session exists for tab

## Session mapping

- `sessionByTab[tabId]` holds active session for each tab.
- `sessions` includes session summary metadata and rolling `stepsCount`.

## Step ingestion

1. Build step from payload (`kind`, metadata, selectors, target, event-specific fields).
2. Compare with latest step in same session via signature.
3. If same signature within 800ms, treat as duplicate and ignore.
4. If accepted:
   - assign `stepIndex = session.stepsCount + 1`
   - optionally capture `thumbnailDataUrl`
   - push to `steps`
   - update session `stepsCount`, `updatedAt`, `lastUrl`, `lastTitle`

## Thumbnail capture pipeline

- Triggered for step types: `click`, `input`, `select`, `toggle`, `navigate`.
- Throttled per tab with 1400ms minimum gap.
- Capture source: `chrome.tabs.captureVisibleTab(..., { format: "png" })`.
- Adaptive compression:
  - max dimensions around `1280x800`
  - quality ladder down to fit byte cap (`~220 KB` target)
  - output stored as JPEG data URL

## Step/session mutation commands

- `DISCARD_LAST_STEP`:
  - Removes last step in selected session.
  - Recomputes `stepsCount`, `updatedAt`, `lastUrl`, `lastTitle`.

## State bounds

- `sessions.slice(-20)`
- `steps.slice(-500)`
- `eventLog.slice(-100)`

## Content Script: `extension/content-script.js`

## Event capture

- Listeners:
  - `click` (capture phase)
  - `keydown` (capture phase)
  - `input` (capture phase)
  - `change` (capture phase)
  - `scroll` (throttled)
  - history API patching (`pushState`, `replaceState`)
  - `popstate`, `hashchange`, `load`

## Normalization rules

- Builds both CSS selector and XPath.
- Attempts stronger action target resolution (`closest(button/a/role=button/etc.)`).
- Extracts target metadata:
  - tag/id/name/type/role/placeholder/label/text
- Excludes sensitive or low-value inputs:
  - no password/file/hidden value capture
  - ignores modifier-only key presses

## Dock orchestration

- Injects iframe from `ui-floating-control/index.html` while capturing.
- Keeps dock position state (`dockUi`) with persisted local storage.
- Handles dock commands:
  - start/stop
  - discard last
  - minimize
  - move (drag deltas)
- Listens to storage changes to keep dock state synchronized.

## Hotkeys

- `Alt+Shift+R`: start/stop capture
- `Alt+Shift+Z`: discard last step
- `Alt+Shift+M`: dock minimize toggle
- Ignored while typing in input/textarea/contenteditable.

## Web app session bridge

- Receives `CAP_ME_APP_BRIDGE/REQUEST_SESSIONS` from web app context.
- Responds with `SESSIONS_RESPONSE` containing `sessions` and `steps` from `chrome.storage.local`.
- Enables localhost app to consume extension state without direct extension context APIs.

## Extension UI Surfaces

- Popup:
  - Start/stop capture
  - recent session cards
  - inspector navigation
- Inspector:
  - full session control panel
  - export/copy/clear/reset operations
  - text + thumbnail previews
- Floating dock:
  - live status and in-page controls while capturing
