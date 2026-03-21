# Team Sync (Google Drive + Apps Script) Setup

Purpose: no-server shared session library for small teams.

This runbook is the production path for `CMA-005` and the canonical deployment guide for the repo-backed backend source.

## Canonical source artifacts

- Backend code: `backend/google-apps-script/team-library/Code.gs`
- Backend manifest/scopes: `backend/google-apps-script/team-library/appsscript.json`
- Backend notes: `backend/google-apps-script/team-library/README.md`
- Canonical operator handoff runbook: `docs/internal-operator-handoff.md`
- First-run OAuth/bootstrap runbook: `docs/internal-oauth-bootstrap.md`
- Protocol contract: `docs/team-library-protocol.md`
- Fresh setup checklist: `docs/team-library-fresh-setup.md`

## Current protocol/version

- Team sync protocol: `1.0.0`
- Session/export schema: `1.1.0`
- Backend health/version endpoint returns protocol and backend version.
- Backend `version` now also exposes the current repo-backed supported action list and request conventions.
- Important: the deployed Apps Script web app is external; repo inspection does not prove the live deployment matches repo source until it is redeployed and rechecked.

## Current auth authority

- Token authority for the active app flow is the extension background.
- The React app should obtain team auth only through the page bridge.
- The app no longer relies on a locally persisted bearer token for normal team-library reads.
- Apps Script still retains session/token fallback behavior in code, but that is compatibility behavior, not the primary app contract.

## Step 1: Prepare Drive folder

1. Create a dedicated Google Drive folder for synced session JSON files.
2. Copy the folder ID from the folder URL.
3. Keep this value for `CAPME_FOLDER_ID`.

## Step 2: Create Apps Script project

1. Go to `https://script.google.com`.
2. Create a new project.
3. Replace the default `Code.gs` with `backend/google-apps-script/team-library/Code.gs`.
4. Replace/configure the script manifest using `backend/google-apps-script/team-library/appsscript.json`.
5. Save the project.

## Step 3: Set script properties

In `Project Settings -> Script properties`, add:

- `CAPME_FOLDER_ID`: Drive folder ID from Step 1
- `CAPME_ALLOWED_EMAILS`: comma-separated allowed emails in lowercase
- `CAPME_DEBUG_AUTH`: `false` by default; set `true` only while troubleshooting

Example:

- `CAPME_ALLOWED_EMAILS=alice@company.com,bob@company.com`

## Step 4: Deploy Apps Script web app

1. Click `Deploy -> New deployment`.
2. Type: `Web app`.
3. Execute as: `Me`.
4. Access: `Anyone`.
5. Deploy and copy the generated `/exec` URL.

This URL is your `syncConfig.endpointUrl`.

## Step 5: Verify backend deployment

Open these URLs directly:

- `.../exec?action=health`
- `.../exec?action=version`

Expected:

- JSON response
- `service = cap-me-team-library`
- `protocolVersion = 1.0.0`
- a concrete `backendVersion`
- `version` also shows `supportedActions` and `requestConventions`

If the request redirects to Google login, deployment access is not correctly set to `Anyone`.

## Step 6: Complete first-run extension OAuth/bootstrap

Run the canonical first-run path:

- `docs/internal-oauth-bootstrap.md`

This covers:

- stable extension ID print/verification
- Chrome Extension OAuth client creation/confirmation
- manifest OAuth client application
- extension load/reload
- inspector endpoint + sign-in bootstrap

## Step 7: Reproduce upload + list + load

Follow `docs/team-library-fresh-setup.md`.

## Troubleshooting

- `AUTH_REQUIRED`
  - Re-sign in from inspector.
  - The app should not be carrying a manual fallback token anymore.
  - Verify token in the app tab:
    - `fetch("https://oauth2.googleapis.com/tokeninfo?access_token=<TOKEN>").then(r => r.json())`
  - Temporarily set `CAPME_DEBUG_AUTH=true`.
  - Validate:
    - `.../exec?action=debugAuth&accessToken=<TOKEN>`
  - Set `CAPME_DEBUG_AUTH=false` again after debugging.
- `AUTH_DENIED`
  - Check `CAPME_ALLOWED_EMAILS`.
  - Confirm token email and allowed email are identical and lowercase.
- `EXTENSION_UNAVAILABLE`
  - Reload the unpacked extension.
  - Reopen the editor from the extension entrypoint if possible.
  - If the app is open on a page where the content script bridge is unavailable, team-library auth cannot be obtained.
- `TOKEN_UNAVAILABLE`
  - Confirm inspector sign-in succeeds.
  - If sign-in succeeds but app loads still fail, inspect the bridge path between app and content script.
- `HTTP_302` or Google login HTML
  - Deployment access is wrong or endpoint URL is stale.
- `HTTP_404`
  - Check inspector storage:
    - `chrome.storage.local.get(["syncState"], console.log)`
  - Inspect `syncState.lastErrorDetail` request/response URLs.
- `FOLDER_NOT_CONFIGURED`
  - Check `CAPME_FOLDER_ID`.
- `FOLDER_ACCESS_DENIED_OR_INVALID_ID`
  - Check Drive access for the account executing the web app.

## API surface summary

- `GET ?action=health`
- `GET ?action=version`
- `GET ?action=debugAuth&accessToken=...` when debug is enabled
- `GET ?action=listSessions&limit=50&protocolVersion=1.0.0&accessToken=...`
- `GET ?action=getSession&sessionId=...&protocolVersion=1.0.0&accessToken=...`
- `POST ?action=uploadSession`
- `POST ?action=deleteSession`

## Review boundary notes

- Canonical protocol contract: `docs/team-library-protocol.md`
- Canonical frontend constants: `app/src/lib/protocol.ts`
- The backend currently echoes `protocolVersion` in responses but does not reject mismatched request versions.
- The current remote flow is reproducible from repo source, but live deployment parity still depends on manual Apps Script redeploy + verification.
- The current primary auth path is intentionally narrowed to extension background -> bridge -> app.
