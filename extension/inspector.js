// Purpose: render persisted capture/sync state inside extension inspector UI.
// Inputs: inspector button events + chrome.storage.local keys. Outputs: capture controls, session exports, and sync actions.
const APP_SCHEMA_VERSION = "1.1.0";
const HOSTED_EDITOR_URL = "https://cap-me-action.vercel.app";
const DEFAULT_SYNC_CONFIG = {
  enabled: false,
  autoUploadOnStop: false,
  endpointUrl: "",
  editorUrl: HOSTED_EDITOR_URL,
  allowedEmails: [],
  maskInputValues: true
};
let selectedSessionId = null;
let syncConfigDirty = false;
let localEditorProbe = { status: "unknown", url: "http://localhost:5173", checkedAt: null };
let localEditorProbeInFlight = false;
let authProbe = { status: "unknown", checkedAt: null, errorCode: null, accountEmail: null };
let authProbeInFlight = false;
let readinessContext = {
  syncConfig: { ...DEFAULT_SYNC_CONFIG },
  selectedSession: null,
  syncState: null
};

function renderJson(elementId, value) {
  document.getElementById(elementId).textContent = value ? JSON.stringify(value, null, 2) : "None";
}

function setStatusText(text) {
  const status = document.getElementById("status");
  if (status.firstChild && status.firstChild.nodeType === Node.TEXT_NODE) {
    status.firstChild.textContent = `${text} `;
    return;
  }
  status.prepend(document.createTextNode(`${text} `));
}

function setSyncStatusText(text) {
  const el = document.getElementById("syncStatus");
  el.textContent = text;
}

function setSyncConfigStatusText(text) {
  const el = document.getElementById("syncConfigStatus");
  if (el) {
    el.textContent = text;
  }
}

function setSyncAccountText(email) {
  const el = document.getElementById("syncAccountText");
  if (!el) {
    return;
  }
  el.textContent = email ? `Account: ${email}` : "Account: not connected";
}

function getLocalEditorReadyText(response) {
  if (response?.status === "healthy") {
    return `Local editor is healthy at ${response.url}.`;
  }
  if (response?.status === "reachable_unhealthy") {
    const suffix = response.httpStatus ? ` (HTTP ${response.httpStatus})` : "";
    return `Local editor responded but is not healthy at ${response.url}${suffix}.`;
  }
  if (response?.status === "timeout") {
    return "Local editor check timed out. Start or restart `pnpm dev:app`.";
  }
  return "Local editor is unreachable. Start `pnpm dev:app` and try again.";
}

function setReadinessText(elementId, text) {
  const el = document.getElementById(elementId);
  if (el) {
    el.textContent = text;
  }
}

function formatSyncTime(ts) {
  if (!Number.isFinite(ts) || ts <= 0) {
    return null;
  }
  return new Date(ts).toLocaleString();
}

function getReadinessLocalEditorText() {
  if (localEditorProbe.status === "healthy") {
    return `Local editor: ready (${localEditorProbe.url}).`;
  }
  if (localEditorProbe.status === "reachable_unhealthy") {
    const suffix = localEditorProbe.httpStatus ? ` HTTP ${localEditorProbe.httpStatus}.` : ".";
    return `Local editor: reachable but unhealthy.${suffix} Start/restart app and verify it serves the editor.`;
  }
  if (localEditorProbe.status === "timeout") {
    return "Local editor: timeout. Start/restart `pnpm dev:app`, then check again.";
  }
  if (localEditorProbe.status === "unreachable") {
    return "Local editor: unreachable. Start `pnpm dev:app` before opening in editor.";
  }
  return "Local editor: not checked yet.";
}

function getReadinessEndpointText(syncConfig) {
  if (!syncConfig.enabled) {
    return "Endpoint: not required while team sync is disabled.";
  }
  if (!syncConfig.endpointUrl) {
    return "Endpoint: missing. Add Apps Script endpoint URL in Sync Settings.";
  }
  return `Endpoint: configured (${syncConfig.endpointUrl}).`;
}

