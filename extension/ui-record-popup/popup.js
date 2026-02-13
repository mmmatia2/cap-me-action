// Purpose: wire record popup controls to existing recorder contracts and storage.
// Inputs: popup clicks, chrome.runtime messages, chrome.storage.local session data.
// Outputs: capture toggle behavior and recent-session summaries in the popup.
const captureToggle = document.getElementById("captureToggle");
const captureToggleLabel = document.getElementById("captureToggleLabel");
const captureStatus = document.getElementById("captureStatus");
const recentCaptureList = document.getElementById("recentCaptureList");
const openInspector = document.getElementById("openInspector");
const openInspectorFooter = document.getElementById("openInspectorFooter");

function getStorage(keys) {
  return new Promise((resolve) => chrome.storage.local.get(keys, resolve));
}

function sendRuntimeMessage(message) {
  return new Promise((resolve) => chrome.runtime.sendMessage(message, resolve));
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

function renderRecentSessions(sessions) {
  const topSessions = [...sessions].sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0)).slice(0, 3);
  if (topSessions.length === 0) {
    recentCaptureList.innerHTML =
      '<div style="font-size:12px;color:#94a3b8;padding:10px;border:1px dashed #334155;border-radius:8px;">No sessions yet. Start capture and interact with a page.</div>';
    return;
  }

  recentCaptureList.innerHTML = topSessions
    .map((session) => {
      const title = session.lastTitle || session.startTitle || session.lastUrl || "Untitled session";
      const when = formatRelativeTime(session.updatedAt ?? session.startedAt);
      return `<div style="padding:10px;border:1px solid rgba(148,163,184,.25);border-radius:10px;">
        <div style="font-weight:600;font-size:12px;line-height:1.3;">${title}</div>
        <div style="font-size:11px;color:#94a3b8;margin-top:4px;">${session.stepsCount || 0} steps - ${when}</div>
      </div>`;
    })
    .join("");
}

async function refreshState() {
  const store = await getStorage(["captureState", "sessions"]);
  const captureState = store.captureState ?? { isCapturing: false };
  const sessions = store.sessions ?? [];
  const isCapturing = Boolean(captureState.isCapturing);

  captureToggleLabel.textContent = isCapturing ? "Stop Capture" : "Start Capture";
  captureStatus.textContent = isCapturing
    ? "Capturing now. Actions are being recorded."
    : "Paused. No active capture.";
  renderRecentSessions(sessions);
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

captureToggle.addEventListener("click", () => {
  toggleCapture().catch(() => {
    captureStatus.textContent = "Failed to toggle capture mode.";
  });
});
openInspector.addEventListener("click", openInspectorPage);
openInspectorFooter.addEventListener("click", openInspectorPage);
refreshState();

