// Purpose: publish page-ready and click events from the page context to the MV3 worker.
// Inputs: DOM lifecycle and click events. Outputs: runtime messages with normalized payloads.
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

chrome.runtime.sendMessage({
  type: "CONTENT_SCRIPT_READY",
  payload: { href: window.location.href, ts: Date.now() }
});

document.addEventListener(
  "click",
  (event) => {
    const payload = buildClickPayload(event);
    if (!payload) {
      return;
    }

    chrome.runtime.sendMessage({ type: "STEP_CAPTURED", payload });
  },
  true
);