function getReadinessAuthText(syncConfig) {
  if (authProbe.status === "token_available") {
    const email = authProbe.accountEmail || syncConfig.accountEmail;
    return email ? `Auth: token available for ${email}.` : "Auth: token available.";
  }

  if (authProbe.status === "token_unavailable") {
    if (authProbe.errorCode === "AUTH_REQUIRED") {
      return "Auth: signed out or token unavailable. Use Sign In before team sync.";
    }
    if (!syncConfig.enabled) {
      return "Auth: token unavailable (team sync disabled).";
    }
    return "Auth: token unavailable. Use Sign In before team sync.";
  }

  if (authProbe.status === "auth_check_failed") {
    const suffix = authProbe.errorCode ? ` (${authProbe.errorCode})` : "";
    return `Auth: check failed${suffix}. Verify extension identity/permissions.`;
  }

  return "Auth: checking token availability...";
}

function getReadinessSyncText(syncConfig, selectedSession, syncState) {
  if (!selectedSession) {
    if (!syncConfig.enabled) {
      return "Sync: disabled (local-only mode).";
    }
    if (syncState?.lastErrorCode) {
      return `Sync: last known background error ${syncState.lastErrorCode}.`;
    }
    return "Sync: no selected session. Capture or select one to inspect sync status.";
  }

  const sessionSync = selectedSession.sync ?? {};
  const status = sessionSync.status ?? "local";

  if (sessionSync.errorCode) {
    return `Sync: selected session error ${sessionSync.errorCode}. Check endpoint/auth and retry.`;
  }

  if (status === "synced") {
    const syncedAt = formatSyncTime(sessionSync.lastSyncedAt);
    return syncedAt
      ? `Sync: selected session synced at ${syncedAt}.`
      : "Sync: selected session marked synced.";
  }

  if (status === "pending") {
    return "Sync: selected session pending upload/retry.";
  }

  if (status === "failed") {
    if (syncState?.lastErrorCode) {
      return `Sync: selected session failed. Last background error ${syncState.lastErrorCode}.`;
    }
    return "Sync: selected session failed. Retry sync after checking settings.";
  }

  if (status === "blocked") {
    return "Sync: selected session blocked by current sync settings.";
  }

  if (!syncConfig.enabled) {
    return "Sync: local-only session (team sync disabled).";
  }

  if (!syncConfig.endpointUrl) {
    return "Sync: endpoint missing. Configure endpoint to enable upload.";
  }

  if (syncState?.lastErrorCode) {
    return `Sync: last known background error ${syncState.lastErrorCode}.`;
  }

  return "Sync: local/not uploaded yet.";
}

function explainSyncErrorCode(errorCode) {
  switch (String(errorCode ?? "").trim()) {
    case "SYNC_DISABLED":
      return "enable team sync in Sync Settings";
    case "SYNC_ENDPOINT_MISSING":
      return "set endpoint URL in Sync Settings";
    case "AUTH_REQUIRED":
      return "sign in from inspector";
    case "AUTH_DENIED":
      return "confirm allowed account/email and sign in again";
    case "TOKEN_EXPIRED":
      return "sign out and sign in again";
    case "NETWORK_ERROR":
      return "verify endpoint URL and network reachability";
    case "QUOTA_EXCEEDED":
      return "check Apps Script/Drive quota and retry later";
    default:
      return "check endpoint/auth settings and retry";
  }
}

function getManualSyncStatusText(response) {
  const sync = response?.sync ?? null;
  const queueItem = response?.queueItem ?? null;
  const syncStateError = response?.syncState?.lastErrorCode ?? null;
  const errorCode = sync?.errorCode ?? queueItem?.lastErrorCode ?? syncStateError ?? response?.error ?? null;
  const status = sync?.status ?? null;

  if (status === "synced") {
    return "Session sync succeeded.";
  }
  if (status === "pending") {
    if (errorCode) {
      return `Session sync pending retry (${errorCode}): ${explainSyncErrorCode(errorCode)}.`;
    }
    return "Session sync queued and pending upload.";
  }
  if (status === "failed" || status === "blocked") {
    const code = errorCode || "UNKNOWN_ERROR";
    return `Session sync ${status}: ${code}. Next step: ${explainSyncErrorCode(code)}.`;
  }
  if (errorCode) {
    return `Session sync did not complete: ${errorCode}. Next step: ${explainSyncErrorCode(errorCode)}.`;
  }
  return "Session sync request sent; refresh to confirm status.";
}

