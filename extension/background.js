// Purpose: normalize extension events into Session/Step records persisted in chrome.storage.local.
// Inputs: capture/runtime messages. Outputs: capture state, sessions, steps, and sync queue state.
const STORAGE_VERSION = 2;
const APP_SCHEMA_VERSION = "1.1.0";
const SYNC_ALARM_NAME = "capme-sync-tick";
const MAX_SESSIONS = 20;
const MAX_STEPS = 500;
const MAX_EVENT_LOG = 200;

const lastThumbnailCaptureByTab = {};

const DEFAULT_CAPTURE_STATE = { isCapturing: false, startedAt: null };
const DEFAULT_SYNC_CONFIG = {
  enabled: false,
  autoUploadOnStop: false,
  endpointUrl: "",
  editorUrl: "https://cap-me-action.vercel.app",
  allowedEmails: [],
  maskInputValues: true
};
const DEFAULT_SYNC_STATE = {
  lastRunAt: null,
  successCount: 0,
  failureCount: 0,
  quotaWarning: false,
  lastErrorCode: null,
  lastErrorAt: null
};
const DEFAULT_TEAM_LIBRARY_CACHE = { items: [], updatedAt: null };

// Purpose: keep thumbnails readable for editor annotation while staying within storage limits.
const THUMBNAIL_CAPTURE_CONFIG = {
  maxWidth: 1280,
  maxHeight: 800,
  maxBytes: 220 * 1024,
  qualitySteps: [0.9, 0.84, 0.78, 0.72, 0.66, 0.58]
};

function nowTs() {
  return Date.now();
}

function makeId(prefix) {
  return `${prefix}_${nowTs()}_${Math.random().toString(36).slice(2, 8)}`;
}

function defaultSessionSync() {
  return {
    status: "local",
    revision: null,
    lastSyncedAt: null,
    errorCode: null
  };
}

function normalizeSession(session) {
  const normalized = {
    id: String(session?.id ?? makeId("sess")),
    tabId: Number.isFinite(session?.tabId) ? session.tabId : -1,
    startUrl: String(session?.startUrl ?? ""),
    startTitle: String(session?.startTitle ?? ""),
    lastUrl: String(session?.lastUrl ?? ""),
    lastTitle: String(session?.lastTitle ?? ""),
    startedAt: Number.isFinite(session?.startedAt) ? session.startedAt : nowTs(),
    updatedAt: Number.isFinite(session?.updatedAt) ? session.updatedAt : nowTs(),
    stepsCount: Number.isFinite(session?.stepsCount) ? Math.max(0, session.stepsCount) : 0,
    sync: {
      ...defaultSessionSync(),
      ...(session?.sync ?? {})
    }
  };

  if (!normalized.lastUrl) {
    normalized.lastUrl = normalized.startUrl;
  }
  if (!normalized.lastTitle) {
    normalized.lastTitle = normalized.startTitle;
  }
  if (!["local", "pending", "synced", "failed", "blocked"].includes(normalized.sync.status)) {
    normalized.sync.status = "local";
  }

  return normalized;
}

function normalizeStep(step, idx) {
  return {
    ...step,
    id: step?.id ?? makeId("step"),
    stepIndex: Number.isFinite(step?.stepIndex) ? step.stepIndex : idx + 1,
    annotations: Array.isArray(step?.annotations) ? step.annotations : []
  };
}

function normalizeSyncConfig(value) {
  return {
    ...DEFAULT_SYNC_CONFIG,
    ...(value ?? {}),
    endpointUrl: String(value?.endpointUrl ?? DEFAULT_SYNC_CONFIG.endpointUrl).trim(),
    editorUrl: String(value?.editorUrl ?? DEFAULT_SYNC_CONFIG.editorUrl).trim(),
    allowedEmails: Array.isArray(value?.allowedEmails)
      ? value.allowedEmails.map((x) => String(x).trim().toLowerCase()).filter(Boolean)
      : []
  };
}

