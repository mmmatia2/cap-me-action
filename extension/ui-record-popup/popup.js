// Purpose: wire popup controls to capture/runtime contracts and quick handoff actions.
// Inputs: popup clicks + chrome.storage state. Outputs: capture toggle, recent list, open-editor/download actions.
const APP_SCHEMA_VERSION = "1.1.0";

const captureToggle = document.getElementById("captureToggle");
const captureToggleLabel = document.getElementById("captureToggleLabel");
const captureStatus = document.getElementById("captureStatus");
const recentCaptureList = document.getElementById("recentCaptureList");
const openInspector = document.getElementById("openInspector");
const openInspectorFooter = document.getElementById("openInspectorFooter");
const openEditor = document.getElementById("openEditor");
const downloadLastJson = document.getElementById("downloadLastJson");

function getStorage(keys) {
  return new Promise((resolve) => chrome.storage.local.get(keys, resolve));
}

function sendRuntimeMessage(message) {
  return new Promise((resolve) => chrome.runtime.sendMessage(message, resolve));
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;");
}

function formatRelativeTime(ts) {
  if (!ts) {
    return "Unknown";
  }
  const diffMs = Math.max(0, Date.now() - ts);
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) {
    return "Just now";
  }
  if (minutes < 60) {
    return `${minutes}m ago`;
  }
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `${hours}h ago`;
  }
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function getLatestSession(sessions) {
  if (!sessions.length) {
    return null;
  }
  return [...sessions].sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0))[0] ?? null;
}

function getLatestStepBySession(steps) {
  const map = {};
  for (const step of steps) {
    if (!step?.sessionId) {
      continue;
    }
    const existing = map[step.sessionId];
    if (!existing || (step.at ?? 0) > (existing.at ?? 0)) {
      map[step.sessionId] = step;
    }
  }
  return map;
}

function getSessionSteps(allSteps, sessionId) {
  return allSteps
    .filter((x) => x.sessionId === sessionId)
    .sort((a, b) => (a.stepIndex ?? 0) - (b.stepIndex ?? 0) || (a.at ?? 0) - (b.at ?? 0));
}

function buildSessionExport(session, steps) {
  return {
    schemaVersion: APP_SCHEMA_VERSION,
    exportedAt: Date.now(),
    session,
    steps,
    meta: {
      capturedBy: "unknown",
      appVersion: chrome.runtime.getManifest().version,
      syncRevision: Number(session?.sync?.revision ?? 1)
    }
  };
}

function downloadJson(filename, payload) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

async function openEditorForSession(sessionId) {
  const response = await sendRuntimeMessage({
    type: "OPEN_EDITOR",
    payload: { source: "local", sessionId }
  });
  if (!response?.ok) {
    throw new Error(response?.error || "OPEN_EDITOR_FAILED");
  }
}

function renderRecentSessions(sessions, latestStepBySession) {
  const topSessions = [...sessions].sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0)).slice(0, 3);
  if (topSessions.length === 0) {
    recentCaptureList.innerHTML = '<p class="empty">No sessions yet. Start capture and interact with a page. Hotkeys: Alt+Shift+R/Z/M.</p>';
    return;
  }

  recentCaptureList.innerHTML = topSessions
    .map((session) => {
      const title = escapeHtml(session.lastTitle || session.startTitle || session.lastUrl || "Untitled session");
      const when = formatRelativeTime(session.updatedAt ?? session.startedAt);
      const latestStep = latestStepBySession[session.id];
      const thumbStyle = latestStep?.thumbnailDataUrl
        ? ` style="background-image:url('${escapeHtml(latestStep.thumbnailDataUrl)}')"`
        : "";
      const syncState = session.sync?.status ? ` | sync: ${escapeHtml(session.sync.status)}` : "";
      return `<article class="recent-item" data-session-id="${escapeHtml(session.id)}" role="button" tabindex="0">
        <div class="recent-thumb"${thumbStyle}></div>
        <div>
          <p class="recent-title">${title}</p>
          <p class="recent-meta">${session.stepsCount || 0} steps - ${escapeHtml(when)}${syncState}</p>
        </div>
      </article>`;
    })
    .join("");
}

async function refreshState() {
  const store = await getStorage(["captureState", "sessions", "steps"]);
  const captureState = store.captureState ?? { isCapturing: false };
  const sessions = store.sessions ?? [];
  const latestStepBySession = getLatestStepBySession(store.steps ?? []);
  const isCapturing = Boolean(captureState.isCapturing);

  captureToggleLabel.textContent = isCapturing ? "Stop Capture" : "Start Capture";
  captureStatus.textContent = isCapturing
    ? "Capturing now. Actions are being recorded. Hotkey: Alt+Shift+R"
    : "Paused. No active capture. Hotkeys: Alt+Shift+R (toggle), Alt+Shift+Z (discard), Alt+Shift+M (dock).";
  renderRecentSessions(sessions, latestStepBySession);
}

async function toggleCapture() {
  const store = await getStorage(["captureState"]);
  const isCapturing = Boolean(store.captureState?.isCapturing);
  const type = isCapturing ? "STOP_CAPTURE" : "START_CAPTURE";
  await sendRuntimeMessage({ type });
  await refreshState();
}

function openInspectorPage() {
  chrome.tabs.create({ url: chrome.runtime.getURL("inspector.html") });
}

async function handleOpenEditor() {
  const store = await getStorage(["sessions"]);
  const sessions = store.sessions ?? [];
  const latest = getLatestSession(sessions);
  if (!latest) {
    captureStatus.textContent = "No captured session yet. Start capture first.";
    return;
  }
  await openEditorForSession(latest.id);
}

async function handleDownloadLatestJson() {
  const store = await getStorage(["sessions", "steps"]);
  const sessions = store.sessions ?? [];
  const steps = store.steps ?? [];
  const latest = getLatestSession(sessions);
  if (!latest) {
    captureStatus.textContent = "No captured session available to download.";
    return;
  }

  const sessionSteps = getSessionSteps(steps, latest.id);
  downloadJson(`cap-me-session-${latest.id}.json`, buildSessionExport(latest, sessionSteps));
  captureStatus.textContent = "Downloaded latest session JSON.";
}

async function handleRecentSessionOpen(sessionId) {
  await openEditorForSession(sessionId);
}

captureToggle.addEventListener("click", () => {
  toggleCapture().catch(() => {
    captureStatus.textContent = "Failed to toggle capture mode.";
  });
});
openInspector.addEventListener("click", openInspectorPage);
openInspectorFooter.addEventListener("click", openInspectorPage);
openEditor.addEventListener("click", () => {
  handleOpenEditor().catch(() => {
    captureStatus.textContent = "Unable to open editor.";
  });
});
downloadLastJson.addEventListener("click", () => {
  handleDownloadLatestJson().catch(() => {
    captureStatus.textContent = "Unable to download latest session.";
  });
});
recentCaptureList.addEventListener("click", (event) => {
  const card = event.target.closest("[data-session-id]");
  if (!card) {
    return;
  }
  const sessionId = card.getAttribute("data-session-id");
  if (sessionId) {
    void handleRecentSessionOpen(sessionId);
  }
});
recentCaptureList.addEventListener("keydown", (event) => {
  if (event.key !== "Enter" && event.key !== " ") {
    return;
  }
  const card = event.target.closest("[data-session-id]");
  if (!card) {
    return;
  }
  event.preventDefault();
  const sessionId = card.getAttribute("data-session-id");
  if (sessionId) {
    void handleRecentSessionOpen(sessionId);
  }
});

refreshState();
