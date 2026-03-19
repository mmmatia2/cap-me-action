# STATE (Living Context)

Last updated: 2026-03-18
Owner: project maintainers
Doc mode: direct Architect/Executor model-to-model workflow (see `docs/CONTEXT_MESH_LIGHT.md`)

## Purpose

This is the active source-of-truth operational snapshot for the product and codebase.
If historical docs conflict with this file or current repo code, trust this file and repo code first.
Update this file when behavior, architecture, contracts, risks, or priorities change.

## Update Triggers

- New runtime message contract or payload shape.
- Team-library protocol/version changes.
- Data model or schema version changes.
- User-visible behavior changes in extension or editor.
- New known risk, mitigation, or blocker.
- Priority/milestone changes.

## Implemented (Repo-Backed, Not Fully Runtime-Validated)

- The items below are implemented in repo code. They should not be read as proof that the currently deployed backend or live runtime has been revalidated in this working tree.
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
  - Inspector includes editable sync settings UI for `syncConfig` (`enabled`, endpoint URL, auto-upload on stop, mask input values, allowed emails) with validation and save feedback.
  - Inspector includes sync account `Sign In`/`Sign Out` controls via runtime auth messages and displays connected account email.
  - Remote team-library flow now has a repo-backed Google Apps Script source artifact under `backend/google-apps-script/team-library/`.
  - React app imports exported session JSON, supports per-step instruction/note editing, and exports edited JSON.
  - React app supports editable step titles, step reorder/delete controls, and Markdown export.
  - React app supports "merge with next" in step list and stable drag-end reset handling.
  - React app includes light/dark editor theming and stronger title sanitization against selector-chain noise.
  - React app supports drag-and-drop step ordering and cleaner fallback labels for noisy selector targets.
  - React app supports direct session loading from extension storage (`chrome.storage.local`) and HTML guide export templates.
  - React app supports session loading via content-script bridge when running on `localhost` without direct chrome API access.
  - React app parses editor deep-link query params (`source`, `sessionId`) and auto-loads/imports requested local or team sessions when available.
  - React app provides explicit not-found guidance when deep-linked session IDs cannot be resolved.
  - React app and content script now include `TEAM_SYNC_PROTOCOL_VERSION` on team-library bridge requests/responses and backend queries.
  - Annotation `type` (`highlight`/`redact`) survives app normalization and migration/export roundtrips.
  - Editor ingestion paths now enforce runtime SOP payload contract validation before migration (supported `schemaVersion`, required top-level `session`/`steps`, and strict annotation `type`), failing with explicit user-visible errors on invalid payloads.
  - HTML export renders redactions as opaque masks and reports redaction counts separately from highlights.
  - React app uses schema-aware migration helpers (`contracts.ts`, `migrations.ts`) for import/export compatibility.
  - React app supports a dual source model (`Local` extension + `Team` Apps Script endpoint scaffold) while keeping the existing local bridge path.
  - React app supports inline screenshot highlight boxes per step, with highlight labels persisted into JSON and included in Markdown/HTML exports.
  - React app HTML export includes embedded step screenshots and rendered highlight overlays/labels.
  - Content script supports recorder hotkeys: `Alt+Shift+R` (start/stop), `Alt+Shift+Z` (discard last), `Alt+Shift+M` (dock minimize).
  - Action popup points to `ui-record-popup/index.html` with working start/stop capture and recent-session summaries, plus links to open the advanced inspector view.
  - Action popup includes direct "Open Last Capture In Editor" and "Download Last Capture JSON" actions, with hotkey copy aligned to actual shortcuts.
  - Extension `OPEN_EDITOR` local handoff defaults to `http://localhost:5173` for no-auth local smoke flow, including clearer popup/inspector guidance when local app startup is needed.
  - Popup and inspector include a local editor readiness preflight check so operators can confirm `http://localhost:5173` is reachable before handoff.
  - Extension manifest includes localhost host permission for local readiness fetches, and repo now includes a narrow extension JS syntax guard (`pnpm extension:check-syntax`) to catch popup/script parse failures early.
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
- `GET_SYNC_ACCESS_TOKEN`: `{}`
- `OPEN_EDITOR`: `{ source?: "local" | "team", sessionId?: string }`