function normalizeStore(store) {
  const sessions = Array.isArray(store?.sessions) ? store.sessions.map(normalizeSession) : [];
  const steps = Array.isArray(store?.steps)
    ? store.steps.map((step, idx) => normalizeStep(step, idx))
    : [];

  return {
    storageVersion: Number.isFinite(store?.storageVersion) ? store.storageVersion : 0,
    schemaVersion: String(store?.schemaVersion ?? APP_SCHEMA_VERSION),
    captureState: { ...DEFAULT_CAPTURE_STATE, ...(store?.captureState ?? {}) },
    sessions,
    steps,
    sessionByTab: typeof store?.sessionByTab === "object" && store.sessionByTab
      ? { ...store.sessionByTab }
      : {},
    eventLog: Array.isArray(store?.eventLog) ? store.eventLog : [],
    syncConfig: normalizeSyncConfig(store?.syncConfig),
    syncQueue: Array.isArray(store?.syncQueue) ? store.syncQueue : [],
    syncState: { ...DEFAULT_SYNC_STATE, ...(store?.syncState ?? {}) },
    teamLibraryCache:
      typeof store?.teamLibraryCache === "object" && store.teamLibraryCache
        ? { ...DEFAULT_TEAM_LIBRARY_CACHE, ...store.teamLibraryCache }
        : { ...DEFAULT_TEAM_LIBRARY_CACHE }
  };
}

function buildStepSignature(step) {
  const t = step.target ?? {};
  const m = step.modifiers ?? {};
  return [
    step.type,
    step.url,
    step.pageTitle ?? "",
    t.tag ?? "",
    t.id ?? "",
    t.name ?? "",
    step.key ?? "",
    step.value ?? "",
    step.optionValue ?? "",
    String(step.checked ?? ""),
    String(step.scrollX ?? ""),
    String(step.scrollY ?? ""),
    step.navigationKind ?? "",
    m.ctrl ? "1" : "0",
    m.meta ? "1" : "0",
    m.alt ? "1" : "0",
    m.shift ? "1" : "0"
  ].join("|");
}

function findLatestSessionStep(steps, sessionId) {
  for (let i = steps.length - 1; i >= 0; i -= 1) {
    if (steps[i].sessionId === sessionId) {
      return steps[i];
    }
  }
  return null;
}

function createSession(sessionId, tabId, payload) {
  return normalizeSession({
    id: sessionId,
    tabId,
    startUrl: payload?.href ?? "",
    startTitle: payload?.title ?? "",
    lastUrl: payload?.href ?? "",
    lastTitle: payload?.title ?? "",
    startedAt: payload?.ts ?? nowTs(),
    updatedAt: payload?.ts ?? nowTs(),
    stepsCount: 0,
    sync: defaultSessionSync()
  });
}

function shouldCaptureThumbnail(type) {
  return ["click", "input", "select", "toggle", "navigate"].includes(type);
}

function getStorage(keys) {
  return new Promise((resolve) => chrome.storage.local.get(keys, resolve));
}

function setStorage(value) {
  return new Promise((resolve) => chrome.storage.local.set(value, resolve));
}

function getAuthToken(interactive) {
  return new Promise((resolve) => {
    if (!chrome.identity?.getAuthToken) {
      resolve({ ok: false, errorCode: "AUTH_UNAVAILABLE" });
      return;
    }

    chrome.identity.getAuthToken({ interactive: Boolean(interactive) }, (token) => {
      if (chrome.runtime.lastError || !token) {
        resolve({ ok: false, errorCode: interactive ? "AUTH_DENIED" : "AUTH_REQUIRED" });
        return;
      }
      resolve({ ok: true, token });
    });
  });
}

function removeCachedToken(token) {
  return new Promise((resolve) => {
    if (!chrome.identity?.removeCachedAuthToken || !token) {
      resolve();
      return;
    }
    chrome.identity.removeCachedAuthToken({ token }, () => resolve());
  });
}

async function fetchProfileEmail(token) {
  try {
    const response = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!response.ok) {
      return null;
    }
    const payload = await response.json();
    return String(payload?.email ?? "").trim().toLowerCase() || null;
  } catch {
    return null;
  }
}

