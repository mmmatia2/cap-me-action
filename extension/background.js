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
  return {
    id: sessionId,
    tabId,
    startUrl: payload?.href ?? "",
    startTitle: payload?.title ?? "",
    lastUrl: payload?.href ?? "",
    lastTitle: payload?.title ?? "",
    startedAt: payload?.ts ?? Date.now(),
    updatedAt: payload?.ts ?? Date.now(),
    stepsCount: 0
  };
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

    if (message.type === "START_CAPTURE") {
      const nextCaptureState = { isCapturing: true, startedAt: Date.now() };
      chrome.storage.local.set({ captureState: nextCaptureState }, () =>
        sendResponse({ ok: true, captureState: nextCaptureState })
      );
      return;
    }

    if (message.type === "STOP_CAPTURE") {
      const nextCaptureState = { isCapturing: false, startedAt: captureState.startedAt };
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
      sessions.push(createSession(sessionId, tabId, message.payload));
      sessionByTab[String(tabId)] = sessionId;
    }

    if (!sessionId && message.type === "STEP_CAPTURED") {
      sessionId = makeId("sess");
      sessions.push(createSession(sessionId, tabId, message.payload));
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
        pageTitle: message.payload?.title ?? "",
        at: message.payload?.ts ?? Date.now(),
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
        selectors: message.payload?.selectors ?? null
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
        session.lastUrl = step.url || session.lastUrl;
        session.lastTitle = step.pageTitle || session.lastTitle;
      }
    }

    eventLog.push({ type: message.type, tabId, ts: Date.now() });

    chrome.storage.local.set(
      {
        captureState,
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
