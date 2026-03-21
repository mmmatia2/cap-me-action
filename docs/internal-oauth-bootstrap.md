# Internal OAuth + Team Sync Bootstrap (First Run)

Use this as the single first-run operator path for extension identity, OAuth, and team-sync readiness.

Scope: internal setup baseline only (not full backend troubleshooting).

## 1) Start local app

1. Run `pnpm install` (first time only).
2. Run `pnpm dev:app`.

## 2) Get stable extension ID from repo identity

1. Run:

```bash
pnpm extension:print-id
```

2. Copy the printed extension ID.

## 3) Create or confirm Chrome Extension OAuth client (Google Cloud)

Manual in Google Cloud Console:

1. Open OAuth credentials.
2. Create or verify an `OAuth client ID` of type `Chrome Extension`.
3. Ensure it uses the extension ID from Step 2.
4. Copy the OAuth client ID (`...apps.googleusercontent.com`).

## 4) Apply OAuth client ID to manifest

Run:

```bash
pnpm extension:set-oauth-client-id -- --client-id "YOUR_CLIENT_ID.apps.googleusercontent.com"
```

## 5) Load/reload extension

1. Open `chrome://extensions`.
2. Enable Developer mode.
3. Load unpacked `extension/` (or reload it if already loaded).
4. Confirm loaded extension ID matches `pnpm extension:print-id`.

## 6) Configure endpoint + sign in (inspector)

Manual in extension inspector:

1. Open Inspector.
2. In `Sync Settings`, set team endpoint (`.../exec`) and save.
3. Click `Sign In`.
4. Confirm a connected account appears.

## 7) Verify first readiness

1. In popup or inspector, click `Check Local Editor` and confirm healthy.
2. Capture a short local session, open Inspector, select that session, and click `Sync Selected Session`.
3. Confirm inspector reports `Session sync succeeded.` (or an actionable failure code/next step).
4. In app, switch source to `Team Library` and click `Load Library`.
5. Confirm the library list loads, import one team session, and confirm no immediate auth error (`AUTH_REQUIRED`, `TOKEN_UNAVAILABLE`, `EXTENSION_UNAVAILABLE`).

## Supporting docs

- Full backend + production runbook: `docs/TEAM_SYNC_APPS_SCRIPT.md`
- Deep validation checklist (post-bootstrap): `docs/team-library-fresh-setup.md`
- Apps Script source notes: `backend/google-apps-script/team-library/README.md`