function createQueueItem(sessionId, reason = "manual") {
  return {
    id: makeId("sync"),
    sessionId,
    reason,
    attempt: 0,
    nextRetryAt: nowTs(),
    lastErrorCode: null,
    lastErrorAt: null,
    createdAt: nowTs(),
    updatedAt: nowTs()
  };
}

function retryDelayMs(attempt) {
  const base = 60 * 1000;
  const cappedAttempt = Math.min(attempt, 8);
  const withoutJitter = base * 2 ** cappedAttempt;
  const jitter = Math.floor(Math.random() * 15 * 1000);
  return Math.min(withoutJitter + jitter, 60 * 60 * 1000);
}

async function scheduleSyncAlarm(syncQueue) {
  const nextAt = syncQueue
    .map((item) => Number(item?.nextRetryAt) || 0)
    .filter((ts) => ts > 0)
    .sort((a, b) => a - b)[0];

  if (!nextAt) {
    await new Promise((resolve) => chrome.alarms.clear(SYNC_ALARM_NAME, () => resolve()));
    return;
  }

  const when = Math.max(nowTs() + 1000, nextAt);
  chrome.alarms.create(SYNC_ALARM_NAME, { when, periodInMinutes: 1 });
}

function sessionById(sessions, sessionId) {
  return sessions.find((x) => x.id === sessionId) ?? null;
}

function queueHasSession(syncQueue, sessionId) {
  return syncQueue.some((item) => item.sessionId === sessionId);
}

function buildSyncPayload(session, steps, capturedBy, syncRevision, maskInputValues) {
  const maskedSteps = steps.map((step) => {
    if (!maskInputValues) {
      return step;
    }
    if (step.type !== "input") {
      return step;
    }
    return { ...step, value: step.value ? "[REDACTED]" : step.value };
  });

  return {
    schemaVersion: APP_SCHEMA_VERSION,
    exportedAt: nowTs(),
    session,
    steps: maskedSteps,
    meta: {
      capturedBy: capturedBy || "unknown",
      appVersion: chrome.runtime.getManifest().version,
      syncRevision: Number.isFinite(syncRevision) ? syncRevision : 1
    }
  };
}

async function uploadSessionToEndpoint(syncConfig, session, steps) {
  if (!syncConfig.enabled) {
    return { ok: false, errorCode: "SYNC_DISABLED" };
  }
  if (!syncConfig.endpointUrl) {
    return { ok: false, errorCode: "SYNC_ENDPOINT_MISSING" };
  }

  const tokenResult = await getAuthToken(false);
  if (!tokenResult.ok) {
    return tokenResult;
  }

  const userEmail = await fetchProfileEmail(tokenResult.token);
  if (syncConfig.allowedEmails.length > 0) {
    const isAllowed = userEmail && syncConfig.allowedEmails.includes(userEmail);
    if (!isAllowed) {
      return { ok: false, errorCode: "AUTH_DENIED" };
    }
  }

  const syncRevision = (session.sync?.revision ?? 0) + 1;
  const payload = buildSyncPayload(
    session,
    steps,
    userEmail,
    syncRevision,
    Boolean(syncConfig.maskInputValues)
  );

  let response;
  try {
    const endpoint = `${syncConfig.endpointUrl}${syncConfig.endpointUrl.includes("?") ? "&" : "?"}action=uploadSession`;
    response = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${tokenResult.token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        schemaVersion: APP_SCHEMA_VERSION,
        payload,
        client: { name: "cap-me-action-extension", version: chrome.runtime.getManifest().version }
      })
    });
  } catch {
    return { ok: false, errorCode: "NETWORK_ERROR" };
  }

  if (response.status === 401) {
    await removeCachedToken(tokenResult.token);
    return { ok: false, errorCode: "TOKEN_EXPIRED" };
  }
  if (response.status === 403) {
    return { ok: false, errorCode: "AUTH_DENIED" };
  }
  if (response.status === 429) {
    return { ok: false, errorCode: "QUOTA_EXCEEDED" };
  }

  let body = {};
  try {
    body = await response.json();
  } catch {
    body = {};
  }

  if (!response.ok || body?.ok === false) {
    return { ok: false, errorCode: String(body?.errorCode ?? "UPLOAD_FAILED") };
  }

  return {
    ok: true,
    revision: Number(body?.revision ?? syncRevision),
    uploadedAt: Number(body?.uploadedAt ?? nowTs()),
    fileId: body?.fileId ?? null
  };
}

