// Purpose: publish normalized capture events from the page context to the MV3 worker.
// Inputs: DOM, history, and window events. Outputs: STEP_CAPTURED messages with rich selectors/metadata.
function safeSendMessage(message) {
  try {
    if (typeof chrome === "undefined" || !chrome.runtime?.id) {
      return false;
    }

    chrome.runtime.sendMessage(message, () => {
      if (chrome.runtime.lastError) {
        return false;
      }
    });
    return true;
  } catch {
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

function hasStorageApi() {
  try {
    return typeof chrome !== "undefined" && Boolean(chrome.storage?.local);
  } catch {
    return false;
  }
}

function normalizeText(value, maxLen = 120) {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, maxLen);
}

function escapeSelectorValue(value) {
  if (typeof CSS !== "undefined" && typeof CSS.escape === "function") {
    return CSS.escape(value);
  }
  return String(value).replace(/[^a-zA-Z0-9_-]/g, "\\$&");
}

function buildCssSelector(el) {
  if (!(el instanceof Element)) {
    return null;
  }
  if (el.id) {
    return `#${escapeSelectorValue(el.id)}`;
  }

  const parts = [];
  let node = el;
  let depth = 0;
  while (node && node.nodeType === Node.ELEMENT_NODE && depth < 6) {
    const tag = node.tagName.toLowerCase();
    if (!tag) {
      break;
    }

    if (node.id) {
      parts.unshift(`#${escapeSelectorValue(node.id)}`);
      break;
    }

    let segment = tag;
    const parent = node.parentElement;
    if (parent) {
      const sameTagSiblings = Array.from(parent.children).filter(
        (child) => child.tagName.toLowerCase() === tag
      );
      if (sameTagSiblings.length > 1) {
        const index = sameTagSiblings.indexOf(node) + 1;
        segment += `:nth-of-type(${index})`;
      }
    }

    parts.unshift(segment);
    node = parent;
    depth += 1;
  }

  return parts.length > 0 ? parts.join(" > ") : null;
}

function buildXPath(el) {
  if (!(el instanceof Element)) {
    return null;
  }
  if (el.id) {
    return `//*[@id="${String(el.id).replace(/"/g, '\\"')}"]`;
  }

  const parts = [];
  let node = el;
  while (node && node.nodeType === Node.ELEMENT_NODE) {
    const tag = node.tagName.toLowerCase();
    const parent = node.parentElement;
    if (!parent) {
      parts.unshift(`/${tag}`);
      break;
    }

    const siblings = Array.from(parent.children).filter(
      (child) => child.tagName.toLowerCase() === tag
    );
    const index = siblings.indexOf(node) + 1;
    parts.unshift(`/${tag}[${index}]`);
    node = parent;
  }

  return parts.join("");
}

function getElementLabel(el) {
  if (!(el instanceof Element)) {
    return "";
  }

  const htmlEl = el;
  if (htmlEl.getAttribute) {
    const aria = htmlEl.getAttribute("aria-label") || htmlEl.getAttribute("aria-labelledby");
    if (aria) {
      return normalizeText(aria, 100);
    }
  }

  const wrappedLabel = el.closest("label");
  if (wrappedLabel) {
    return normalizeText(wrappedLabel.textContent || "", 100);
  }

  if (el.id) {
    const forLabel = document.querySelector(`label[for="${el.id}"]`);
    if (forLabel) {
      return normalizeText(forLabel.textContent || "", 100);
    }
  }

  return "";
}

function buildTargetMeta(el) {
  if (!(el instanceof Element)) {
    return null;
  }

  return {
    tag: el.tagName.toLowerCase(),
    id: el.id || null,
    name: (el.getAttribute("name") || "") || null,
    type: (el.getAttribute("type") || "") || null,
    role: (el.getAttribute("role") || "") || null,
    placeholder: (el.getAttribute("placeholder") || "") || null,
    label: getElementLabel(el) || null,
    text: normalizeText(el.textContent || "", 80) || null
  };
}

function buildSelectors(el) {
  return {
    css: buildCssSelector(el),
    xpath: buildXPath(el)
  };
}

function buildBasePayload(kind, el = null) {
  return {
    kind,
    href: window.location.href,
    title: document.title || "",
    ts: Date.now(),
    target: buildTargetMeta(el),
    selectors: buildSelectors(el)
  };
}

function resolveActionTarget(el) {
  if (!(el instanceof Element)) {
    return null;
  }

  const actionable = el.closest(
    "button,a,[role='button'],input,textarea,select,label,[data-testid],[aria-label]"
  );
  if (actionable) {
    return actionable;
  }

  if (["svg", "path", "use"].includes(el.tagName.toLowerCase())) {
    return el.closest("button,a,[role='button'],label") ?? el.parentElement ?? el;
  }

  return el;
}

function buildClickPayload(event) {
  const el = resolveActionTarget(event.target);
  if (!(el instanceof Element)) {
    return null;
  }

  return {
    ...buildBasePayload("click", el)
  };
}

function buildKeyPayload(event) {
  const ignoredKeys = new Set(["Shift", "Control", "Alt", "Meta"]);
  if (ignoredKeys.has(event.key)) {
    return null;
  }

  const el = event.target;
  if (!(el instanceof Element)) {
    return null;
  }

  return {
    ...buildBasePayload("key", el),
    key: event.key,
    modifiers: {
      ctrl: Boolean(event.ctrlKey),
      meta: Boolean(event.metaKey),
      alt: Boolean(event.altKey),
      shift: Boolean(event.shiftKey)
    }
  };
}

function buildInputPayload(event) {
  const el = event.target;
  if (!(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement)) {
    return null;
  }

  const blockedTypes = new Set(["password", "hidden", "file"]);
  if (el instanceof HTMLInputElement && blockedTypes.has(el.type)) {
    return null;
  }

  return {
    ...buildBasePayload("input", el),
    value: normalizeText(el.value || "", 160),
    inputType: event.inputType || null
  };
}

function buildChangePayload(event) {
  const el = event.target;
  if (!(el instanceof Element)) {
    return null;
  }

  if (el instanceof HTMLSelectElement) {
    const opt = el.options[el.selectedIndex];
    return {
      ...buildBasePayload("select", el),
      optionValue: el.value,
      optionText: normalizeText(opt?.textContent || "", 120)
    };
  }

  if (el instanceof HTMLInputElement && (el.type === "checkbox" || el.type === "radio")) {
    return {
      ...buildBasePayload("toggle", el),
      checked: Boolean(el.checked)
    };
  }

  return null;
}

function buildNavigationPayload(navigationKind, fromHref) {
  return {
    ...buildBasePayload("navigate"),
    navigationKind,
    fromHref: fromHref || null
  };
}

function buildScrollPayload() {
  return {
    ...buildBasePayload("scroll"),
    scrollX: Math.round(window.scrollX || 0),
    scrollY: Math.round(window.scrollY || 0)
  };
}

function emitStep(payload) {
  if (!payload) {
    return;
  }
  safeSendMessage({ type: "STEP_CAPTURED", payload });
}

safeSendMessage({
  type: "CONTENT_SCRIPT_READY",
  payload: { href: window.location.href, title: document.title || "", ts: Date.now() }
});

function onCaptureClick(event) {
  try {
    if (!hasLiveExtensionContext()) {
      document.removeEventListener("click", onCaptureClick, true);
      return;
    }
    emitStep(buildClickPayload(event));
  } catch {
    document.removeEventListener("click", onCaptureClick, true);
  }
}

function onCaptureKeydown(event) {
  try {
    if (!hasLiveExtensionContext()) {
      document.removeEventListener("keydown", onCaptureKeydown, true);
      return;
    }
    emitStep(buildKeyPayload(event));
  } catch {
    document.removeEventListener("keydown", onCaptureKeydown, true);
  }
}

function onCaptureInput(event) {
  try {
    if (!hasLiveExtensionContext()) {
      document.removeEventListener("input", onCaptureInput, true);
      return;
    }
    emitStep(buildInputPayload(event));
  } catch {
    document.removeEventListener("input", onCaptureInput, true);
  }
}

function onCaptureChange(event) {
  try {
    if (!hasLiveExtensionContext()) {
      document.removeEventListener("change", onCaptureChange, true);
      return;
    }
    emitStep(buildChangePayload(event));
  } catch {
    document.removeEventListener("change", onCaptureChange, true);
  }
}

let lastKnownHref = window.location.href;
function emitNavigationEvent(kind) {
  try {
    const nextHref = window.location.href;
    if (nextHref === lastKnownHref && kind !== "load") {
      return;
    }
    const prev = lastKnownHref;
    lastKnownHref = nextHref;
    emitStep(buildNavigationPayload(kind, prev));
  } catch {
    return;
  }
}

const rawPushState = history.pushState;
history.pushState = function patchedPushState(...args) {
  const result = rawPushState.apply(this, args);
  emitNavigationEvent("pushState");
  return result;
};

const rawReplaceState = history.replaceState;
history.replaceState = function patchedReplaceState(...args) {
  const result = rawReplaceState.apply(this, args);
  emitNavigationEvent("replaceState");
  return result;
};

window.addEventListener("popstate", () => emitNavigationEvent("popstate"), true);
window.addEventListener("hashchange", () => emitNavigationEvent("hashchange"), true);
window.addEventListener("load", () => emitNavigationEvent("load"), true);

let lastScrollAt = 0;
let lastScrollX = Math.round(window.scrollX || 0);
let lastScrollY = Math.round(window.scrollY || 0);
function onCaptureScroll() {
  const now = Date.now();
  if (now - lastScrollAt < 600) {
    return;
  }

  const x = Math.round(window.scrollX || 0);
  const y = Math.round(window.scrollY || 0);
  if (x === lastScrollX && y === lastScrollY) {
    return;
  }

  lastScrollAt = now;
  lastScrollX = x;
  lastScrollY = y;
  emitStep(buildScrollPayload());
}

document.addEventListener("click", onCaptureClick, true);
document.addEventListener("keydown", onCaptureKeydown, true);
document.addEventListener("input", onCaptureInput, true);
document.addEventListener("change", onCaptureChange, true);
window.addEventListener("scroll", onCaptureScroll, { capture: true, passive: true });

const dockState = { isCapturing: false, startedAt: null, stepCount: 0 };
let floatingDockFrame = null;
let dockUi = { left: null, bottom: 18, minimized: false };
let dockUiLoaded = false;

const DOCK_EXPANDED = { width: 400, height: 72 };
const DOCK_MINIMIZED = { width: 220, height: 64 };

function sendRuntimeMessage(message) {
  return new Promise((resolve) => {
    if (!hasLiveExtensionContext()) {
      resolve({ ok: false, error: "Extension context unavailable" });
      return;
    }

    try {
      chrome.runtime.sendMessage(message, (response) => {
        if (chrome.runtime.lastError) {
          resolve({ ok: false, error: chrome.runtime.lastError.message });
          return;
        }
        resolve(response);
      });
    } catch (error) {
      resolve({ ok: false, error: String(error) });
    }
  });
}

function getCurrentDockSize() {
  return dockUi.minimized ? DOCK_MINIMIZED : DOCK_EXPANDED;
}

function clampDockPosition() {
  const size = getCurrentDockSize();
  const maxLeft = Math.max(0, window.innerWidth - size.width - 4);
  dockUi.left = Math.min(Math.max(dockUi.left ?? 0, 4), maxLeft);
  dockUi.bottom = Math.min(Math.max(dockUi.bottom ?? 18, 4), Math.max(4, window.innerHeight - size.height - 4));
}

function applyDockFrameStyle() {
  if (!floatingDockFrame) {
    return;
  }
  const size = getCurrentDockSize();
  clampDockPosition();
  floatingDockFrame.style.position = "fixed";
  floatingDockFrame.style.left = `${dockUi.left}px`;
  floatingDockFrame.style.bottom = `${dockUi.bottom}px`;
  floatingDockFrame.style.transform = "none";
  floatingDockFrame.style.width = `${size.width}px`;
  floatingDockFrame.style.height = `${size.height}px`;
  floatingDockFrame.style.border = "0";
  floatingDockFrame.style.borderRadius = dockUi.minimized ? "18px" : "30px";
  floatingDockFrame.style.zIndex = "2147483647";
  floatingDockFrame.style.background = "transparent";
  floatingDockFrame.style.boxShadow = "0 12px 35px rgba(0,0,0,0.35)";
}

function persistDockUi() {
  if (!hasStorageApi()) {
    return;
  }
  try {
    chrome.storage.local.set({ dockUi });
  } catch {
    return;
  }
}

async function ensureDockUiLoaded() {
  if (dockUiLoaded || !hasLiveExtensionContext()) {
    return;
  }
  if (!hasStorageApi()) {
    dockUiLoaded = true;
    return;
  }
  const store = await new Promise((resolve) => {
    try {
      chrome.storage.local.get(["dockUi"], (result) => resolve(result ?? {}));
    } catch {
      resolve({});
    }
  });
  const stored = store.dockUi ?? null;
  if (stored && typeof stored === "object") {
    dockUi = {
      left: Number.isFinite(stored.left) ? stored.left : null,
      bottom: Number.isFinite(stored.bottom) ? stored.bottom : 18,
      minimized: Boolean(stored.minimized)
    };
  }
  dockUiLoaded = true;
}

function ensureFloatingDock() {
  if (floatingDockFrame || !document.documentElement || !hasLiveExtensionContext()) {
    return;
  }

  const size = getCurrentDockSize();
  if (!Number.isFinite(dockUi.left)) {
    dockUi.left = Math.round((window.innerWidth - size.width) / 2);
  }
  clampDockPosition();

  const frame = document.createElement("iframe");
  frame.src = chrome.runtime.getURL("ui-floating-control/index.html");
  floatingDockFrame = frame;
  applyDockFrameStyle();
  frame.addEventListener("load", () => {
    if (frame.contentWindow) {
      frame.contentWindow.postMessage(
        { channel: "CAP_ME_DOCK", type: "STATE", payload: { ...dockState, minimized: dockUi.minimized } },
        "*"
      );
    }
  });
  document.documentElement.appendChild(frame);
}

function removeFloatingDock() {
  if (!floatingDockFrame) {
    return;
  }
  floatingDockFrame.remove();
  floatingDockFrame = null;
}

function postDockState() {
  if (!floatingDockFrame?.contentWindow) {
    return;
  }
  floatingDockFrame.contentWindow.postMessage(
    { channel: "CAP_ME_DOCK", type: "STATE", payload: { ...dockState, minimized: dockUi.minimized } },
    "*"
  );
}

async function refreshDockState() {
  if (!hasLiveExtensionContext()) {
    removeFloatingDock();
    return;
  }
  try {
    await ensureDockUiLoaded();

    const response = await sendRuntimeMessage({ type: "GET_DOCK_STATE" });
    if (!response?.ok) {
      removeFloatingDock();
      return;
    }

    dockState.isCapturing = Boolean(response.isCapturing);
    dockState.startedAt = response.startedAt ?? null;
    dockState.stepCount = response.stepsCount ?? 0;

    if (dockState.isCapturing) {
      ensureFloatingDock();
      applyDockFrameStyle();
      postDockState();
      return;
    }
    removeFloatingDock();
  } catch {
    removeFloatingDock();
  }
}

window.addEventListener("message", (event) => {
  if (!floatingDockFrame || event.source !== floatingDockFrame.contentWindow) {
    return;
  }
  const data = event.data;
  if (!data || data.channel !== "CAP_ME_DOCK") {
    return;
  }

  if (data.type === "TOGGLE_CAPTURE") {
    safeSendMessage({ type: dockState.isCapturing ? "STOP_CAPTURE" : "START_CAPTURE" });
    setTimeout(refreshDockState, 80);
    return;
  }

  if (data.type === "STOP_CAPTURE") {
    safeSendMessage({ type: "STOP_CAPTURE" });
    setTimeout(refreshDockState, 80);
    return;
  }

  if (data.type === "DISCARD_LAST_STEP") {
    sendRuntimeMessage({ type: "DISCARD_LAST_STEP" }).then((response) => {
      if (floatingDockFrame?.contentWindow) {
        floatingDockFrame.contentWindow.postMessage(
          { channel: "CAP_ME_DOCK", type: "DISCARD_RESULT", discarded: Boolean(response?.discarded) },
          "*"
        );
      }
      setTimeout(refreshDockState, 80);
    });
    return;
  }

  if (data.type === "TOGGLE_MINIMIZE") {
    dockUi.minimized = !dockUi.minimized;
    applyDockFrameStyle();
    postDockState();
    persistDockUi();
    return;
  }

  if (data.type === "MOVE_DOCK") {
    const dx = Number(data.payload?.dx) || 0;
    const dy = Number(data.payload?.dy) || 0;
    if (dx !== 0 || dy !== 0) {
      dockUi.left = (dockUi.left ?? 0) + dx;
      dockUi.bottom -= dy;
      applyDockFrameStyle();
      persistDockUi();
    }
  }
});

if (chrome?.storage?.onChanged?.addListener) {
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== "local") {
      return;
    }
    if (changes.captureState || changes.steps) {
      refreshDockState();
    }
  });
}

window.addEventListener("resize", () => {
  if (!floatingDockFrame) {
    return;
  }
  applyDockFrameStyle();
  persistDockUi();
});

refreshDockState();
