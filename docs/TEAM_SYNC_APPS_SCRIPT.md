# Team Sync (Google Drive + Apps Script) Setup

Purpose: no-server shared session library for small teams.

This runbook is the production path for `CMA-005`.

## Quotas (consumer/free baseline)

- Apps Script URL Fetch calls/day: 20,000
- Apps Script total trigger/runtime per day: ~90 minutes

These are planning numbers for small-team usage.

## Step 1: Prepare Drive Folder

1. Create a dedicated Google Drive folder for synced session JSON files.
2. Open the folder and copy the folder ID from the URL.
   - Example URL: `https://drive.google.com/drive/folders/<FOLDER_ID>`
3. Keep this value for `CAPME_FOLDER_ID`.

## Step 2: Create Apps Script Project

1. Go to `https://script.google.com`.
2. Create a new project.
3. Replace default code with the template in "Minimal Apps Script server template" below.
4. Save the project.

## Step 3: Set Script Properties

In Apps Script, go to `Project Settings -> Script properties` and add:

- `CAPME_FOLDER_ID`: Drive folder ID from Step 1.
- `CAPME_ALLOWED_EMAILS`: comma-separated allowed emails (lowercase).

Example:

- `CAPME_ALLOWED_EMAILS=alice@company.com,bob@company.com`

## Step 4: Deploy Apps Script Web App

1. Click `Deploy -> New deployment`.
2. Type: `Web app`.
3. Execute as: `Me`.
4. Access: `Anyone` (not `Anyone with Google account`).
5. Deploy and copy the generated web app URL.

This URL is your `syncConfig.endpointUrl`.

Why this setup: extension/background fetches are API calls (not interactive browser pages), so cookie/session auth is unreliable. The script below validates Google access tokens from request payload/query and applies `CAPME_ALLOWED_EMAILS` server-side.

Quick verification after deploy:

1. Open the web app URL in an incognito window (logged out is fine) with:
   - `.../exec?action=listSessions&limit=1&accessToken=invalid`
2. Expected: JSON response (`AUTH_REQUIRED`/`AUTH_DENIED`/`ok`) from your script.
3. If you get redirected to Google login, deployment access is still not `Anyone`.

## Step 5: Get Chrome Extension ID

1. Open `chrome://extensions`.
2. Enable `Developer mode`.
3. Load this repo's `extension/` folder as unpacked (if not already loaded).
4. Copy the extension ID shown on the card.

You need this ID to create a Chrome Extension OAuth client in Google Cloud.

## Step 6: Create OAuth Client ID (Google Cloud)

1. Open `https://console.cloud.google.com` and select/create a project.
2. Configure OAuth consent screen if not done yet.
3. Add scopes used by extension:
   - `openid`
   - `email`
   - `profile`
   - `https://www.googleapis.com/auth/drive.file`
4. Add your team accounts as test users if app is in testing mode.
5. Go to `APIs & Services -> Credentials`.
6. Create credential: `OAuth client ID`.
7. Application type: `Chrome Extension`.
8. Enter extension ID from Step 5.
9. Create and copy client ID.

Client ID format should end with `.apps.googleusercontent.com`.

## Step 7: Apply OAuth Client ID to Manifest

Option A (recommended helper script):

```bash
pnpm extension:set-oauth-client-id -- --client-id "YOUR_CLIENT_ID.apps.googleusercontent.com"
```

Option B (manual):

- Edit `extension/manifest.json` -> `oauth2.client_id`.

Then reload extension in `chrome://extensions`.

## Step 8: Configure Sync In Inspector

1. Open extension inspector.
2. In `Sync Settings`:
   - Enable sync.
   - Paste endpoint URL from Step 4.
   - Enable `Mask input values` (recommended).
   - Set `Auto upload on stop` as desired.
   - Add allow-list emails (optional, comma separated).
3. Click `Save Sync Settings`.
4. Click `Sign In` and approve account access.

Expected:

- Account text shows connected email.
- Save confirmation appears.

## Step 9: End-to-End Validation (Two Users)

User A:

1. Start capture, perform 3-5 actions, stop capture.
2. Trigger `Sync Selected Session` in inspector.
3. Confirm sync status moves to `synced`.

User B:

1. Open editor, choose `Team Library` source.
2. Use same endpoint URL.
3. Load library and import User A session.
4. Confirm steps/screenshots render correctly.