function appendEventLog(store, event) {
  store.eventLog.push(event);
  if (store.eventLog.length > MAX_EVENT_LOG) {
    store.eventLog = store.eventLog.slice(-MAX_EVENT_LOG);
  }
}

function markSessionSyncStatus(session, patch) {
  session.sync = {
    ...defaultSessionSync(),
    ...(session.sync ?? {}),
    ...patch
  };
}

function ensureSessionQueued(store, sessionId, reason) {
  const session = sessionById(store.sessions, sessionId);
  if (!session) {
    return { ok: false, errorCode: "SESSION_NOT_FOUND" };
  }
  if (!store.syncConfig.enabled) {
    markSessionSyncStatus(session, { status: "blocked", errorCode: "SYNC_DISABLED" });
    return { ok: false, errorCode: "SYNC_DISABLED" };
  }
  if (!store.syncConfig.endpointUrl) {
    markSessionSyncStatus(session, { status: "blocked", errorCode: "SYNC_ENDPOINT_MISSING" });
    return { ok: false, errorCode: "SYNC_ENDPOINT_MISSING" };
  }

  if (!queueHasSession(store.syncQueue, sessionId)) {
    store.syncQueue.push(createQueueItem(sessionId, reason));
  }
  markSessionSyncStatus(session, { status: "pending", errorCode: null });
  return { ok: true };
}

function resolveSessionIdForSender(store, sender, fallbackToLatest = true) {
  const tabId = sender?.tab?.id;
  if (typeof tabId === "number") {
    const mapped = store.sessionByTab[String(tabId)];
    if (mapped) {
      return mapped;
    }
  }

  if (!fallbackToLatest) {
    return null;
  }

  const latest = [...store.sessions].sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0))[0];
  return latest?.id ?? null;
}

async function loadStore() {
  const raw = await getStorage([
    "storageVersion",
    "schemaVersion",
    "captureState",
    "sessions",
    "steps",
    "sessionByTab",
    "eventLog",
    "syncConfig",
    "syncQueue",
    "syncState",
    "teamLibraryCache"
  ]);
  return normalizeStore(raw);
}

async function saveStore(store) {
  await setStorage({
    storageVersion: STORAGE_VERSION,
    schemaVersion: APP_SCHEMA_VERSION,
    captureState: store.captureState,
    sessions: store.sessions.slice(-MAX_SESSIONS),
    steps: store.steps.slice(-MAX_STEPS),
    sessionByTab: store.sessionByTab,
    eventLog: store.eventLog.slice(-MAX_EVENT_LOG),
    syncConfig: normalizeSyncConfig(store.syncConfig),
    syncQueue: store.syncQueue,
    syncState: { ...DEFAULT_SYNC_STATE, ...(store.syncState ?? {}) },
    teamLibraryCache: { ...DEFAULT_TEAM_LIBRARY_CACHE, ...(store.teamLibraryCache ?? {}) }
  });
}

async function migrateStorageIfNeeded(reason = "runtime") {
  const store = await loadStore();
  let changed = false;

  if (store.storageVersion < STORAGE_VERSION) {
    changed = true;
  }

  for (let i = 0; i < store.sessions.length; i += 1) {
    const normalized = normalizeSession(store.sessions[i]);
    if (JSON.stringify(normalized) !== JSON.stringify(store.sessions[i])) {
      store.sessions[i] = normalized;
      changed = true;
    }
  }

  for (let i = 0; i < store.steps.length; i += 1) {
    const normalized = normalizeStep(store.steps[i], i);
    if (JSON.stringify(normalized) !== JSON.stringify(store.steps[i])) {
      store.steps[i] = normalized;
      changed = true;
    }
  }

  if (store.schemaVersion !== APP_SCHEMA_VERSION) {
    store.schemaVersion = APP_SCHEMA_VERSION;
    changed = true;
  }

  if (changed) {
    appendEventLog(store, { type: "STORAGE_MIGRATED", reason, ts: nowTs() });
    await saveStore(store);
  }

  await scheduleSyncAlarm(store.syncQueue);
}

