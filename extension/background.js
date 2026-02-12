// Purpose: normalize extension events into Session/Step records persisted in chrome.storage.local.
// Inputs: START_CAPTURE/STOP_CAPTURE and capture runtime messages. Outputs: captureState, sessions, steps, sessionByTab, eventLog.
function makeId(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function buildStepSignature(step) {
  const t = step.target ?? {};
  const m = step.modifiers ?? {};
  return [
    step.type,
    step.url,
    t.tag ?? "",
    t.id ?? "",
    step.key ?? "",
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

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const tabId = sender.tab?.id;
  if (!message?.type) {
    return;
  }

  chrome.storage.local.get(["captureState", "sessions", "steps", "sessionByTab", "eventLog"], (result) => {
    const captureState = result.captureState ?? { isCapturing: false, startedAt: null };
    const sessions = result.sessions ?? [];
    const steps = result.steps ?? [];
    const sessionByTab = result.sessionByTab ?? {};
    const eventLog = result.eventLog ?? [];
    let nextCaptureState = captureState;

    if (message.type === "START_CAPTURE") {
      nextCaptureState = { isCapturing: true, startedAt: Date.now() };
      chrome.storage.local.set({ captureState: nextCaptureState }, () =>
        sendResponse({ ok: true, captureState: nextCaptureState })
      );
      return;
    }

    if (message.type === "STOP_CAPTURE") {
      nextCaptureState = { isCapturing: false, startedAt: captureState.startedAt };
      chrome.storage.local.set({ captureState: nextCaptureState }, () =>
        sendResponse({ ok: true, captureState: nextCaptureState })
      );
      return;
    }

    if (typeof tabId !== "number" || !captureState.isCapturing) {
      sendResponse({ ok: true, ignored: true });
      return;
    }

    let sessionId = sessionByTab[String(tabId)];
    if (!sessionId && message.type === "CONTENT_SCRIPT_READY") {
      sessionId = makeId("sess");
      sessions.push({
        id: sessionId,
        tabId,
        startUrl: message.payload?.href ?? "",
        startedAt: message.payload?.ts ?? Date.now(),
        updatedAt: message.payload?.ts ?? Date.now(),
        stepsCount: 0
      });
      sessionByTab[String(tabId)] = sessionId;
    }

    if (!sessionId && message.type === "STEP_CAPTURED") {
      sessionId = makeId("sess");
      sessions.push({
        id: sessionId,
        tabId,
        startUrl: message.payload?.href ?? "",
        startedAt: message.payload?.ts ?? Date.now(),
        updatedAt: message.payload?.ts ?? Date.now(),
        stepsCount: 0
      });
      sessionByTab[String(tabId)] = sessionId;
    }

    if (message.type === "STEP_CAPTURED" && sessionId) {
      const session = sessions.find((x) => x.id === sessionId) ?? null;
      const step = {
        id: makeId("step"),
        sessionId,
        stepIndex: (session?.stepsCount ?? 0) + 1,
        type: message.payload?.kind ?? "unknown",
        url: message.payload?.href ?? "",
        at: message.payload?.ts ?? Date.now(),
        key: message.payload?.key ?? null,
        modifiers: message.payload?.modifiers ?? null,
        target: message.payload?.target ?? {}
      };

      const latestSessionStep = findLatestSessionStep(steps, sessionId);
      const isDuplicate =
        latestSessionStep &&
        buildStepSignature(latestSessionStep) === buildStepSignature(step) &&
        step.at - (latestSessionStep.at ?? 0) <= 800;

      if (!isDuplicate) {
        steps.push(step);
      }

      if (session && !isDuplicate) {
        session.stepsCount += 1;
        session.updatedAt = step.at;
      }
    }

    eventLog.push({ type: message.type, tabId, ts: Date.now() });

    chrome.storage.local.set(
      {
        captureState: nextCaptureState,
        sessions: sessions.slice(-20),
        steps: steps.slice(-500),
        sessionByTab,
        eventLog: eventLog.slice(-100)
      },
      () => sendResponse({ ok: true, sessionId: sessionId ?? null })
    );
  });

  return true;
});
