# STATE

- Current micro-task number: 1
- What’s working end-to-end:
  - Monorepo root with pnpm workspace configuration.
  - React/Vite web app scaffold under `app/`.
  - MV3 extension scaffold under `extension/`.
  - Extension content script sends heartbeat to service worker.
  - Service worker stores rolling event log in `chrome.storage.local`.
- Message types/payload shapes:
  - `CONTENT_SCRIPT_READY`: `{ href: string, ts: number }`
- Data model (Session/Step):
  - Session: not yet implemented.
  - Step: not yet implemented.
- Next micro-task (1 line): add explicit Session/Step schema + first captured click step.