async function processSyncQueue(trigger = "manual") {
  const store = await loadStore();
  const now = nowTs();
  let changed = false;
  let processed = 0;

  for (let i = 0; i < store.syncQueue.length; i += 1) {
    const item = store.syncQueue[i];
    if (!item || (Number(item.nextRetryAt) || 0) > now) {
      continue;
    }

    const session = sessionById(store.sessions, item.sessionId);
    if (!session) {
      store.syncQueue.splice(i, 1);
      i -= 1;
      changed = true;
      continue;
    }

    const steps = store.steps
      .filter((x) => x.sessionId === session.id)
      .sort((a, b) => (a.stepIndex ?? 0) - (b.stepIndex ?? 0) || (a.at ?? 0) - (b.at ?? 0));

    const uploadResult = await uploadSessionToEndpoint(store.syncConfig, session, steps);
    processed += 1;

    if (uploadResult.ok) {
      markSessionSyncStatus(session, {
        status: "synced",
        revision: uploadResult.revision ?? session.sync?.revision ?? 1,
        lastSyncedAt: uploadResult.uploadedAt ?? nowTs(),
        errorCode: null
      });
      store.syncQueue.splice(i, 1);
      i -= 1;
      store.syncState.successCount += 1;
      store.syncState.lastErrorCode = null;
      changed = true;
      continue;
    }

    const nextAttempt = Number(item.attempt ?? 0) + 1;
    const nextRetryAt = nowTs() + retryDelayMs(nextAttempt);
    const errorCode = uploadResult.errorCode ?? "UPLOAD_FAILED";
    store.syncQueue[i] = {
      ...item,
      attempt: nextAttempt,
      nextRetryAt,
      lastErrorCode: errorCode,
      lastErrorAt: nowTs(),
      updatedAt: nowTs()
    };

    markSessionSyncStatus(session, {
      status: nextAttempt >= 3 ? "failed" : "pending",
      errorCode
    });

    if (errorCode === "QUOTA_EXCEEDED") {
      store.syncState.quotaWarning = true;
    }

    store.syncState.failureCount += 1;
    store.syncState.lastErrorCode = errorCode;
    store.syncState.lastErrorAt = nowTs();
    changed = true;
  }

  store.syncState.lastRunAt = nowTs();
  appendEventLog(store, {
    type: "SYNC_QUEUE_RUN",
    trigger,
    processed,
    pending: store.syncQueue.length,
    ts: nowTs()
  });

  if (changed) {
    await saveStore(store);
  }
  await scheduleSyncAlarm(store.syncQueue);
}

function captureVisibleTab(windowId) {
  return new Promise((resolve) => {
    chrome.tabs.captureVisibleTab(windowId, { format: "png" }, (dataUrl) => {
      if (chrome.runtime.lastError || !dataUrl) {
        resolve(null);
        return;
      }
      resolve(dataUrl);
    });
  });
}

async function blobToBase64(blob) {
  const buffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  let binary = "";
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

async function compressThumbnail(dataUrl, options = THUMBNAIL_CAPTURE_CONFIG) {
  try {
    if (typeof OffscreenCanvas === "undefined" || typeof createImageBitmap !== "function") {
      return dataUrl;
    }

    const response = await fetch(dataUrl);
    const blob = await response.blob();
    const bitmap = await createImageBitmap(blob);
    try {
      const maxScaleByWidth = options.maxWidth / bitmap.width;
      const maxScaleByHeight = options.maxHeight / bitmap.height;
      const baseScale = Math.min(1, maxScaleByWidth, maxScaleByHeight);
      let width = Math.max(1, Math.round(bitmap.width * baseScale));
      let height = Math.max(1, Math.round(bitmap.height * baseScale));
      let fallbackBlob = null;

      for (let attempt = 0; attempt < 3; attempt += 1) {
        const canvas = new OffscreenCanvas(width, height);
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          return dataUrl;
        }

        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = "high";
        ctx.drawImage(bitmap, 0, 0, width, height);

        for (const quality of options.qualitySteps) {
          const candidateBlob = await canvas.convertToBlob({ type: "image/jpeg", quality });
          fallbackBlob = candidateBlob;
          if (candidateBlob.size <= options.maxBytes) {
            const base64 = await blobToBase64(candidateBlob);
            return `data:${candidateBlob.type};base64,${base64}`;
          }
        }

        if (width <= 640 || height <= 360) {
          break;
        }

        width = Math.max(640, Math.round(width * 0.85));
        height = Math.max(360, Math.round(height * 0.85));
      }

      if (!fallbackBlob) {
        return dataUrl;
      }
      const base64 = await blobToBase64(fallbackBlob);
      return `data:${fallbackBlob.type};base64,${base64}`;
    } finally {
      bitmap.close?.();
    }
  } catch {
    return dataUrl;
  }
}

