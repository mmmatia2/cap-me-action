# Team Sync (Google Drive + Apps Script) Setup

Purpose: no-server shared session library for small teams.

## Quotas (consumer/free baseline)

- Apps Script URL Fetch calls/day: 20,000
- Apps Script total trigger/runtime per day: ~90 minutes

These are the baseline planning numbers this project targets for small-team usage.

## Script properties required

Set these in Apps Script `Project Settings -> Script properties`:

- `CAPME_FOLDER_ID`: Drive folder ID to store session JSON files.
- `CAPME_ALLOWED_EMAILS`: comma-separated allowed emails (lowercase).

## API contract

- `POST ?action=uploadSession`
- `GET ?action=listSessions&limit=50&cursor=...`
- `GET ?action=getSession&sessionId=...`
- `POST ?action=deleteSession` (optional admin action)

## Minimal Apps Script server template

```javascript
function jsonResponse(payload, status) {
  const output = ContentService.createTextOutput(JSON.stringify(payload));
  output.setMimeType(ContentService.MimeType.JSON);
  return output;
}

function getAllowedEmails() {
  const raw = PropertiesService.getScriptProperties().getProperty("CAPME_ALLOWED_EMAILS") || "";
  return raw.split(",").map((x) => x.trim().toLowerCase()).filter(Boolean);
}

function assertAllowedUser() {
  const email = Session.getActiveUser().getEmail().toLowerCase();
  const allow = getAllowedEmails();
  if (allow.length > 0 && !allow.includes(email)) {
    throw new Error("AUTH_DENIED");
  }
  return email;
}

function getFolder() {
  const folderId = PropertiesService.getScriptProperties().getProperty("CAPME_FOLDER_ID");
  if (!folderId) throw new Error("FOLDER_NOT_CONFIGURED");
  return DriveApp.getFolderById(folderId);
}

function doGet(e) {
  try {
    assertAllowedUser();
    const action = e.parameter.action;
    if (action === "listSessions") return listSessions(e);
    if (action === "getSession") return getSession(e);
    return jsonResponse({ ok: false, errorCode: "UNKNOWN_ACTION" });
  } catch (error) {
    return jsonResponse({ ok: false, errorCode: String(error.message || error) });
  }
}

function doPost(e) {
  try {
    const email = assertAllowedUser();
    const action = e.parameter.action;
    const body = JSON.parse(e.postData.contents || "{}");
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
    const content = file.getBlob().getDataAsString();
    const payload = JSON.parse(content || "{}");
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
  return jsonResponse({ ok: true, items: items.slice(0, Number(e.parameter.limit || 50)) });
}

function getSession(e) {
  const sessionId = e.parameter.sessionId;
  if (!sessionId) return jsonResponse({ ok: false, errorCode: "SESSION_ID_REQUIRED" });
  const folder = getFolder();
  const fileName = sessionId + ".json";
  const files = folder.getFilesByName(fileName);
  if (!files.hasNext()) return jsonResponse({ ok: false, errorCode: "SESSION_NOT_FOUND" });
  const payload = JSON.parse(files.next().getBlob().getDataAsString() || "{}");
  return jsonResponse({ ok: true, payload: payload });
}

function deleteSession(body) {
  const sessionId = body.sessionId;
  if (!sessionId) return jsonResponse({ ok: false, errorCode: "SESSION_ID_REQUIRED" });
  const folder = getFolder();
  const files = folder.getFilesByName(sessionId + ".json");
  if (!files.hasNext()) return jsonResponse({ ok: false, errorCode: "SESSION_NOT_FOUND" });
  files.next().setTrashed(true);
  return jsonResponse({ ok: true, sessionId: sessionId });
}
```

## Deployment notes

- Deploy as Web App.
- Execute as: `User accessing the web app`.
- Access: `Only users in your domain` or restricted user set (recommended).
- Use deployed URL as extension/editor `syncConfig.endpointUrl`.