function renderReadinessSummary() {
  const syncConfig = normalizeSyncConfig(readinessContext.syncConfig);
  setReadinessText("readinessLocalEditor", getReadinessLocalEditorText());
  setReadinessText("readinessEndpoint", getReadinessEndpointText(syncConfig));
  setReadinessText("readinessAuth", getReadinessAuthText(syncConfig));
  setReadinessText(
    "readinessSync",
    getReadinessSyncText(syncConfig, readinessContext.selectedSession, readinessContext.syncState)
  );
}

function probeLocalEditorReadiness(options = {}) {
  const now = Date.now();
  if (localEditorProbeInFlight) {
    return;
  }
  if (!options.force && localEditorProbe.checkedAt && now - localEditorProbe.checkedAt < 2000) {
    return;
  }

  localEditorProbeInFlight = true;
  chrome.runtime.sendMessage({ type: "CHECK_LOCAL_EDITOR_READY" }, (response) => {
    localEditorProbeInFlight = false;
    localEditorProbe = {
      status: response?.status ?? "unreachable",
      url: response?.url ?? localEditorProbe.url,
      httpStatus: response?.httpStatus ?? null,
      checkedAt: Date.now()
    };
    renderReadinessSummary();
    if (options.announce) {
      setStatusText(getLocalEditorReadyText(response));
    }
  });
}

function probeAuthReadiness(options = {}) {
  const now = Date.now();
  if (authProbeInFlight) {
    return;
  }
  if (!options.force && authProbe.checkedAt && now - authProbe.checkedAt < 2000) {
    return;
  }

  authProbeInFlight = true;
  chrome.runtime.sendMessage({ type: "CHECK_SYNC_AUTH_READY" }, (response) => {
    authProbeInFlight = false;

    if (response?.status === "token_available") {
      authProbe = {
        status: "token_available",
        accountEmail: response?.accountEmail ?? null,
        errorCode: null,
        checkedAt: Date.now()
      };
    } else if (response?.status === "token_unavailable") {
      authProbe = {
        status: "token_unavailable",
        accountEmail: null,
        errorCode: response?.errorCode ?? null,
        checkedAt: Date.now()
      };
    } else {
      authProbe = {
        status: "auth_check_failed",
        accountEmail: null,
        errorCode: response?.errorCode ?? "AUTH_CHECK_FAILED",
        checkedAt: Date.now()
      };
    }

    renderReadinessSummary();
  });
}

function normalizeSyncConfig(value) {
  const allowedRaw = Array.isArray(value?.allowedEmails) ? value.allowedEmails : [];
  return {
    ...DEFAULT_SYNC_CONFIG,
    ...(value ?? {}),
    endpointUrl: String(value?.endpointUrl ?? DEFAULT_SYNC_CONFIG.endpointUrl).trim(),
    editorUrl: String(value?.editorUrl ?? DEFAULT_SYNC_CONFIG.editorUrl).trim() || DEFAULT_SYNC_CONFIG.editorUrl,
    allowedEmails: allowedRaw.map((x) => String(x).trim().toLowerCase()).filter(Boolean),
    enabled: Boolean(value?.enabled),
    autoUploadOnStop: Boolean(value?.autoUploadOnStop),
    maskInputValues:
      typeof value?.maskInputValues === "boolean"
        ? value.maskInputValues
        : DEFAULT_SYNC_CONFIG.maskInputValues
  };
}

function parseAllowedEmails(value) {
  return String(value ?? "")
    .split(",")
    .map((x) => x.trim().toLowerCase())
    .filter(Boolean);
}