Pass criteria:

- Session uploaded and retrievable by another allowed user.
- `SESSION_NOT_FOUND`, `AUTH_DENIED`, and endpoint misconfigurations produce clear errors.

## Step 10: Troubleshooting

- `AUTH_REQUIRED` or sign-in fails:
  - Verify OAuth client is Chrome Extension type and bound to correct extension ID.
  - Reload extension after manifest update.
- `AUTH_DENIED`:
  - Check allowed/test users in OAuth consent and `CAPME_ALLOWED_EMAILS`.
- `HTTP_302` or generic `UPLOAD_FAILED`:
  - Usually means old deployment/auth mode mismatch.
  - Confirm script code includes `getAccessToken` + `assertAllowedUser(e, body)` from this doc.
  - Redeploy as Web App after saving code changes, then update inspector endpoint if URL changed.
- `HTTP_404` on sync upload:
  - Check `chrome.storage.local.get(["syncState"], console.log)` and inspect `syncState.lastErrorDetail`.
  - Verify `request=...action=uploadSession` and `response=...` values point to your active `/exec` deployment.
  - If response points to a Google login or generic HTML page, deployment access is not fully public (`Anyone`) or endpoint URL is stale.
- `SYNC_ENDPOINT_MISSING`:
  - Save sync settings with endpoint URL.
- `SESSION_NOT_FOUND`:
  - Confirm upload succeeded and session ID exists in Drive folder JSON file.
- `FOLDER_NOT_CONFIGURED`:
  - Verify `CAPME_FOLDER_ID` script property.

## API Contract

- `POST ?action=uploadSession`
- `GET ?action=listSessions&limit=50&cursor=...`
- `GET ?action=getSession&sessionId=...`
- `POST ?action=deleteSession` (optional admin action)

## Minimal Apps Script server template

