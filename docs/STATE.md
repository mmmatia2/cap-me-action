# STATE

- Current micro-task number: 5
- What’s working end-to-end:
  - Monorepo root with pnpm workspace configuration.
  - React/Vite app can inspect latest persisted `sessions` and `steps` when `chrome.storage.local` is available.
  - MV3 extension scaffold under `extension/`.
  - Extension content script sends heartbeat + click events to service worker.
  - Service worker creates sessions and stores captured steps in `chrome.storage.local` only while capturing is enabled.
  - Extension popup (`inspector.html`) shows latest session and recent steps in extension context and provides start/stop capture controls.
- Message types/payload shapes:
  - `START_CAPTURE`: `{}`
  - `STOP_CAPTURE`: `{}`
  - `CONTENT_SCRIPT_READY`: `{ href: string, ts: number }`
  - `STEP_CAPTURED`: `{ kind: "click", href: string, ts: number, target: { tag: string, id: string | null, text: string } }`
- Data model (Session/Step):
  - CaptureState: `{ isCapturing: boolean, startedAt: number | null }`
  - Session: `{ id: string, tabId: number, startUrl: string, startedAt: number, updatedAt: number, stepsCount: number }`
  - Step: `{ id: string, sessionId: string, type: string, url: string, at: number, target: { tag: string, id: string | null, text: string } }`
- Next micro-task (1 line): add step de-duplication and basic keyboard step capture.