function renderSyncConfigForm(syncConfig) {
  if (syncConfigDirty) {
    return;
  }

  const normalized = normalizeSyncConfig(syncConfig);
  document.getElementById("syncEnabled").checked = Boolean(normalized.enabled);
  document.getElementById("syncEndpointUrl").value = normalized.endpointUrl;
  document.getElementById("syncEditorUrl").value = normalized.editorUrl;
  document.getElementById("syncAutoUploadOnStop").checked = Boolean(normalized.autoUploadOnStop);
  document.getElementById("syncMaskInputValues").checked = Boolean(normalized.maskInputValues);
  document.getElementById("syncAllowedEmails").value = normalized.allowedEmails.join(", ");
}

function readSyncConfigForm() {
  return {
    enabled: Boolean(document.getElementById("syncEnabled").checked),
    endpointUrl: String(document.getElementById("syncEndpointUrl").value || "").trim(),
    editorUrl: String(document.getElementById("syncEditorUrl").value || "").trim(),
    autoUploadOnStop: Boolean(document.getElementById("syncAutoUploadOnStop").checked),
    maskInputValues: Boolean(document.getElementById("syncMaskInputValues").checked),
    allowedEmails: parseAllowedEmails(document.getElementById("syncAllowedEmails").value)
  };
}

function validateSyncConfig(syncConfig) {
  if (!syncConfig.enabled) {
    return null;
  }

  if (!syncConfig.endpointUrl) {
    return "Sync endpoint URL is required when sync is enabled.";
  }

  let parsed;
  try {
    parsed = new URL(syncConfig.endpointUrl);
  } catch {
    return "Sync endpoint URL is invalid.";
  }

  if (parsed.protocol !== "https:") {
    return "Sync endpoint URL must use https.";
  }

  if (syncConfig.editorUrl) {
    let editorParsed;
    try {
      editorParsed = new URL(syncConfig.editorUrl);
    } catch {
      return "Editor URL is invalid.";
    }

    const isHttps = editorParsed.protocol === "https:";
    const isLocalhost =
      editorParsed.protocol === "http:" &&
      (editorParsed.hostname === "localhost" || editorParsed.hostname === "127.0.0.1");
    if (!isHttps && !isLocalhost) {
      return "Editor URL must use https, or http://localhost for local development.";
    }
  }

  const invalidEmail = syncConfig.allowedEmails.find((email) => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email));
  if (invalidEmail) {
    return `Invalid allowed email: ${invalidEmail}`;
  }

  return null;
}

function setCaptureBadge(isCapturing) {
  const badge = document.getElementById("captureBadge");
  badge.className = `capture-badge ${isCapturing ? "capturing" : "paused"}`;
  badge.textContent = isCapturing ? "CAPTURING" : "PAUSED";
}

function formatTargetRef(step) {
  const target = step.target ?? {};
  const tag = target.tag ?? "unknown";
  const id = target.id ? `#${target.id}` : "";
  const name = target.name ? `[name=${target.name}]` : "";
  return `${tag}${id}${name}`;
}

function formatStep(step) {
  if (!step) {
    return "";
  }

  const label = (step.type ?? "unknown").toUpperCase();
  const indexPrefix = typeof step.stepIndex === "number" ? `#${step.stepIndex} ` : "";
  const targetRef = formatTargetRef(step);

  if (step.type === "key") {
    const mods = step.modifiers ?? {};
    const modText = ["ctrl", "meta", "alt", "shift"].filter((k) => mods[k]).join("+");
    const keyText = step.key ?? "";
    return `${indexPrefix}[${label}] ${modText ? `${modText}+` : ""}${keyText} on ${targetRef}`.trim();
  }
  if (step.type === "input") {
    return `${indexPrefix}[${label}] ${targetRef} = "${step.value ?? ""}"`;
  }
  if (step.type === "select") {
    const optionText = step.optionText || step.optionValue || "";
    return `${indexPrefix}[${label}] ${targetRef} -> ${optionText}`.trim();
  }
  if (step.type === "toggle") {
    return `${indexPrefix}[${label}] ${targetRef} = ${step.checked ? "checked" : "unchecked"}`;
  }
  if (step.type === "navigate") {
    const title = step.pageTitle ? ` ${step.pageTitle}` : "";
    return `${indexPrefix}[${label}]${title} (${step.url ?? ""})`.trim();
  }
  if (step.type === "scroll") {
    return `${indexPrefix}[${label}] x:${step.scrollX ?? 0} y:${step.scrollY ?? 0}`;
  }
  return `${indexPrefix}[${label}] ${targetRef}`;
}

