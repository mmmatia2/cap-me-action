// Purpose: send a startup heartbeat from each page. Inputs: loaded page context. Outputs: runtime message.
chrome.runtime.sendMessage({
  type: "CONTENT_SCRIPT_READY",
  payload: {
    href: window.location.href,
    ts: Date.now()
  }
});