```javascript
function jsonResponse(payload) {
  const output = ContentService.createTextOutput(JSON.stringify(payload));
  output.setMimeType(ContentService.MimeType.JSON);
  return output;
}

function parseBody(e) {
  try {
    return JSON.parse((e && e.postData && e.postData.contents) || "{}");
  } catch (error) {
    throw new Error("INVALID_JSON_BODY");
  }
}

function getAllowedEmails() {
  const raw = PropertiesService.getScriptProperties().getProperty("CAPME_ALLOWED_EMAILS") || "";
  return raw.split(",").map((x) => x.trim().toLowerCase()).filter(Boolean);
}

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function getAccessToken(e, body) {
  const fromBody = String((body && body.accessToken) || "").trim();
  if (fromBody) return fromBody;
  return String((e && e.parameter && e.parameter.accessToken) || "").trim();
}

function getEmailFromGoogleSession() {
  try {
    return normalizeEmail(Session.getActiveUser().getEmail()) || null;
  } catch (error) {
    return null;
  }
}

function getEmailFromAccessToken(accessToken) {
  if (!accessToken) return null;
  try {
    const url =
      "https://oauth2.googleapis.com/tokeninfo?access_token=" +
      encodeURIComponent(accessToken);
    const response = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
    if (response.getResponseCode() !== 200) return null;
    const payload = JSON.parse(response.getContentText() || "{}");
    return normalizeEmail(payload.email) || null;
  } catch (error) {
    return null;
  }
}

function resolveUserEmail(e, body) {
  const sessionEmail = getEmailFromGoogleSession();
  if (sessionEmail) return sessionEmail;
  const accessToken = getAccessToken(e, body);
  return getEmailFromAccessToken(accessToken);
}

function assertAllowedUser(e, body) {
  const email = resolveUserEmail(e, body);
  if (!email) {
    throw new Error("AUTH_REQUIRED");
  }
  const allow = getAllowedEmails();
  if (allow.length > 0 && !allow.includes(email)) throw new Error("AUTH_DENIED");
  return email;
}

function getFolder() {
  const raw = PropertiesService.getScriptProperties().getProperty("CAPME_FOLDER_ID") || "";
  const folderId = String(raw).split("?")[0].trim();
  if (!folderId) throw new Error("FOLDER_NOT_CONFIGURED");
  return DriveApp.getFolderById(folderId);
}

function doGet(e) {
  try {
    assertAllowedUser(e, null);
    const action = (e.parameter && e.parameter.action) || "";
    if (action === "listSessions") return listSessions(e);
    if (action === "getSession") return getSession(e);
    return jsonResponse({ ok: false, errorCode: "UNKNOWN_ACTION" });
  } catch (error) {
    return jsonResponse({ ok: false, errorCode: String(error.message || error) });
  }
}

function doPost(e) {
  try {
    const body = parseBody(e);
    const email = assertAllowedUser(e, body);
    const action = (e.parameter && e.parameter.action) || "";
    if (action === "uploadSession") return uploadSession(body, email);
    if (action === "deleteSession") return deleteSession(body);
    return jsonResponse({ ok: false, errorCode: "UNKNOWN_ACTION" });
  } catch (error) {
    return jsonResponse({ ok: false, errorCode: String(error.message || error) });
  }
}

function uploadSession(body, email) {
  const payload = body.payload || {};
  const sessionId = payload.session && payload.session.id;
  if (!sessionId) return jsonResponse({ ok: false, errorCode: "SESSION_ID_REQUIRED" });

  payload.meta = payload.meta || {};
  payload.meta.capturedBy = email;
  payload.meta.serverSavedAt = Date.now();

  const folder = getFolder();
  const name = sessionId + ".json";
  const existing = folder.getFilesByName(name);
  if (existing.hasNext()) {
    existing.next().setTrashed(true);
  }
  const file = folder.createFile(name, JSON.stringify(payload), MimeType.PLAIN_TEXT);
  return jsonResponse({ ok: true, sessionId: sessionId, fileId: file.getId(), uploadedAt: Date.now(), revision: payload.meta.syncRevision || 1 });
}

function listSessions(e) {
  const folder = getFolder();
  const files = folder.getFiles();
  const items = [];
  while (files.hasNext()) {
    const file = files.next();
    if (!file.getName().endsWith(".json")) continue;
    let payload = {};
    try {
      const content = file.getBlob().getDataAsString();
      payload = JSON.parse(content || "{}");
    } catch (error) {
      continue;
    }
    const session = payload.session || {};
    items.push({
      id: session.id || file.getName().replace(".json", ""),
      sessionId: session.id || file.getName().replace(".json", ""),
      title: session.lastTitle || session.startTitle || session.lastUrl || "Untitled",
      stepsCount: session.stepsCount || (payload.steps || []).length || 0,
      updatedAt: session.updatedAt || payload.exportedAt || file.getLastUpdated().getTime()
    });
  }
  items.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  const limit = Number((e.parameter && e.parameter.limit) || 50);
  return jsonResponse({ ok: true, items: items.slice(0, Math.max(1, Math.min(limit, 200))) });
}

function getSession(e) {
  const sessionId = String((e.parameter && e.parameter.sessionId) || "").trim();
  if (!sessionId) return jsonResponse({ ok: false, errorCode: "SESSION_ID_REQUIRED" });
  const folder = getFolder();
  const fileName = sessionId + ".json";
  const files = folder.getFilesByName(fileName);
  if (!files.hasNext()) return jsonResponse({ ok: false, errorCode: "SESSION_NOT_FOUND" });
  const payload = JSON.parse(files.next().getBlob().getDataAsString() || "{}");
  return jsonResponse({ ok: true, payload: payload, sessionId: sessionId });
}

function deleteSession(body) {
  const sessionId = String((body && body.sessionId) || "").trim();
  if (!sessionId) return jsonResponse({ ok: false, errorCode: "SESSION_ID_REQUIRED" });
  const folder = getFolder();
  const files = folder.getFilesByName(sessionId + ".json");
  if (!files.hasNext()) return jsonResponse({ ok: false, errorCode: "SESSION_NOT_FOUND" });
  files.next().setTrashed(true);
  return jsonResponse({ ok: true, sessionId: sessionId });
}
```

## Official References

- Chrome Identity API: https://developer.chrome.com/docs/extensions/reference/api/identity
- Integrate OAuth in Chrome extensions: https://developer.chrome.com/docs/extensions/how-to/integrate/oauth
- Google OAuth consent screen setup: https://developers.google.com/workspace/guides/configure-oauth-consent
- Google OAuth app verification and scopes: https://support.google.com/cloud/answer/13463073
