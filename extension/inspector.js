// Purpose: render persisted capture state inside extension UI.
// Inputs: popup button events + chrome.storage.local keys. Outputs: capture controls and state view.
function renderJson(elementId, value) {
  document.getElementById(elementId).textContent = value ? JSON.stringify(value, null, 2) : "None";
}

// Purpose: choose the active session for display/export.
// Inputs: persisted sessions list. Outputs: most recently updated session or null.
function getActiveSession(sessions) {
  if (!sessions.length) {
    return null;
  }

  return sessions.reduce((latest, current) =>
    (current.updatedAt ?? 0) > (latest.updatedAt ?? 0) ? current : latest
  );
}

function getSessionSteps(allSteps, sessionId) {
  return allSteps.filter((x) => x.sessionId === sessionId);
}

function refreshCaptureState() {
  chrome.storage.local.get(["captureState", "sessions", "steps"], (result) => {
    const captureState = result.captureState ?? { isCapturing: false, startedAt: null };
    const sessions = result.sessions ?? [];
    const allSteps = result.steps ?? [];
    const latestSession = getActiveSession(sessions);
    const sessionSteps = latestSession
      ? getSessionSteps(allSteps, latestSession.id).slice(-10)
      : [];

    document.getElementById("status").textContent = latestSession
      ? captureState.isCapturing
        ? "Capturing. Session/steps loaded."
        : "Not capturing. Last session loaded."
      : captureState.isCapturing
        ? "Capturing. No session found yet."
        : "Not capturing. No session found yet.";
    renderJson("session", latestSession);
    renderJson("steps", sessionSteps.length > 0 ? sessionSteps : null);
  });
}

function setCaptureMode(messageType) {
  chrome.runtime.sendMessage({ type: messageType }, () => refreshCaptureState());
}

function exportActiveSessionJson() {
  chrome.storage.local.get(["sessions", "steps"], (result) => {
    const sessions = result.sessions ?? [];
    const allSteps = result.steps ?? [];
    const activeSession = getActiveSession(sessions);
    if (!activeSession) {
      document.getElementById("status").textContent = "No active session to export.";
      return;
    }

    const payload = {
      exportedAt: Date.now(),
      session: activeSession,
      steps: getSessionSteps(allSteps, activeSession.id)
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `cap-me-session-${activeSession.id}.json`;
    a.click();
    URL.revokeObjectURL(url);
    document.getElementById("status").textContent = "Active session exported to JSON.";
  });
}

document.getElementById("startCapture").addEventListener("click", () => setCaptureMode("START_CAPTURE"));
document.getElementById("stopCapture").addEventListener("click", () => setCaptureMode("STOP_CAPTURE"));
document.getElementById("refresh").addEventListener("click", refreshCaptureState);
document.getElementById("exportJson").addEventListener("click", exportActiveSessionJson);
refreshCaptureState();
