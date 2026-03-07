# Team Sync (Google Drive + Apps Script) Setup

Purpose: no-server shared session library for small teams.

This runbook is the production path for `CMA-005` and the canonical deployment guide for the repo-backed backend source.

## Canonical source artifacts

- Backend code: `backend/google-apps-script/team-library/Code.gs`
- Backend manifest/scopes: `backend/google-apps-script/team-library/appsscript.json`
- Backend notes: `backend/google-apps-script/team-library/README.md`
- Protocol contract: `docs/protocols/team-library-protocol.md`
- Fresh setup checklist: `docs/checklists/team-library-fresh-setup.md`

## Current protocol/version

- Team sync protocol: `1.0.0`
- Session/export schema: `1.1.0`
- Backend health/version endpoint returns both protocol and backend version.

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

If the request redirects to Google login, deployment access is not correctly set to `Anyone`.

## Step 6: Get Chrome extension ID

1. Open `chrome://extensions`.
2. Enable `Developer mode`.
3. Load this repo's `extension/` folder as unpacked.
4. Copy the extension ID.

## Step 7: Create OAuth client ID (Google Cloud)

1. Open `https://console.cloud.google.com`.
2. Configure OAuth consent screen if not already configured.
3. Add scopes used by the extension:
   - `openid`
   - `email`
   - `profile`
   - `https://www.googleapis.com/auth/drive.file`
4. Add your team accounts as test users if the app is still in testing mode.
5. Create `OAuth client ID`.
6. Application type: `Chrome Extension`.
7. Enter the extension ID from Step 6.
8. Copy the generated client ID.

## Step 8: Apply OAuth client ID to the extension

Recommended:

```bash
pnpm extension:set-oauth-client-id -- --client-id "YOUR_CLIENT_ID.apps.googleusercontent.com"
```

Then reload the extension in `chrome://extensions`.

## Step 9: Configure sync in inspector

1. Open extension inspector.
2. In `Sync Settings`:
   - enable sync
   - paste the `/exec` endpoint URL
   - enable `Mask input values` unless you explicitly need raw inputs
   - set `Auto upload on stop` as desired
   - optionally add allow-list emails client-side
3. Click `Save Sync Settings`.
4. Click `Sign In` and approve account access.

## Step 10: Reproduce upload + list + load

Follow `docs/checklists/team-library-fresh-setup.md`.

## Troubleshooting

- `AUTH_REQUIRED`
  - Re-sign in from inspector.
  - Verify token in the app tab:
    - `fetch("https://oauth2.googleapis.com/tokeninfo?access_token=<TOKEN>").then(r => r.json())`
  - Temporarily set `CAPME_DEBUG_AUTH=true`.
  - Validate:
    - `.../exec?action=debugAuth&accessToken=<TOKEN>`
  - Set `CAPME_DEBUG_AUTH=false` again after debugging.
- `AUTH_DENIED`
  - Check `CAPME_ALLOWED_EMAILS`.
  - Confirm token email and allowed email are identical and lowercase.
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
