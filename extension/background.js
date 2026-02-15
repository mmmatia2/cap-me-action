// Purpose: normalize extension events into Session/Step records persisted in chrome.storage.local.
// Inputs: START_CAPTURE/STOP_CAPTURE/DISCARD_LAST_STEP and capture runtime messages. Outputs: captureState, sessions, steps, sessionByTab, eventLog.
const lastThumbnailCaptureByTab = {};
// Purpose: keep thumbnails readable for editor annotation while staying within storage limits.
// Inputs: raw visible-tab image size. Outputs: adaptively compressed JPEG thumbnail data URLs.
const THUMBNAIL_CAPTURE_CONFIG = {
  maxWidth: 1280,
  maxHeight: 800,
  maxBytes: 220 * 1024,
  qualitySteps: [0.9, 0.84, 0.78, 0.72, 0.66, 0.58]
};

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

function shouldCaptureThumbnail(type) {
  return ["click", "input", "select", "toggle", "navigate"].includes(type);
}

function captureVisibleTab(windowId) {
  return new Promise((resolve) => {
    chrome.tabs.captureVisibleTab(windowId, { format: "png" }, (dataUrl) => {
      if (chrome.runtime.lastError || !dataUrl) {
        resolve(null);
        return;
      }
      resolve(dataUrl);
    });
  });
}

async function blobToBase64(blob) {
  const buffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  let binary = "";
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

async function compressThumbnail(dataUrl, options = THUMBNAIL_CAPTURE_CONFIG) {
  try {
    if (typeof OffscreenCanvas === "undefined" || typeof createImageBitmap !== "function") {
      return dataUrl;
    }

    const response = await fetch(dataUrl);
    const blob = await response.blob();
    const bitmap = await createImageBitmap(blob);
    try {
      const maxScaleByWidth = options.maxWidth / bitmap.width;
      const maxScaleByHeight = options.maxHeight / bitmap.height;
      const baseScale = Math.min(1, maxScaleByWidth, maxScaleByHeight);
      let width = Math.max(1, Math.round(bitmap.width * baseScale));
      let height = Math.max(1, Math.round(bitmap.height * baseScale));
      let fallbackBlob = null;

      for (let attempt = 0; attempt < 3; attempt += 1) {
        const canvas = new OffscreenCanvas(width, height);
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          return dataUrl;
        }

        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = "high";
        ctx.drawImage(bitmap, 0, 0, width, height);

        for (const quality of options.qualitySteps) {
          const candidateBlob = await canvas.convertToBlob({ type: "image/jpeg", quality });
          fallbackBlob = candidateBlob;
          if (candidateBlob.size <= options.maxBytes) {
            const base64 = await blobToBase64(candidateBlob);
            return `data:${candidateBlob.type};base64,${base64}`;
          }
        }

        if (width <= 640 || height <= 360) {
          break;
        }
        width = Math.max(640, Math.round(width * 0.85));
        height = Math.max(360, Math.round(height * 0.85));
      }

      if (!fallbackBlob) {
        return dataUrl;
      }
      const base64 = await blobToBase64(fallbackBlob);
      return `data:${fallbackBlob.type};base64,${base64}`;
    } finally {
      bitmap.close?.();
    }
  } catch {
    return dataUrl;
  }
}

async function maybeCaptureThumbnail(sender, stepType) {
  if (!shouldCaptureThumbnail(stepType)) {
    return null;
  }

  const tab = sender.tab;
  if (!tab || typeof tab.id !== "number" || typeof tab.windowId !== "number") {
    return null;
  }

  const tabKey = String(tab.id);
  const now = Date.now();
  if (now - (lastThumbnailCaptureByTab[tabKey] ?? 0) < 1400) {
    return null;
  }
  lastThumbnailCaptureByTab[tabKey] = now;

  const raw = await captureVisibleTab(tab.windowId);
  if (!raw) {
    return null;
  }

  return compressThumbnail(raw, THUMBNAIL_CAPTURE_CONFIG);
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const tabId = sender.tab?.id;
  if (!message?.type) {
    return;
  }

  chrome.storage.local.get(["captureState", "sessions", "steps", "sessionByTab", "eventLog"], (result) => {
    (async () => {
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

      if (message.type === "GET_DOCK_STATE") {
        const sessionId =
          typeof tabId === "number" ? (sessionByTab[String(tabId)] ?? null) : null;
        const session = sessionId ? sessions.find((x) => x.id === sessionId) ?? null : null;
        const stepsCount = sessionId ? steps.filter((x) => x.sessionId === sessionId).length : 0;
        sendResponse({
          ok: true,
          isCapturing: Boolean(captureState.isCapturing),
          startedAt: captureState.startedAt ?? null,
          sessionId,
          stepsCount,
          sessionUpdatedAt: session?.updatedAt ?? null
        });
        return;
      }

      if (message.type === "DISCARD_LAST_STEP") {
        const sessionId =
          message.payload?.sessionId ??
          (typeof tabId === "number" ? (sessionByTab[String(tabId)] ?? null) : null);
        if (!sessionId) {
          sendResponse({ ok: false, error: "Missing sessionId" });
          return;
        }

        const session = sessions.find((x) => x.id === sessionId) ?? null;
        if (!session) {
          sendResponse({ ok: false, error: "Session not found" });
          return;
        }

        const lastStepIndex = (() => {
          for (let i = steps.length - 1; i >= 0; i -= 1) {
            if (steps[i].sessionId === sessionId) {
              return i;
            }
          }
          return -1;
        })();

        if (lastStepIndex < 0) {
          sendResponse({ ok: true, discarded: false });
          return;
        }

        const removed = steps.splice(lastStepIndex, 1)[0];
        const remaining = steps.filter((x) => x.sessionId === sessionId);
        const lastRemaining = remaining[remaining.length - 1] ?? null;
        session.stepsCount = remaining.length;
        session.updatedAt = lastRemaining?.at ?? session.startedAt;
        session.lastUrl = lastRemaining?.url ?? session.startUrl;
        session.lastTitle = lastRemaining?.pageTitle ?? session.startTitle;

        eventLog.push({ type: message.type, tabId: session.tabId ?? null, ts: Date.now() });
        chrome.storage.local.set(
          {
            captureState,
            sessions: sessions.slice(-20),
            steps: steps.slice(-500),
            sessionByTab,
            eventLog: eventLog.slice(-100)
          },
          () => sendResponse({ ok: true, discarded: true, removedStepId: removed?.id ?? null })
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
          selectors: message.payload?.selectors ?? null,
          thumbnailDataUrl: null
        };

        const latestSessionStep = findLatestSessionStep(steps, sessionId);
        const isDuplicate =
          latestSessionStep &&
          buildStepSignature(latestSessionStep) === buildStepSignature(step) &&
          step.at - (latestSessionStep.at ?? 0) <= 800;

        if (!isDuplicate) {
          step.thumbnailDataUrl = await maybeCaptureThumbnail(sender, step.type);
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
    })().catch((error) => sendResponse({ ok: false, error: String(error) }));
  });

  return true;
});
