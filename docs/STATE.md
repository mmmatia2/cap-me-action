# STATE

- Current micro-task number: 2
- What’s working end-to-end:
  - Monorepo root with pnpm workspace configuration.
  - React/Vite web app scaffold under `app/`.
  - MV3 extension scaffold under `extension/`.
  - Extension content script sends heartbeat + click events to service worker.
  - Service worker creates sessions and stores captured steps in `chrome.storage.local`.
- Message types/payload shapes:
  - `CONTENT_SCRIPT_READY`: `{ href: string, ts: number }`
  - `STEP_CAPTURED`: `{ kind: "click", href: string, ts: number, target: { tag: string, id: string | null, text: string } }`
- Data model (Session/Step):
  - Session: `{ id: string, tabId: number, startUrl: string, startedAt: number, updatedAt: number, stepsCount: number }`
  - Step: `{ id: string, sessionId: string, type: string, url: string, at: number, target: { tag: string, id: string | null, text: string } }`
- Next micro-task (1 line): expose latest session + steps in React UI for inspection.