function renderStepPreview(steps) {
  const counts = {};
  steps.forEach((step) => {
    const key = step.type || "other";
    counts[key] = (counts[key] ?? 0) + 1;
  });
  const summaryParts = Object.entries(counts)
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([type, count]) => `${type}: ${count}`);

  document.getElementById("stepSummary").textContent =
    steps.length > 0 ? `Step categories (${steps.length}): ${summaryParts.join(" | ")}` : "None";

  const lines = steps.map((step) => formatStep(step));
  document.getElementById("steps").textContent = lines.length > 0 ? lines.join("\n") : "None";
  renderThumbnails(steps);
}

function renderThumbnails(steps) {
  const container = document.getElementById("thumbnails");
  const withThumbs = steps.filter((step) => Boolean(step.thumbnailDataUrl)).slice(-6);
  if (withThumbs.length === 0) {
    container.className = "";
    container.textContent = "None";
    return;
  }

  container.className = "thumb-grid";
  container.innerHTML = "";
  withThumbs.forEach((step) => {
    const figure = document.createElement("figure");
    figure.className = "thumb-item";

    const img = document.createElement("img");
    img.src = step.thumbnailDataUrl;
    img.alt = `Step ${step.stepIndex ?? ""}`.trim();
    img.loading = "lazy";

    const caption = document.createElement("figcaption");
    caption.textContent = `#${step.stepIndex ?? "?"} ${(step.type ?? "step").toUpperCase()}`;

    figure.appendChild(img);
    figure.appendChild(caption);
    container.appendChild(figure);
  });
}

function getLatestSession(sessions) {
  if (!sessions.length) {
    return null;
  }
  return sessions.reduce((latest, current) =>
    (current.updatedAt ?? 0) > (latest.updatedAt ?? 0) ? current : latest
  );
}

function getSessionSteps(allSteps, sessionId) {
  return allSteps
    .filter((x) => x.sessionId === sessionId)
    .sort(
      (a, b) =>
        (a.stepIndex ?? Number.MAX_SAFE_INTEGER) - (b.stepIndex ?? Number.MAX_SAFE_INTEGER) ||
        (a.at ?? 0) - (b.at ?? 0)
    )
    .map((step, idx) => ({ ...step, stepIndex: step.stepIndex ?? idx + 1 }));
}

function renderSessionOptions(sessions, nextSelectedId) {
  const select = document.getElementById("sessionSelect");
  const ordered = [...sessions].sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0));
  select.innerHTML = "";

  if (!ordered.length) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = "No sessions";
    select.appendChild(option);
    select.value = "";
    return null;
  }

  ordered.forEach((session) => {
    const option = document.createElement("option");
    option.value = session.id;
    const ts = new Date(session.updatedAt ?? session.startedAt ?? Date.now()).toLocaleTimeString();
    const syncState = session.sync?.status ? ` | ${session.sync.status}` : "";
    option.textContent = `${session.id} (${session.stepsCount} steps, ${ts}${syncState})`;
    select.appendChild(option);
  });

  const resolved = ordered.some((x) => x.id === nextSelectedId) ? nextSelectedId : ordered[0].id;
  select.value = resolved;
  return resolved;
}

function buildSessionExport(selectedSession, selectedSteps) {
  return {
    schemaVersion: APP_SCHEMA_VERSION,
    exportedAt: Date.now(),
    session: selectedSession,
    steps: selectedSteps,
    meta: {
      capturedBy: "unknown",
      appVersion: chrome.runtime.getManifest().version,
      syncRevision: Number(selectedSession?.sync?.revision ?? 1)
    }
  };
}

