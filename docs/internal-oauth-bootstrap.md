# Internal OAuth + Team Sync Bootstrap (First Run)

Supporting runbook for OAuth/endpoint/sign-in when team sync is required.
Canonical operator handoff (artifact -> hosted editor capture/open flow) lives in `docs/internal-operator-handoff.md`.

Scope: internal setup baseline only (not full backend troubleshooting).

## 1) Confirm editor URL baseline (after operator handoff)

Default operator baseline uses hosted editor URL:

- `https://cap-me-action.vercel.app`

Developer/local override is explicit:

- in Inspector `Sync Settings`, set `Editor URL` to `http://localhost:5173`
- start local app only for that override path (`pnpm install`, then `pnpm dev:app`)

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
2. In `Sync Settings`, keep hosted `Editor URL` for operator path, or set localhost only if you are using local dev override.
3. Set team endpoint (`.../exec`) and save.
4. Click `Sign In`.
5. Confirm a connected account appears.

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