## Team-Library Protocol

- Current team sync protocol version: `1.0.0`
- Canonical contract doc: `docs/team-library-protocol.md`
- Canonical SOP export schema: `docs/export-schema.json`

## Data Model Snapshot

- CaptureState: `{ isCapturing: boolean, startedAt: number | null }`
- Session: `{ id: string, tabId: number, startUrl: string, startTitle?: string, lastUrl?: string, lastTitle?: string, startedAt: number, updatedAt: number, stepsCount: number, sync?: { status: "local" | "pending" | "synced" | "failed" | "blocked", revision?: number | null, lastSyncedAt?: number | null, errorCode?: string | null } }`
- Step: `{ id: string, sessionId: string, stepIndex?: number, type: string, url: string, pageTitle?: string, at: number, key?: string | null, modifiers?: object | null, value?: string | null, inputType?: string | null, optionValue?: string | null, optionText?: string | null, checked?: boolean | null, scrollX?: number | null, scrollY?: number | null, navigationKind?: string | null, fromHref?: string | null, target?: object | null, selectors?: object | null, thumbnailDataUrl?: string | null, annotations?: [{ id: string, x: number, y: number, width: number, height: number, label?: string }] }`

## Current Risks (Short List)

- App editor orchestration is still concentrated in `app/src/App.jsx` even after recent component extraction.
- Test and CI quality gates are partial: docs-sync exists, but broader build/test enforcement is not established in repo.
- Sync/auth UX and production backend wiring are not fully complete.
- Deployed Apps Script remains an external manual deployment even though source is now versioned in repo.
- Data retention limits (`20 sessions`, `500 steps`) can surprise users.

## Validated

- Repo inspection confirms the team-library protocol version is consistently `1.0.0` across app, extension, and Apps Script source.
- Repo inspection confirms the payload/schema version is consistently `1.1.0` across app export/import helpers and extension sync payloads.
- Repo inspection confirms the March roadmap and backlog docs are historical planning artifacts and should not be treated as active execution truth.

## Unvalidated

- Live deployed Apps Script parity with `backend/google-apps-script/team-library/Code.gs`.
- Current end-to-end sign-in, upload, list, and import behavior against the active deployed backend.
- Current runtime behavior of unauthenticated `health` / `version` on the deployed backend.
- Any claim that the March plan or backlog still reflects current delivery status beyond what is directly visible in repo code.

Latest recorded runtime validation evidence in `HEAD` conflicts with the repo-backed expectation that `health` and `version` are unauthenticated, but `docs/validation/2026-03-07-linux-mint-auth-boundary-runtime.md` is currently deleted in this working tree and is therefore not an active local source during this refresh.

## Historical

- `docs/archive/audit-pack/` is a retained point-in-time audit baseline, not active execution truth.
- `docs/archive/roadmaps/2026-03-scribe-compatible-corporate-ai-plan.md` and `docs/archive/roadmaps/2026-03-execution-backlog.md` are retained March 2026 planning snapshots.
- `docs/validation/` notes are historical recorded evidence when present in the working tree.
- Historical docs may still be useful context, but they require reconciliation against this file and current repo code before reuse.

## Operational Runbook

- Team sync + OAuth setup and validation runbook: `docs/TEAM_SYNC_APPS_SCRIPT.md`
- Fresh setup checklist: `docs/team-library-fresh-setup.md`
- Repo-backed Apps Script source: `backend/google-apps-script/team-library/`
- Manifest OAuth helper command: `pnpm extension:set-oauth-client-id -- --client-id "<client-id>.apps.googleusercontent.com"`

## Historical Planning References

- Scope ADR: `docs/adr/0001-scribe-compatibility-scope-boundary.md`
- Historical roadmap snapshot: `docs/archive/roadmaps/2026-03-scribe-compatible-corporate-ai-plan.md`
- Historical backlog snapshot: `docs/archive/roadmaps/2026-03-execution-backlog.md`