function refreshCaptureState() {
  chrome.storage.local.get(["captureState", "sessions", "steps", "syncConfig", "syncState"], (result) => {
    const captureState = result.captureState ?? { isCapturing: false, startedAt: null };
    const sessions = result.sessions ?? [];
    const allSteps = result.steps ?? [];
    const syncConfig = normalizeSyncConfig(result.syncConfig);
    const fallback = getLatestSession(sessions);
    selectedSessionId = renderSessionOptions(sessions, selectedSessionId ?? fallback?.id ?? null);
    const selectedSession = selectedSessionId
      ? sessions.find((x) => x.id === selectedSessionId) ?? null
      : null;
    const sessionSteps = selectedSession ? getSessionSteps(allSteps, selectedSession.id).slice(-10) : [];

    setStatusText(
      selectedSession
        ? captureState.isCapturing
          ? "Capturing. Selected session loaded."
          : "Not capturing. Selected session loaded."
        : captureState.isCapturing
          ? "Capturing. No session found yet."
          : "Not capturing. No session found yet."
    );
    const syncLabel = selectedSession?.sync?.status ?? "local";
    const endpointReady = syncConfig.enabled && syncConfig.endpointUrl;
    setSyncStatusText(`Sync status: ${syncLabel}${endpointReady ? "" : " (endpoint disabled)"}`);
    renderSyncConfigForm(syncConfig);
    setSyncAccountText(syncConfig.accountEmail ?? null);
    readinessContext = {
      syncConfig,
      selectedSession,
      syncState: result.syncState ?? null
    };
    renderReadinessSummary();
    probeLocalEditorReadiness();
    probeAuthReadiness();
    setCaptureBadge(Boolean(captureState.isCapturing));
    renderJson("session", selectedSession);
    renderStepPreview(sessionSteps);
  });
}

function setCaptureMode(messageType) {
  chrome.runtime.sendMessage({ type: messageType }, () => refreshCaptureState());
}

function withSelectedSessionData(onResolved) {
  chrome.storage.local.get(["sessions", "steps"], (store) => {
    const sessions = store.sessions ?? [];
    const allSteps = store.steps ?? [];
    const selectedSession = selectedSessionId
      ? sessions.find((x) => x.id === selectedSessionId) ?? null
      : getLatestSession(sessions);
    const payload = selectedSession
      ? buildSessionExport(selectedSession, getSessionSteps(allSteps, selectedSession.id))
      : null;
    onResolved(payload);
  });
}