async function maybeCaptureThumbnail(sender, stepType) {
  if (!shouldCaptureThumbnail(stepType)) {
    return null;
  }

  const tab = sender.tab;
  if (!tab || typeof tab.id !== "number" || typeof tab.windowId !== "number") {
    return null;
  }

  const tabKey = String(tab.id);
  const now = nowTs();
  if (now - (lastThumbnailCaptureByTab[tabKey] ?? 0) < 1400) {
    return null;
  }
  lastThumbnailCaptureByTab[tabKey] = now;

  const raw = await captureVisibleTab(tab.windowId);
  if (!raw) {
    return null;
  }

  return compressThumbnail(raw, THUMBNAIL_CAPTURE_CONFIG);
}

chrome.runtime.onInstalled.addListener(() => {
  void migrateStorageIfNeeded("install");
});

chrome.runtime.onStartup.addListener(() => {
  void migrateStorageIfNeeded("startup");
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name !== SYNC_ALARM_NAME) {
    return;
  }
  void processSyncQueue("alarm");
});

void migrateStorageIfNeeded("load");

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message?.type) {
    sendResponse({ ok: false, error: "Invalid message" });
    return;
  }

  const tabId = sender.tab?.id;

  (async () => {
    await migrateStorageIfNeeded("runtime");
    const store = await loadStore();

    if (message.type === "AUTH_SIGN_IN") {
      const tokenResult = await getAuthToken(true);
      if (!tokenResult.ok) {
        sendResponse(tokenResult);
        return;
      }
      const email = await fetchProfileEmail(tokenResult.token);
      store.syncConfig.accountEmail = email;
      await saveStore(store);
      sendResponse({ ok: true, accountEmail: email ?? null });
      return;
    }

    if (message.type === "AUTH_SIGN_OUT") {
      const tokenResult = await getAuthToken(false);
      if (tokenResult.ok) {
        await removeCachedToken(tokenResult.token);
      }
      store.syncConfig.accountEmail = null;
      await saveStore(store);
      sendResponse({ ok: true });
      return;
    }

    if (message.type === "OPEN_EDITOR") {
      const sessionId = String(
        message.payload?.sessionId ??
          resolveSessionIdForSender(store, sender, true) ??
          ""
      ).trim();
      const source = String(message.payload?.source ?? "local").trim() || "local";
      const editorUrl = store.syncConfig?.editorUrl || "https://cap-me-action.vercel.app";
      const normalized = editorUrl.endsWith("/") ? editorUrl.slice(0, -1) : editorUrl;
      const url =
        sessionId
          ? `${normalized}?source=${encodeURIComponent(source)}&sessionId=${encodeURIComponent(sessionId)}`
          : `${normalized}?source=${encodeURIComponent(source)}`;

      chrome.tabs.create({ url }, (tab) => {
        if (chrome.runtime.lastError || !tab?.id) {
          sendResponse({ ok: false, error: chrome.runtime.lastError?.message ?? "Failed to open editor" });
          return;
        }
        sendResponse({ ok: true, tabId: tab.id, url });
      });
      return;
    }

    if (message.type === "START_CAPTURE") {
      store.captureState = { isCapturing: true, startedAt: nowTs() };
      appendEventLog(store, { type: "START_CAPTURE", tabId: tabId ?? null, ts: nowTs() });
      await saveStore(store);
      sendResponse({ ok: true, captureState: store.captureState });
      return;
    }

    if (message.type === "STOP_CAPTURE") {
      store.captureState = {
        isCapturing: false,
        startedAt: store.captureState.startedAt ?? nowTs()
      };

      let queuedSessionId = null;
      if (store.syncConfig.enabled && store.syncConfig.autoUploadOnStop) {
        const resolvedSessionId =
          message.payload?.sessionId ?? resolveSessionIdForSender(store, sender, true);
        if (resolvedSessionId) {
          const queued = ensureSessionQueued(store, resolvedSessionId, "auto-stop");
          if (queued.ok) {
            queuedSessionId = resolvedSessionId;
          }
        }
      }

      appendEventLog(store, {
        type: "STOP_CAPTURE",
        tabId: tabId ?? null,
        queuedSessionId,
        ts: nowTs()
      });

      await saveStore(store);
      await scheduleSyncAlarm(store.syncQueue);

      sendResponse({
        ok: true,
        captureState: store.captureState,
        queuedSessionId
      });
      return;
    }

    if (message.type === "GET_DOCK_STATE") {
      const sessionId = typeof tabId === "number" ? store.sessionByTab[String(tabId)] ?? null : null;
      const session = sessionId ? sessionById(store.sessions, sessionId) : null;
      const stepsCount = sessionId
        ? store.steps.filter((x) => x.sessionId === sessionId).length
        : 0;

      sendResponse({
        ok: true,
        isCapturing: Boolean(store.captureState.isCapturing),
        startedAt: store.captureState.startedAt ?? null,
        sessionId,
        stepsCount,
        sessionUpdatedAt: session?.updatedAt ?? null,
        syncStatus: session?.sync?.status ?? "local"
      });
      return;
    }

    if (message.type === "GET_SYNC_STATUS") {
      const targetSessionId =
        message.payload?.sessionId ?? resolveSessionIdForSender(store, sender, true);
      const session = targetSessionId ? sessionById(store.sessions, targetSessionId) : null;
      const queueItem = targetSessionId
        ? store.syncQueue.find((x) => x.sessionId === targetSessionId) ?? null
        : null;
      sendResponse({
        ok: true,
        sessionId: targetSessionId,
        sync: session?.sync ?? null,
        queueItem,
        syncState: store.syncState
      });
      return;
    }

    if (message.type === "SYNC_LAST_SESSION") {
      const targetSessionId = resolveSessionIdForSender(store, sender, true);
      if (!targetSessionId) {
        sendResponse({ ok: false, error: "No session available to sync" });
        return;
      }
      const queued = ensureSessionQueued(store, targetSessionId, "manual-last");
      await saveStore(store);
      await scheduleSyncAlarm(store.syncQueue);
      sendResponse({ ok: queued.ok, sessionId: targetSessionId, error: queued.errorCode ?? null });
      return;
    }

    if (message.type === "SYNC_SESSION_BY_ID") {
      const targetSessionId = String(message.payload?.sessionId ?? "").trim();
      if (!targetSessionId) {
        sendResponse({ ok: false, error: "Missing sessionId" });
        return;
      }
      const queued = ensureSessionQueued(store, targetSessionId, "manual-id");
      await saveStore(store);
      await scheduleSyncAlarm(store.syncQueue);
      sendResponse({ ok: queued.ok, sessionId: targetSessionId, error: queued.errorCode ?? null });
      return;
    }

    if (message.type === "DISCARD_LAST_STEP") {
      const sessionId = message.payload?.sessionId ?? resolveSessionIdForSender(store, sender, false);
      if (!sessionId) {
        sendResponse({ ok: false, error: "Missing sessionId" });
        return;
      }

      const session = sessionById(store.sessions, sessionId);
      if (!session) {
        sendResponse({ ok: false, error: "Session not found" });
        return;
      }

      let lastStepIndex = -1;
      for (let i = store.steps.length - 1; i >= 0; i -= 1) {
        if (store.steps[i].sessionId === sessionId) {
          lastStepIndex = i;
          break;
        }
      }

      if (lastStepIndex < 0) {
        sendResponse({ ok: true, discarded: false });
        return;
      }

      const removed = store.steps.splice(lastStepIndex, 1)[0];
      const remaining = store.steps.filter((x) => x.sessionId === sessionId);
      const lastRemaining = remaining[remaining.length - 1] ?? null;
      session.stepsCount = remaining.length;
      session.updatedAt = lastRemaining?.at ?? session.startedAt;
      session.lastUrl = lastRemaining?.url ?? session.startUrl;
      session.lastTitle = lastRemaining?.pageTitle ?? session.startTitle;
      markSessionSyncStatus(session, { status: "local", errorCode: null });

      appendEventLog(store, {
        type: "DISCARD_LAST_STEP",
        tabId: session.tabId ?? null,
        sessionId,
        ts: nowTs()
      });
      await saveStore(store);

      sendResponse({ ok: true, discarded: true, removedStepId: removed?.id ?? null });
      return;
    }

    if (typeof tabId !== "number" || !store.captureState.isCapturing) {
      sendResponse({ ok: true, ignored: true });
      return;
    }

    let sessionId = store.sessionByTab[String(tabId)];

    if (!sessionId && message.type === "CONTENT_SCRIPT_READY") {
      sessionId = makeId("sess");
      store.sessions.push(createSession(sessionId, tabId, message.payload));
      store.sessionByTab[String(tabId)] = sessionId;
    }

    if (!sessionId && message.type === "STEP_CAPTURED") {
      sessionId = makeId("sess");
      store.sessions.push(createSession(sessionId, tabId, message.payload));
      store.sessionByTab[String(tabId)] = sessionId;
    }

    if (message.type === "STEP_CAPTURED" && sessionId) {
      const session = sessionById(store.sessions, sessionId);
      const step = {
        id: makeId("step"),
        sessionId,
        stepIndex: (session?.stepsCount ?? 0) + 1,
        type: message.payload?.kind ?? "unknown",
        url: message.payload?.href ?? "",
        pageTitle: message.payload?.title ?? "",
        at: message.payload?.ts ?? nowTs(),
        key: message.payload?.key ?? null,
        modifiers: message.payload?.modifiers ?? null,
        value: message.payload?.value ?? null,
        inputType: message.payload?.inputType ?? null,
        optionValue: message.payload?.optionValue ?? null,
        optionText: message.payload?.optionText ?? null,
        checked: typeof message.payload?.checked === "boolean" ? message.payload.checked : null,
        scrollX: Number.isFinite(message.payload?.scrollX) ? message.payload.scrollX : null,
        scrollY: Number.isFinite(message.payload?.scrollY) ? message.payload.scrollY : null,
        navigationKind: message.payload?.navigationKind ?? null,
        fromHref: message.payload?.fromHref ?? null,
        target: message.payload?.target ?? null,
        selectors: message.payload?.selectors ?? null,
        thumbnailDataUrl: null,
        annotations: []
      };

      const latestSessionStep = findLatestSessionStep(store.steps, sessionId);
      const isDuplicate =
        latestSessionStep &&
        buildStepSignature(latestSessionStep) === buildStepSignature(step) &&
        step.at - (latestSessionStep.at ?? 0) <= 800;

      if (!isDuplicate) {
        step.thumbnailDataUrl = await maybeCaptureThumbnail(sender, step.type);
        store.steps.push(step);
      }

      if (session && !isDuplicate) {
        session.stepsCount += 1;
        session.updatedAt = step.at;
        session.lastUrl = step.url || session.lastUrl;
        session.lastTitle = step.pageTitle || session.lastTitle;
        markSessionSyncStatus(session, {
          status: store.syncConfig.enabled ? "pending" : "local",
          errorCode: null
        });
      }
    }

    appendEventLog(store, { type: message.type, tabId, ts: nowTs() });
    await saveStore(store);
    sendResponse({ ok: true, sessionId: sessionId ?? null, schemaVersion: APP_SCHEMA_VERSION });
  })().catch((error) => sendResponse({ ok: false, error: String(error) }));

  return true;
});
