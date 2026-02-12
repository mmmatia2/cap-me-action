// Purpose: render persisted capture state inside extension UI.
// Inputs: chrome.storage.local keys (sessions, steps). Outputs: popup DOM showing latest session and recent steps.
function renderJson(elementId, value) {
  document.getElementById(elementId).textContent = value ? JSON.stringify(value, null, 2) : "None";
}

function refreshCaptureState() {
  chrome.storage.local.get(["sessions", "steps"], (result) => {
    const sessions = result.sessions ?? [];
    const allSteps = result.steps ?? [];
    const latestSession = sessions[sessions.length - 1] ?? null;
    const sessionSteps = latestSession
      ? allSteps.filter((x) => x.sessionId === latestSession.id).slice(-10)
      : [];

    document.getElementById("status").textContent = latestSession
      ? "Capture state loaded."
      : "No session found yet.";
    renderJson("session", latestSession);
    renderJson("steps", sessionSteps.length > 0 ? sessionSteps : null);
  });
}

document.getElementById("refresh").addEventListener("click", refreshCaptureState);
refreshCaptureState();
