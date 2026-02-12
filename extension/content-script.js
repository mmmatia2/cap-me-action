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

function buildClickPayload(event) {
  const el = event.target;
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
