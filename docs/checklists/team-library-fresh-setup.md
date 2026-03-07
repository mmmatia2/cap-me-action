# Team Library Fresh Setup Checklist

Use this after a clean extension reload and a fresh web app refresh.

Purpose of this checklist:

- verify the repo-backed Apps Script source is the deployed source
- verify the active remote path end-to-end from extension -> backend -> app
- separate what is runtime-proven from what is only repo-documented

## Backend

1. Paste `backend/google-apps-script/team-library/Code.gs` into Apps Script.
2. Apply `backend/google-apps-script/team-library/appsscript.json` scopes.
3. Set script properties:
   - `CAPME_FOLDER_ID`
   - `CAPME_ALLOWED_EMAILS`
   - `CAPME_DEBUG_AUTH=false`
4. Deploy as Web App:
   - Execute as `Me`
   - Access `Anyone`
5. Validate:
   - `.../exec?action=health`
   - `.../exec?action=version`
6. Confirm:
   - `service = cap-me-team-library`
   - `protocolVersion = 1.0.0`
   - `backendVersion = 2026-03-06`
   - `version.supportedActions` is present
   - `version.requestConventions` is present

## Extension

1. Reload unpacked extension in `chrome://extensions`.
2. Open inspector tab.
3. Click `Sign In`.
4. Configure sync endpoint with `/exec` URL.
5. Save sync settings.
6. Confirm the extension inspector shows a connected account before moving to the app.

## Upload

1. Start capture.
2. Perform 3-5 actions.
3. Stop capture.
4. Click `Sync Selected Session`.
5. Verify:
   - sync status becomes `synced`
   - Drive folder contains `<sessionId>.json`

## List + load

1. Refresh the web app tab.
2. Set source to `Team Library`.
3. Confirm there is no manual bearer-token entry step in the app flow.
4. Click `Load Library`.
5. Import the uploaded session.
6. Verify:
   - session appears in dropdown
   - session imports successfully
   - steps/screenshots render
   - app load succeeds through extension-provided auth only

## Auth failure visibility

1. Sign out from the extension inspector.
2. In the app, click `Load Library`.
3. Verify the app exposes an explicit auth failure state such as:
   - `AUTH_REQUIRED`
   - `TOKEN_UNAVAILABLE`
   - `EXTENSION_UNAVAILABLE`
4. Sign in again and verify the app can load the library without entering a token manually.

## Reload checks

1. Reload the app tab after a successful sign-in.
2. Click `Load Library`.
3. Verify team-library reads still depend on extension-provided auth and do not require a persisted app token.
4. Reload the unpacked extension.
5. Reopen inspector and verify sign-in state and load behavior again.

## Failure checks

- If `Load Library` fails, validate `.../exec?action=debugAuth&accessToken=<token>` with `CAPME_DEBUG_AUTH=true`.
- If upload fails, inspect `chrome.storage.local.get([\"syncState\"], console.log)` and check `lastErrorDetail`.
- If the app cannot load team data but inspector sign-in succeeded, treat page-bridge auth as unvalidated and inspect the app/content-script bridge path separately.
- If `health`/`version` do not show the expected backend version metadata, treat deployment parity with repo source as failed.
