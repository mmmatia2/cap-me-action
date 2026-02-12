// Purpose: normalize extension events into Session/Step records persisted in chrome.storage.local.
// Inputs: CONTENT_SCRIPT_READY and STEP_CAPTURED runtime messages. Outputs: sessions, steps, sessionByTab, eventLog.
function makeId(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const tabId = sender.tab?.id;
  if (!message?.type || typeof tabId !== "number") {
    return;
  }

  chrome.storage.local.get(["sessions", "steps", "sessionByTab", "eventLog"], (result) => {
    const sessions = result.sessions ?? [];
    const steps = result.steps ?? [];
    const sessionByTab = result.sessionByTab ?? {};
    const eventLog = result.eventLog ?? [];

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

    if (message.type === "STEP_CAPTURED" && sessionId) {
      const step = {
        id: makeId("step"),
        sessionId,
        type: message.payload?.kind ?? "unknown",
        url: message.payload?.href ?? "",
        at: message.payload?.ts ?? Date.now(),
        target: message.payload?.target ?? {}
      };
      steps.push(step);

      const session = sessions.find((x) => x.id === sessionId);
      if (session) {
        session.stepsCount += 1;
        session.updatedAt = step.at;
      }
    }

    eventLog.push({ type: message.type, tabId, ts: Date.now() });

    chrome.storage.local.set(
      {
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
