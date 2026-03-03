# STATE (Living Context)

Last updated: 2026-03-03
Owner: project maintainers
Doc mode: lightweight Context Mesh (see `docs/CONTEXT_MESH_LIGHT.md`)

## Purpose

This is the source-of-truth operational snapshot for the product and codebase.
Update this file when behavior, architecture, contracts, risks, or priorities change.

## Update Triggers

- New runtime message contract or payload shape.
- Data model or schema version changes.
- User-visible behavior changes in extension or editor.
- New known risk, mitigation, or blocker.
- Priority/milestone changes.

## Current Delivery Status

- Current micro-task number: 29
- What is working end-to-end:
  - Monorepo root with pnpm workspace configuration.
  - React/Vite app can inspect latest persisted `sessions` and `steps` when `chrome.storage.local` is available.
  - MV3 extension scaffold under `extension/`.
  - Extension content script sends heartbeat + click + key + input + select/toggle + navigate + scroll events to service worker.
  - Service worker creates sessions and stores enriched steps (`selectors`, `target`, event-specific fields, optional `thumbnailDataUrl`) in `chrome.storage.local` only while capturing is enabled, with short-window step de-duplication and per-session `stepIndex`.
  - Service worker captures higher-resolution thumbnails with adaptive compression so app screenshot previews remain readable while staying within storage limits.
  - Service worker runs storage/schema migration (`storageVersion` + `schemaVersion`) and sync metadata compatibility normalization.
  - Service worker includes MV3-safe sync queue scaffolding with `chrome.alarms` retries and runtime sync commands (`SYNC_SESSION_BY_ID`, `SYNC_LAST_SESSION`, `GET_SYNC_STATUS`).
  - Inspector can preview recent step thumbnails.
  - Inspector includes sync status/actions and editor handoff while preserving capture/export/reset controls.
  - React app imports exported session JSON, supports per-step instruction/note editing, and exports edited JSON.
  - React app supports editable step titles, step reorder/delete controls, and Markdown export.
  - React app now supports "merge with next" in step list and stable drag-end reset handling.
  - React app includes light/dark editor theming and stronger title sanitization against selector-chain noise.
  - React app supports drag-and-drop step ordering and cleaner fallback labels for noisy selector targets.
  - React app supports direct session loading from extension storage (`chrome.storage.local`) and HTML guide export templates.
  - React app supports session loading via content-script bridge when running on `localhost` without direct chrome API access.
  - React app now parses editor deep-link query params (`source`, `sessionId`) and auto-loads/imports requested local or team sessions when available.
  - React app now provides explicit not-found guidance when deep-linked session IDs cannot be resolved.
  - Annotation `type` (`highlight`/`redact`) now survives app normalization and migration/export roundtrips.
  - HTML export now renders redactions as opaque masks and reports redaction counts separately from highlights.
  - React app uses schema-aware migration helpers (`contracts.ts`, `migrations.ts`) for import/export compatibility.
  - React app supports a dual source model (`Local` extension + `Team` Apps Script endpoint scaffold) while keeping the existing local bridge path.
  - React app supports inline screenshot highlight boxes per step, with highlight labels persisted into JSON and included in Markdown/HTML exports.
  - React app HTML export includes embedded step screenshots and rendered highlight overlays/labels.
  - Content script supports recorder hotkeys: `Alt+Shift+R` (start/stop), `Alt+Shift+Z` (discard last), `Alt+Shift+M` (dock minimize).
  - Action popup points to `ui-record-popup/index.html` with working start/stop capture and recent-session summaries, plus links to open the advanced inspector view.
  - Action popup includes direct "Open Last Capture In Editor" and "Download Last Capture JSON" actions, with hotkey copy aligned to actual shortcuts.
  - Content script injects a floating recorder dock from `ui-floating-control/index.html` while capture is active, with live timer/step count and pause/finish controls.
  - Action popup uses local MV3-safe CSS/HTML (no remote Tailwind runtime), aligned to the intended visual direction while preserving existing capture/session wiring.
  - Floating dock has local CSS compact styling, per-tab step count via `GET_DOCK_STATE`, and working `Discard Last Step` action with in-dock feedback.
  - Floating dock supports drag-to-reposition with persisted placement (`dockUi`) and minimize/restore behavior.

## Runtime Message Contracts

- `START_CAPTURE`: `{}`
- `STOP_CAPTURE`: `{}`
- `DISCARD_LAST_STEP`: `{ sessionId: string }`
- `GET_DOCK_STATE`: `{}`
- `CONTENT_SCRIPT_READY`: `{ href: string, title?: string, ts: number }`
- `STEP_CAPTURED`: `{ kind: "click" | "key" | "input" | "select" | "toggle" | "navigate" | "scroll", href: string, title?: string, ts: number, target?: object, selectors?: { css?: string, xpath?: string }, key?: string, modifiers?: object, value?: string, inputType?: string, optionValue?: string, optionText?: string, checked?: boolean, scrollX?: number, scrollY?: number, navigationKind?: string, fromHref?: string }`
- `SYNC_SESSION_BY_ID`: `{ sessionId: string }`
- `SYNC_LAST_SESSION`: `{}`
- `GET_SYNC_STATUS`: `{ sessionId?: string }`
- `OPEN_EDITOR`: `{ source?: "local" | "team", sessionId?: string }`

## Data Model Snapshot

- CaptureState: `{ isCapturing: boolean, startedAt: number | null }`
- Session: `{ id: string, tabId: number, startUrl: string, startTitle?: string, lastUrl?: string, lastTitle?: string, startedAt: number, updatedAt: number, stepsCount: number, sync?: { status: "local" | "pending" | "synced" | "failed" | "blocked", revision?: number | null, lastSyncedAt?: number | null, errorCode?: string | null } }`
- Step: `{ id: string, sessionId: string, stepIndex?: number, type: string, url: string, pageTitle?: string, at: number, key?: string | null, modifiers?: object | null, value?: string | null, inputType?: string | null, optionValue?: string | null, optionText?: string | null, checked?: boolean | null, scrollX?: number | null, scrollY?: number | null, navigationKind?: string | null, fromHref?: string | null, target?: object | null, selectors?: object | null, thumbnailDataUrl?: string | null, annotations?: [{ id: string, x: number, y: number, width: number, height: number, label?: string }] }`

## Current Risks (Short List)

- App editor file is still oversized and has unresolved integration defects.
- Test and CI quality gates are not in place yet.
- Sync/auth UX and production backend wiring are not fully complete.
- Data retention limits (`20 sessions`, `500 steps`) can surprise users.

## Active Execution Plan

- Roadmap: `docs/roadmaps/2026-03-scribe-compatible-corporate-ai-plan.md`
- Backlog: `docs/roadmaps/2026-03-execution-backlog.md`
- Scope ADR: `docs/adr/0001-scribe-compatibility-scope-boundary.md`
- Current launch mode: 2-week internal production launch candidate.
- Final roadmap step: unified professional UI system across popup/dock/inspector/editor.

## Next Micro-Task

Implement extension sync settings UI in inspector for `syncConfig` (`enabled`, endpoint, auto-upload, masking, allow-list emails).
