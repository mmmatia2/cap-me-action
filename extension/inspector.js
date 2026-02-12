// Purpose: render persisted capture state inside extension UI.
// Inputs: popup button events + chrome.storage.local keys. Outputs: capture controls, selected session view, and JSON export.
let selectedSessionId = null;

function renderJson(elementId, value) {
  document.getElementById(elementId).textContent = value ? JSON.stringify(value, null, 2) : "None";
}

// Purpose: choose the default session when no explicit selection is available.
// Inputs: persisted sessions list. Outputs: most recently updated session or null.
function getLatestSession(sessions) {
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
    option.textContent = `${session.id} (${session.stepsCount} steps, ${ts})`;
    select.appendChild(option);
  });

  const resolved = ordered.some((x) => x.id === nextSelectedId) ? nextSelectedId : ordered[0].id;
  select.value = resolved;
  return resolved;
}

function refreshCaptureState() {
  chrome.storage.local.get(["captureState", "sessions", "steps"], (result) => {
    const captureState = result.captureState ?? { isCapturing: false, startedAt: null };
    const sessions = result.sessions ?? [];
    const allSteps = result.steps ?? [];
    const fallback = getLatestSession(sessions);
    selectedSessionId = renderSessionOptions(sessions, selectedSessionId ?? fallback?.id ?? null);
    const selectedSession = selectedSessionId
      ? sessions.find((x) => x.id === selectedSessionId) ?? null
      : null;
    const sessionSteps = selectedSession ? getSessionSteps(allSteps, selectedSession.id).slice(-10) : [];

    document.getElementById("status").textContent = selectedSession
      ? captureState.isCapturing
        ? "Capturing. Selected session loaded."
        : "Not capturing. Selected session loaded."
      : captureState.isCapturing
        ? "Capturing. No session found yet."
        : "Not capturing. No session found yet.";
    renderJson("session", selectedSession);
    renderJson("steps", sessionSteps.length > 0 ? sessionSteps : null);
  });
}

function setCaptureMode(messageType) {
  chrome.runtime.sendMessage({ type: messageType }, () => refreshCaptureState());
}

function exportSelectedSessionJson() {
  chrome.storage.local.get(["sessions", "steps"], (result) => {
    const sessions = result.sessions ?? [];
    const allSteps = result.steps ?? [];
    const selectedSession = selectedSessionId
      ? sessions.find((x) => x.id === selectedSessionId) ?? null
      : getLatestSession(sessions);

    if (!selectedSession) {
      document.getElementById("status").textContent = "No selected session to export.";
      return;
    }

    const payload = {
      exportedAt: Date.now(),
      session: selectedSession,
      steps: getSessionSteps(allSteps, selectedSession.id)
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `cap-me-session-${selectedSession.id}.json`;
    a.click();
    URL.revokeObjectURL(url);
    document.getElementById("status").textContent = "Selected session exported to JSON.";
  });
}

// Purpose: clear one selected session and its related steps/tab mappings.
// Inputs: selectedSessionId + storage state. Outputs: updated sessions/steps/sessionByTab collections.
function clearSelectedSession() {
  chrome.storage.local.get(["sessions", "steps", "sessionByTab"], (result) => {
    const sessions = result.sessions ?? [];
    const steps = result.steps ?? [];
    const sessionByTab = result.sessionByTab ?? {};
    if (!selectedSessionId) {
      document.getElementById("status").textContent = "No selected session to clear.";
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
        document.getElementById("status").textContent = "Selected session cleared.";
        refreshCaptureState();
      }
    );
  });
}

function resetAllCaptureData() {
  chrome.storage.local.set(
    {
      captureState: { isCapturing: false, startedAt: null },
      sessions: [],
      steps: [],
      sessionByTab: {},
      eventLog: []
    },
    () => {
      selectedSessionId = null;
      document.getElementById("status").textContent = "All capture data reset.";
      refreshCaptureState();
    }
  );
}

document.getElementById("sessionSelect").addEventListener("change", (event) => {
  selectedSessionId = event.target.value || null;
  refreshCaptureState();
});
document.getElementById("startCapture").addEventListener("click", () => setCaptureMode("START_CAPTURE"));
document.getElementById("stopCapture").addEventListener("click", () => setCaptureMode("STOP_CAPTURE"));
document.getElementById("refresh").addEventListener("click", refreshCaptureState);
document.getElementById("exportJson").addEventListener("click", exportSelectedSessionJson);
document.getElementById("clearSelected").addEventListener("click", clearSelectedSession);
document.getElementById("resetAll").addEventListener("click", resetAllCaptureData);
refreshCaptureState();