function exportSelectedSessionJson() {
  withSelectedSessionData((payload) => {
    if (!payload) {
      setStatusText("No selected session to export.");
      return;
    }

    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `cap-me-session-${payload.session.id}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setStatusText("Selected session exported to JSON.");
  });
}

function copySelectedSessionJson() {
  withSelectedSessionData(async (payload) => {
    if (!payload) {
      setStatusText("No selected session to copy.");
      return;
    }

    const text = JSON.stringify(payload, null, 2);
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        const textarea = document.createElement("textarea");
        textarea.value = text;
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand("copy");
        textarea.remove();
      }
      setStatusText("Selected session JSON copied to clipboard.");
    } catch {
      setStatusText("Clipboard copy failed.");
    }
  });
}

function toCompactSteps(steps) {
  return steps.map((step) => ({
    i: step.stepIndex ?? null,
    t: step.type ?? "unknown",
    u: step.url ?? "",
    ti: step.pageTitle ?? null,
    k: step.key ?? null,
    m: step.modifiers ?? null,
    v: step.value ?? null,
    ov: step.optionValue ?? null,
    ot: step.optionText ?? null,
    ch: step.checked ?? null,
    sx: step.scrollX ?? null,
    sy: step.scrollY ?? null,
    nk: step.navigationKind ?? null,
    g: step.target?.tag ?? null,
    id: step.target?.id ?? null,
    txt: step.target?.text ?? null,
    sel: step.selectors ?? null
  }));
}

function copyStepsOnly() {
  withSelectedSessionData(async (payload) => {
    if (!payload) {
      setStatusText("No selected session steps to copy.");
      return;
    }

    const text = JSON.stringify(toCompactSteps(payload.steps), null, 2);
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        const textarea = document.createElement("textarea");
        textarea.value = text;
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand("copy");
        textarea.remove();
      }
      setStatusText("Selected session steps copied.");
    } catch {
      setStatusText("Copy steps failed.");
    }
  });
}

function discardLastStep() {
  if (!selectedSessionId) {
    setStatusText("No selected session to discard from.");
    return;
  }
  chrome.runtime.sendMessage(
    { type: "DISCARD_LAST_STEP", payload: { sessionId: selectedSessionId } },
    (response) => {
      if (!response?.ok) {
        setStatusText("Discard last step failed.");
        return;
      }
      setStatusText(response.discarded ? "Last step discarded." : "No step to discard.");
      refreshCaptureState();
    }
  );
}

function clearSelectedSession() {
  chrome.storage.local.get(["sessions", "steps", "sessionByTab"], (result) => {
    const sessions = result.sessions ?? [];
    const steps = result.steps ?? [];
    const sessionByTab = result.sessionByTab ?? {};
    if (!selectedSessionId) {
      setStatusText("No selected session to clear.");
      return;
    }

    const nextSessions = sessions.filter((x) => x.id !== selectedSessionId);
    const nextSteps = steps.filter((x) => x.sessionId !== selectedSessionId);
    const nextSessionByTab = Object.fromEntries(
      Object.entries(sessionByTab).filter(([, value]) => value !== selectedSessionId)
    );

    chrome.storage.local.set(
      { sessions: nextSessions, steps: nextSteps, sessionByTab: nextSessionByTab },
      () => {
        selectedSessionId = null;
        setStatusText("Selected session cleared.");
        refreshCaptureState();
      }
    );
  });
}

function resetAllCaptureData() {
  chrome.storage.local.set(
    {
      storageVersion: 2,
      schemaVersion: APP_SCHEMA_VERSION,
      captureState: { isCapturing: false, startedAt: null },
      sessions: [],
      steps: [],
      sessionByTab: {},
      eventLog: [],
      syncQueue: [],
      syncState: { lastRunAt: null, successCount: 0, failureCount: 0, quotaWarning: false },
      teamLibraryCache: { items: [], updatedAt: null }
    },
    () => {
      selectedSessionId = null;
      setStatusText("All capture data reset.");
      refreshCaptureState();
    }
  );
}

function syncSelectedSession() {
  if (!selectedSessionId) {
    setStatusText("No selected session to sync.");
    return;
  }
  chrome.runtime.sendMessage(
    { type: "SYNC_SESSION_BY_ID", payload: { sessionId: selectedSessionId } },
    (response) => {
      if (!response?.ok) {
        const code = response?.error ?? "unknown error";
        setStatusText(`Sync enqueue failed: ${code}. Next step: ${explainSyncErrorCode(code)}.`);
        return;
      }
      setStatusText(getManualSyncStatusText(response));
      refreshCaptureState();
    }
  );
}

function openSelectedInEditor() {
  if (!selectedSessionId) {
    setStatusText("No selected session to open.");
    return;
  }
  chrome.runtime.sendMessage(
    { type: "OPEN_EDITOR", payload: { source: "capture", sessionId: selectedSessionId } },
    (response) => {
      if (!response?.ok) {
        setStatusText(`Open editor failed: ${response?.error ?? "unknown error"}. Start app with pnpm dev:app.`);
        return;
      }
      const openedLocal = typeof response.url === "string" && response.url.startsWith("http://localhost");
      setStatusText(openedLocal ? "Opened local editor for selected session." : "Opened editor for selected session.");
    }
  );
}

function checkLocalEditor() {
  setStatusText("Checking local editor...");
  probeLocalEditorReadiness({ force: true, announce: true });
}

function markSyncConfigDirty() {
  syncConfigDirty = true;
  setSyncConfigStatusText("Unsaved sync settings.");
}

function saveSyncConfig() {
  const draft = readSyncConfigForm();
  const validationError = validateSyncConfig(draft);
  if (validationError) {
    setSyncConfigStatusText(validationError);
    return;
  }

  chrome.storage.local.get(["syncConfig"], (result) => {
    const current = normalizeSyncConfig(result.syncConfig);
    const next = {
      ...current,
      ...draft,
      allowedEmails: draft.allowedEmails
    };

    chrome.storage.local.set({ syncConfig: next }, () => {
      if (chrome.runtime.lastError) {
        setSyncConfigStatusText(`Failed to save sync settings: ${chrome.runtime.lastError.message}`);
        return;
      }
      syncConfigDirty = false;
      setSyncConfigStatusText("Sync settings saved.");
      refreshCaptureState();
    });
  });
}

function signInForSync() {
  chrome.runtime.sendMessage({ type: "AUTH_SIGN_IN" }, (response) => {
    if (!response?.ok) {
      const detail = String(response?.error ?? "").trim();
      setSyncConfigStatusText(
        `Sign in failed: ${response?.errorCode ?? "unknown error"}${detail ? ` (${detail})` : ""}`
      );
      return;
    }
    const email = response.accountEmail ?? null;
    setSyncConfigStatusText(email ? `Signed in as ${email}.` : "Signed in.");
    setSyncAccountText(email);
    probeAuthReadiness({ force: true });
    refreshCaptureState();
  });
}

function signOutForSync() {
  chrome.runtime.sendMessage({ type: "AUTH_SIGN_OUT" }, (response) => {
    if (!response?.ok) {
      setSyncConfigStatusText(`Sign out failed: ${response?.errorCode ?? "unknown error"}`);
      return;
    }
    setSyncConfigStatusText("Signed out for team sync.");
    setSyncAccountText(null);
    probeAuthReadiness({ force: true });
    refreshCaptureState();
  });
}

document.getElementById("sessionSelect").addEventListener("change", (event) => {
  selectedSessionId = event.target.value || null;
  refreshCaptureState();
});
document.getElementById("startCapture").addEventListener("click", () => setCaptureMode("START_CAPTURE"));
document.getElementById("stopCapture").addEventListener("click", () => setCaptureMode("STOP_CAPTURE"));
document.getElementById("refresh").addEventListener("click", refreshCaptureState);
document.getElementById("checkLocalEditor").addEventListener("click", checkLocalEditor);
document.getElementById("syncSelected").addEventListener("click", syncSelectedSession);
document.getElementById("openEditor").addEventListener("click", openSelectedInEditor);
document.getElementById("exportJson").addEventListener("click", exportSelectedSessionJson);
document.getElementById("copyJson").addEventListener("click", copySelectedSessionJson);
document.getElementById("copyStepsOnly").addEventListener("click", copyStepsOnly);
document.getElementById("discardLast").addEventListener("click", discardLastStep);
document.getElementById("clearSelected").addEventListener("click", clearSelectedSession);
document.getElementById("resetAll").addEventListener("click", resetAllCaptureData);
document.getElementById("saveSyncConfig").addEventListener("click", saveSyncConfig);
document.getElementById("syncSignIn").addEventListener("click", signInForSync);
document.getElementById("syncSignOut").addEventListener("click", signOutForSync);
document.getElementById("syncEnabled").addEventListener("change", markSyncConfigDirty);
document.getElementById("syncEndpointUrl").addEventListener("input", markSyncConfigDirty);
document.getElementById("syncEditorUrl").addEventListener("input", markSyncConfigDirty);
document.getElementById("syncAutoUploadOnStop").addEventListener("change", markSyncConfigDirty);
document.getElementById("syncMaskInputValues").addEventListener("change", markSyncConfigDirty);
document.getElementById("syncAllowedEmails").addEventListener("input", markSyncConfigDirty);
refreshCaptureState();
