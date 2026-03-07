# Team Library Fresh Setup Checklist

Use this after a clean extension reload and a fresh web app refresh.

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

## Extension

1. Reload unpacked extension in `chrome://extensions`.
2. Open inspector tab.
3. Click `Sign In`.
4. Configure sync endpoint with `/exec` URL.
5. Save sync settings.

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
3. Leave bearer token field empty.
4. Click `Load Library`.
5. Import the uploaded session.
6. Verify:
   - session appears in dropdown
   - session imports successfully
   - steps/screenshots render

## Failure checks

- If `Load Library` fails, validate `.../exec?action=debugAuth&accessToken=<token>` with `CAPME_DEBUG_AUTH=true`.
- If upload fails, inspect `chrome.storage.local.get([\"syncState\"], console.log)` and check `lastErrorDetail`.
