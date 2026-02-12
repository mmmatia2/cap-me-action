// Purpose: publish page-ready and click events from the page context to the MV3 worker.
// Inputs: DOM lifecycle and click events. Outputs: runtime messages with normalized payloads.
function safeSendMessage(message) {
  try {
    if (typeof chrome === "undefined" || !chrome.runtime?.id) {
      return false;
    }

    chrome.runtime.sendMessage(message, () => {
      // Swallow expected transient errors (e.g., extension reloaded while tab stays open).
      if (chrome.runtime.lastError) {
        return false;
      }
    });
    return true;
  } catch {
    // Ignore invalidated extension context errors in stale content scripts.
    return false;
  }
}

function hasLiveExtensionContext() {
  try {
    return typeof chrome !== "undefined" && Boolean(chrome.runtime?.id);
  } catch {
    return false;
  }
}

function buildClickPayload(event) {
  const el = event.target;
  if (!(el instanceof Element)) {
    return null;
  }

  return {
    kind: "click",
    href: window.location.href,
    ts: Date.now(),
    target: {
      tag: el.tagName.toLowerCase(),
      id: el.id || null,
      text: (el.textContent || "").trim().slice(0, 80)
    }
  };
}

safeSendMessage({
  type: "CONTENT_SCRIPT_READY",
  payload: { href: window.location.href, ts: Date.now() }
});

function onCaptureClick(event) {
  try {
    if (!hasLiveExtensionContext()) {
      document.removeEventListener("click", onCaptureClick, true);
      return;
    }

    const payload = buildClickPayload(event);
    if (!payload) {
      return;
    }

    safeSendMessage({ type: "STEP_CAPTURED", payload });
  } catch {
    // Stale content-script instance; detach listener to prevent repeated console errors.
    document.removeEventListener("click", onCaptureClick, true);
  }
}

document.addEventListener("click", onCaptureClick, true);
