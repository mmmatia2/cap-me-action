// Purpose: render persisted capture state inside extension UI.
// Inputs: popup button events + chrome.storage.local keys. Outputs: capture controls and state view.
function renderJson(elementId, value) {
  document.getElementById(elementId).textContent = value ? JSON.stringify(value, null, 2) : "None";
}

function refreshCaptureState() {
  chrome.storage.local.get(["captureState", "sessions", "steps"], (result) => {
    const captureState = result.captureState ?? { isCapturing: false, startedAt: null };
    const sessions = result.sessions ?? [];
    const allSteps = result.steps ?? [];
    const latestSession =
      sessions.length > 0
        ? sessions.reduce((latest, current) =>
            (current.updatedAt ?? 0) > (latest.updatedAt ?? 0) ? current : latest
          )
        : null;
    const sessionSteps = latestSession
      ? allSteps.filter((x) => x.sessionId === latestSession.id).slice(-10)
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

document.getElementById("startCapture").addEventListener("click", () => setCaptureMode("START_CAPTURE"));
document.getElementById("stopCapture").addEventListener("click", () => setCaptureMode("STOP_CAPTURE"));
document.getElementById("refresh").addEventListener("click", refreshCaptureState);
refreshCaptureState();
