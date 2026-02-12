// Purpose: receive action events from content scripts and persist a rolling debug log.
// Inputs: runtime messages of shape { type, payload }. Outputs: chrome.storage.local "eventLog" entries.
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message?.type) {
    return;
  }

  chrome.storage.local.get(["eventLog"], (result) => {
    const next = [...(result.eventLog ?? []), { message, tabId: sender.tab?.id ?? null }].slice(-100);
    chrome.storage.local.set({ eventLog: next }, () => sendResponse({ ok: true }));
  });

  return true;
});
