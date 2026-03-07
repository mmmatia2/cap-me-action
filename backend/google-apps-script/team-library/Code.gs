const TEAM_SYNC_PROTOCOL_VERSION = "1.0.0";
const TEAM_SYNC_BACKEND_VERSION = "2026-03-06";
const TEAM_SYNC_SERVICE_NAME = "cap-me-team-library";
const TEAM_SYNC_SUPPORTED_ACTIONS = {
  get: ["health", "version", "debugAuth", "listSessions", "getSession"],
  post: ["uploadSession", "deleteSession"]
};

function withResponseMeta(payload) {
  const base = payload && typeof payload === "object" && !Array.isArray(payload) ? payload : { value: payload };
  return {
    ...base,
    service: TEAM_SYNC_SERVICE_NAME,
    protocolVersion: TEAM_SYNC_PROTOCOL_VERSION,
    backendVersion: TEAM_SYNC_BACKEND_VERSION
  };
}

function jsonResponse(payload) {
  const output = ContentService.createTextOutput(JSON.stringify(withResponseMeta(payload)));
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

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function getAllowedEmails() {
  const raw = PropertiesService.getScriptProperties().getProperty("CAPME_ALLOWED_EMAILS") || "";
  return raw
    .split(",")
    .map((x) => normalizeEmail(x))
    .filter(Boolean);
}

function isDebugAuthEnabled() {
  const raw = PropertiesService.getScriptProperties().getProperty("CAPME_DEBUG_AUTH") || "";
  return normalizeEmail(raw) === "true";
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
    const userinfo = UrlFetchApp.fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
      method: "get",
      headers: { Authorization: "Bearer " + accessToken },
      muteHttpExceptions: true
    });
    if (userinfo.getResponseCode() === 200) {
      const payload = JSON.parse(userinfo.getContentText() || "{}");
      const email = normalizeEmail(payload.email);
      if (email) return email;
    }

    const tokenInfoUrl =
      "https://oauth2.googleapis.com/tokeninfo?access_token=" + encodeURIComponent(accessToken);
    const tokenInfo = UrlFetchApp.fetch(tokenInfoUrl, { muteHttpExceptions: true });
    if (tokenInfo.getResponseCode() !== 200) return null;
    const tokenInfoBody = JSON.parse(tokenInfo.getContentText() || "{}");
    return normalizeEmail(tokenInfoBody.email) || null;
  } catch (error) {
    return null;
  }
}

function resolveIdentity(e, body) {
  const accessToken = getAccessToken(e, body);
  const tokenEmail = getEmailFromAccessToken(accessToken);
  if (tokenEmail) return { email: tokenEmail, source: "token" };

  const sessionEmail = getEmailFromGoogleSession();
  if (sessionEmail) return { email: sessionEmail, source: "session" };

  return { email: null, source: "none" };
}

function assertAllowedUser(e, body) {
  const identity = resolveIdentity(e, body);
  if (!identity.email) throw new Error("AUTH_REQUIRED");

  const allow = getAllowedEmails();
  if (allow.length === 0 || allow.indexOf("*") >= 0) {
    return identity;
  }
  if (!allow.includes(identity.email)) {
    throw new Error("AUTH_DENIED");
  }
  return identity;
}

function getFolderId() {
  const raw = PropertiesService.getScriptProperties().getProperty("CAPME_FOLDER_ID") || "";
  const match = String(raw).trim().match(/[-\w]{25,}/);
  return match ? match[0] : "";
}

function getFolder() {
  const folderId = getFolderId();
  if (!folderId) throw new Error("FOLDER_NOT_CONFIGURED");
  try {
    return DriveApp.getFolderById(folderId);
  } catch (error) {
    throw new Error("FOLDER_ACCESS_DENIED_OR_INVALID_ID");
  }
}

function healthResponse() {
  return jsonResponse({
    ok: true,
    status: "healthy",
    folderConfigured: Boolean(getFolderId()),
    debugAuthEnabled: isDebugAuthEnabled(),
    checkedAt: Date.now()
  });
}

function versionResponse() {
  return jsonResponse({
    ok: true,
    status: "ready",
    checkedAt: Date.now(),
    supportedActions: TEAM_SYNC_SUPPORTED_ACTIONS,
    requestConventions: {
      protocolVersionQueryParam: true,
      accessTokenQueryParam: true,
      accessTokenBodyField: "accessToken",
      payloadBodyField: "payload",
      deleteSessionBodyField: "sessionId",
      googleSessionFallback: true
    }
  });
}

function debugAuth(e) {
  if (!isDebugAuthEnabled()) {
    return jsonResponse({ ok: false, errorCode: "DEBUG_AUTH_DISABLED" });
  }
  const identity = resolveIdentity(e, null);
  return jsonResponse({
    ok: Boolean(identity.email),
    email: identity.email || null,
    source: identity.source
  });
}

function doGet(e) {
  try {
    const action = (e.parameter && e.parameter.action) || "";
    if (action === "health") return healthResponse();
    if (action === "version") return versionResponse();
    if (action === "debugAuth") return debugAuth(e);

    assertAllowedUser(e, null);

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
    const identity = assertAllowedUser(e, body);
    const action = (e.parameter && e.parameter.action) || "";

    if (action === "uploadSession") return uploadSession(body, identity.email);
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
  payload.meta.protocolVersion = TEAM_SYNC_PROTOCOL_VERSION;

  const folder = getFolder();
  const name = sessionId + ".json";
  const existing = folder.getFilesByName(name);
  if (existing.hasNext()) {
    existing.next().setTrashed(true);
  }

  const file = folder.createFile(name, JSON.stringify(payload), MimeType.PLAIN_TEXT);
  return jsonResponse({
    ok: true,
    sessionId: sessionId,
    fileId: file.getId(),
    uploadedAt: Date.now(),
    revision: payload.meta.syncRevision || 1
  });
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
      payload = JSON.parse(file.getBlob().getDataAsString() || "{}");
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
  const safeLimit = Math.max(1, Math.min(Number.isFinite(limit) ? limit : 50, 200));

  return jsonResponse({ ok: true, items: items.slice(0, safeLimit) });
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

function authorizeScopesOnce() {
  DriveApp.getRootFolder().getId();
  UrlFetchApp.fetch("https://www.googleapis.com/oauth2/v2/userinfo", { muteHttpExceptions: true });
}
