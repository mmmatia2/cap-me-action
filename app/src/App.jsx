import { useEffect, useMemo, useRef, useState } from "react";
import { APP_SCHEMA_VERSION, buildSessionExport, migrateSessionPayload } from "./lib/migrations";
import { deleteStepById, moveStepInList, patchStepById, resequenceSteps } from "./editor/state/sessionReducer";

// Purpose: provide a practical step editor for exported recorder sessions.
// Inputs: exported session JSON files, extension storage sessions, and in-app edits.
// Outputs: edited JSON export plus markdown/html procedure exports for team sharing.
function normalizeText(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function clampUnit(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) {
    return 0;
  }
  return Math.min(1, Math.max(0, num));
}

function sanitizeLabel(value) {
  const text = normalizeText(value);
  if (!text) {
    return "";
  }

  const lower = text.toLowerCase();
  const looksLikeAsset =
    /^\/?assets\/.+\.(js|css|map|png|jpg|jpeg|svg|webp)(\?.*)?$/i.test(text) ||
    /^https?:\/\/.+\/assets\/.+\.(js|css|map|png|jpg|jpeg|svg|webp)(\?.*)?$/i.test(text);
  const noisyTag = ["svg", "path", "use", "g"].includes(lower);

  if (looksLikeAsset || noisyTag) {
    return "";
  }

  return text;
}

function humanizeIdentifier(value) {
  return normalizeText(
    String(value ?? "")
      .replace(/:nth-of-type\(\d+\)/g, " ")
      .replace(/[#.[\]()"'`]/g, " ")
      .replace(/[_-]+/g, " ")
      .replace(/([a-z])([A-Z])/g, "$1 $2")
      .replace(/\s+/g, " ")
  );
}

const WEAK_LABELS = new Set([
  "a",
  "article",
  "aside",
  "button",
  "div",
  "form",
  "g",
  "header",
  "i",
  "img",
  "input",
  "label",
  "li",
  "nav",
  "option",
  "p",
  "path",
  "section",
  "select",
  "span",
  "svg",
  "textarea",
  "ul"
]);

function cleanCandidate(value) {
  const sanitized = sanitizeLabel(value);
  if (!sanitized) {
    return "";
  }
  const cleaned = humanizeIdentifier(sanitized);
  if (!cleaned || cleaned.length < 2) {
    return "";
  }
  if (/^[\d\W]+$/.test(cleaned)) {
    return "";
  }
  return cleaned;
}

function isWeakLabel(value) {
  const cleaned = cleanCandidate(value);
  if (!cleaned) {
    return true;
  }
  const lower = cleaned.toLowerCase();
  if (WEAK_LABELS.has(lower)) {
    return true;
  }
  if (lower.startsWith("icon ") || lower.endsWith(" icon")) {
    return true;
  }
  return false;
}

function selectorToLabel(selector) {
  const text = sanitizeLabel(selector);
  if (!text) {
    return "";
  }

  const attributeMatch = text.match(/(?:aria-label|data-testid|data-test|data-qa)=["']([^"']+)["']/i);
  if (attributeMatch?.[1]) {
    const candidate = cleanCandidate(attributeMatch[1]);
    if (!isWeakLabel(candidate)) {
      return candidate;
    }
  }

  const segment = text.split(">").pop()?.trim() || text;
  const idMatch = segment.match(/#([a-zA-Z0-9_-]+)/);
  if (idMatch?.[1]) {
    const candidate = cleanCandidate(idMatch[1]);
    if (!isWeakLabel(candidate)) {
      return candidate;
    }
  }

  const classMatch = segment.match(/\.([a-zA-Z][a-zA-Z0-9_-]{2,})/);
  if (classMatch?.[1]) {
    const candidate = cleanCandidate(classMatch[1]);
    if (!isWeakLabel(candidate)) {
      return candidate;
    }
  }

  const segmentLabel = cleanCandidate(segment);
  if (!isWeakLabel(segmentLabel)) {
    return segmentLabel;
  }

  return "";
}

function semanticFallback(step) {
  const tag = normalizeText(step.target?.tag).toLowerCase();
  const role = normalizeText(step.target?.role).toLowerCase();
  const type = normalizeText(step.target?.type).toLowerCase();

  if (role === "button" || tag === "button") {
    return "button";
  }
  if (tag === "a") {
    return "link";
  }
  if (tag === "input") {
    return type ? `${type} input` : "input";
  }
  if (tag === "select") {
    return "dropdown";
  }
  if (tag === "textarea") {
    return "text area";
  }
  return "";
}

function targetLabel(step) {
  const candidates = [
    step.target?.label,
    step.target?.text,
    step.target?.placeholder,
    step.target?.id,
    step.target?.name,
    selectorToLabel(step.selectors?.css),
    selectorToLabel(step.selectors?.xpath)
  ];

  for (const raw of candidates) {
    const candidate = cleanCandidate(raw);
    if (!isWeakLabel(candidate)) {
      return candidate;
    }
  }

  const semantic = cleanCandidate(semanticFallback(step));
  if (semantic) {
    return semantic;
  }

  return "target";
}

function deriveTitle(step) {
  const label = targetLabel(step);
  if (step.type === "click") {
    return `Click ${label}`;
  }
  if (step.type === "input") {
    return `Enter text in ${label}`;
  }
  if (step.type === "key") {
    return `Press ${step.key || "key"}`;
  }
  if (step.type === "select") {
    return `Select ${step.optionText || step.optionValue || "option"}`;
  }
  if (step.type === "toggle") {
    return `${step.checked ? "Enable" : "Disable"} ${label}`;
  }
  if (step.type === "navigate") {
    return `Open ${step.pageTitle || step.url || "page"}`;
  }
  if (step.type === "scroll") {
    return "Scroll page";
  }
  return `Perform ${step.type || "action"}`;
}

function deriveInstruction(step) {
  const label = targetLabel(step);
  if (step.type === "click") {
    return `Click ${label}.`;
  }
  if (step.type === "input") {
    return `Type "${step.value || ""}" into ${label}.`;
  }
  if (step.type === "key") {
    return `Press ${step.key || "key"} on ${label}.`;
  }
  if (step.type === "select") {
    return `Select "${step.optionText || step.optionValue || "option"}" in ${label}.`;
  }
  if (step.type === "toggle") {
    return `${step.checked ? "Turn on" : "Turn off"} ${label}.`;
  }
  if (step.type === "navigate") {
    return `Navigate to ${step.pageTitle || step.url || "the page"}.`;
  }
  if (step.type === "scroll") {
    return `Scroll to x:${step.scrollX || 0}, y:${step.scrollY || 0}.`;
  }
  return `Perform ${step.type || "action"} on ${label}.`;
}

function normalizeAnnotations(raw) {
  if (!Array.isArray(raw)) {
    return [];
  }

  return raw
    .map((annotation, idx) => {
      if (!annotation || typeof annotation !== "object") {
        return null;
      }
      const width = clampUnit(annotation.width);
      const height = clampUnit(annotation.height);
      if (width < 0.01 || height < 0.01) {
        return null;
      }
      return {
        id: annotation.id || `ann_${idx + 1}`,
        x: clampUnit(annotation.x),
        y: clampUnit(annotation.y),
        width,
        height,
        label: normalizeText(annotation.label || "")
      };
    })
    .filter(Boolean);
}

function normalizePayload(raw) {
  if (!raw || typeof raw !== "object" || !raw.session || !Array.isArray(raw.steps)) {
    throw new Error("Expected payload shape: { session: {...}, steps: [...] }");
  }

  const steps = raw.steps.map((step, idx) => {
    const id = step.id || `step_${idx + 1}`;
    return {
      ...step,
      id,
      stepIndex: idx + 1,
      title: normalizeText(step.title) || deriveTitle(step),
      instruction: normalizeText(step.instruction) || deriveInstruction(step),
      note: normalizeText(step.note),
      annotations: normalizeAnnotations(step.annotations)
    };
  });

  return { ...raw, steps };
}

function resequence(steps) {
  return resequenceSteps(steps);
}

function asMarkdown(payload) {
  const sessionTitle = payload.session?.lastTitle || payload.session?.startTitle || payload.session?.id || "Procedure";
  const header = [`# ${sessionTitle}`, "", `Generated: ${new Date().toLocaleString()}`, ""];
  const body = payload.steps.flatMap((step) => {
    const lines = [`## ${step.stepIndex}. ${step.title}`, step.instruction || ""];
    if (step.note) {
      lines.push(`Note: ${step.note}`);
    }
    if (step.url) {
      lines.push(`URL: ${step.url}`);
    }
    if (Array.isArray(step.annotations) && step.annotations.length) {
      const highlights = step.annotations
        .map((ann, idx) => ann.label || `Highlight ${idx + 1}`)
        .join(", ");
      lines.push(`Highlights: ${highlights}`);
    }
    lines.push("");
    return lines;
  });
  return [...header, ...body].join("\n");
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function asHtml(payload) {
  const sessionTitle = payload.session?.lastTitle || payload.session?.startTitle || payload.session?.id || "Procedure";
  const lines = payload.steps
    .map((step) => {
      const note = step.note ? `<p class="note"><strong>Note:</strong> ${escapeHtml(step.note)}</p>` : "";
      const url = step.url ? `<p class="url"><strong>URL:</strong> ${escapeHtml(step.url)}</p>` : "";
      const screenshot =
        step.thumbnailDataUrl && typeof step.thumbnailDataUrl === "string"
          ? `<figure class="shot">
              <div class="shot-frame">
                <img src="${escapeHtml(step.thumbnailDataUrl)}" alt="Step ${step.stepIndex} screenshot" />
                ${(Array.isArray(step.annotations) ? step.annotations : [])
                  .map((ann, idx) => {
                    const x = Math.min(1, Math.max(0, Number(ann?.x) || 0));
                    const y = Math.min(1, Math.max(0, Number(ann?.y) || 0));
                    const width = Math.min(1, Math.max(0.01, Number(ann?.width) || 0.01));
                    const height = Math.min(1, Math.max(0.01, Number(ann?.height) || 0.01));
                    const label = escapeHtml(ann?.label || `Highlight ${idx + 1}`);
                    return `<div class="shot-highlight" style="left:${(x * 100).toFixed(3)}%;top:${(y * 100).toFixed(3)}%;width:${(width * 100).toFixed(3)}%;height:${(height * 100).toFixed(3)}%;">
                        <span class="shot-highlight-label">${label}</span>
                      </div>`;
                  })
                  .join("")}
              </div>
            </figure>`
          : "";
      const highlights =
        Array.isArray(step.annotations) && step.annotations.length
          ? `<p class="note"><strong>Highlights:</strong> ${escapeHtml(step.annotations.map((ann, idx) => ann.label || `Highlight ${idx + 1}`).join(", "))}</p>`
          : "";
      return `
        <section class="step">
          <h2>${step.stepIndex}. ${escapeHtml(step.title)}</h2>
          <p>${escapeHtml(step.instruction || "")}</p>
          ${screenshot}
          ${note}
          ${url}
          ${highlights}
        </section>`;
    })
    .join("\n");

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${sessionTitle}</title>
    <style>
      body { font-family: "Segoe UI", sans-serif; max-width: 920px; margin: 24px auto; padding: 0 16px; color: #0f172a; }
      h1 { margin-bottom: 6px; }
      .meta { color: #475569; margin-top: 0; }
      .step { border: 1px solid #dbe4f0; border-radius: 10px; padding: 12px 14px; margin: 12px 0; background: #f8fafc; }
      .step h2 { margin: 0 0 6px; font-size: 18px; }
      .step p { margin: 0 0 8px; line-height: 1.45; }
      .note, .url { color: #334155; font-size: 14px; }
      .shot { margin: 10px 0 12px; }
      .shot-frame { position: relative; border: 1px solid #cbd5e1; border-radius: 8px; overflow: hidden; background: #fff; }
      .shot-frame img { display: block; width: 100%; height: auto; }
      .shot-highlight { position: absolute; border: 2px solid #2563eb; background: rgba(37, 99, 235, 0.16); box-sizing: border-box; }
      .shot-highlight-label { position: absolute; left: 0; top: 0; transform: translateY(-100%); background: #2563eb; color: #fff; font-size: 11px; line-height: 1; padding: 4px 6px; border-radius: 6px 6px 6px 0; white-space: nowrap; }
    </style>
  </head>
  <body>
    <h1>${escapeHtml(sessionTitle)}</h1>
    <p class="meta">Generated ${new Date().toLocaleString()}</p>
    ${lines}
  </body>
</html>`;
}

function getPalette(theme) {
  if (theme === "light") {
    return {
      bg: "#f7fafc",
      surface: "#ffffff",
      surfaceAlt: "#f8fafc",
      border: "#dbe4f0",
      text: "#0f172a",
      textSoft: "#475569",
      accent: "#2563eb"
    };
  }

  return {
    bg: "#0b1220",
    surface: "#111b2e",
    surfaceAlt: "#18253e",
    border: "#243652",
    text: "#e7edf7",
    textSoft: "#9bb0cd",
    accent: "#60a5fa"
  };
}

function loadSessionsViaPageBridge(timeoutMs = 1500) {
  return new Promise((resolve) => {
    const requestId = `cap_me_bridge_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    let settled = false;

    const cleanup = () => {
      window.removeEventListener("message", onMessage);
      clearTimeout(timer);
    };

    const finish = (value) => {
      if (settled) {
        return;
      }
      settled = true;
      cleanup();
      resolve(value);
    };

    const onMessage = (event) => {
      if (event.source !== window) {
        return;
      }
      const data = event.data;
      if (!data || data.channel !== "CAP_ME_APP_BRIDGE" || data.type !== "SESSIONS_RESPONSE") {
        return;
      }
      if (data.requestId !== requestId) {
        return;
      }
      finish({
        ok: Boolean(data.ok),
        sessions: data.sessions ?? [],
        steps: data.steps ?? [],
        error: data.error ?? null
      });
    };

    const timer = setTimeout(() => {
      finish({ ok: false, sessions: [], steps: [], error: "bridge_timeout" });
    }, timeoutMs);

    window.addEventListener("message", onMessage);
    window.postMessage({ channel: "CAP_ME_APP_BRIDGE", type: "REQUEST_SESSIONS", requestId }, "*");
  });
}

function buttonStyle(palette, disabled = false) {
  return {
    border: `1px solid ${palette.border}`,
    borderRadius: 8,
    padding: "7px 10px",
    background: disabled ? palette.surfaceAlt : palette.surface,
    color: disabled ? palette.textSoft : palette.text,
    cursor: disabled ? "not-allowed" : "pointer"
  };
}

export default function App() {
  const [payload, setPayload] = useState(null);
  const [error, setError] = useState("");
  const [selectedId, setSelectedId] = useState(null);
  const [theme, setTheme] = useState("dark");
  const [extensionSessions, setExtensionSessions] = useState([]);
  const [extensionSteps, setExtensionSteps] = useState([]);
  const [selectedExtensionSessionId, setSelectedExtensionSessionId] = useState("");
  const [extensionStatus, setExtensionStatus] = useState("");
  const [dataSource, setDataSource] = useState("local");
  const [teamApiBase, setTeamApiBase] = useState("");
  const [teamAccessToken, setTeamAccessToken] = useState("");
  const [teamSessions, setTeamSessions] = useState([]);
  const [selectedTeamSessionId, setSelectedTeamSessionId] = useState("");
  const [teamStatus, setTeamStatus] = useState("");
  const [dragState, setDragState] = useState({ dragId: "", overId: "", placement: "after" });
  const [annotationMode, setAnnotationMode] = useState(false);
  const [draftAnnotation, setDraftAnnotation] = useState(null);
  const [activeAnnotationId, setActiveAnnotationId] = useState("");
  const screenshotRef = useRef(null);
  const palette = getPalette(theme);
  const hasExtensionStorage =
    typeof chrome !== "undefined" && Boolean(chrome.storage?.local) && Boolean(chrome.runtime?.id);

  useEffect(() => {
    // Purpose: keep page chrome visually consistent with the selected editor theme.
    // Inputs: current theme palette. Outputs: document-level background/margin styles.
    document.body.style.margin = "0";
    document.body.style.background = palette.bg;
    document.body.style.color = palette.text;
    document.documentElement.style.background = palette.bg;
  }, [palette.bg, palette.text]);

  const selectedStep = useMemo(
    () => payload?.steps?.find((step) => step.id === selectedId) || payload?.steps?.[0] || null,
    [payload, selectedId]
  );
  const activeAnnotation = useMemo(
    () => selectedStep?.annotations?.find((annotation) => annotation.id === activeAnnotationId) || null,
    [selectedStep, activeAnnotationId]
  );

  useEffect(() => {
    setDraftAnnotation(null);
    setActiveAnnotationId("");
  }, [selectedId]);

  useEffect(() => {
    const storedBase = window.localStorage.getItem("cap_me_team_api_base");
    if (storedBase) {
      setTeamApiBase(storedBase);
    }
    const storedToken = window.localStorage.getItem("cap_me_team_api_token");
    if (storedToken) {
      setTeamAccessToken(storedToken);
    }
  }, []);

  useEffect(() => {
    if (teamApiBase) {
      window.localStorage.setItem("cap_me_team_api_base", teamApiBase);
    }
  }, [teamApiBase]);

  useEffect(() => {
    if (teamAccessToken) {
      window.localStorage.setItem("cap_me_team_api_token", teamAccessToken);
    }
  }, [teamAccessToken]);

  useEffect(() => {
    if (!hasExtensionStorage) {
      return;
    }
    chrome.storage.local.get(["syncConfig"], (result) => {
      const endpoint = result.syncConfig?.endpointUrl ?? "";
      if (endpoint && !teamApiBase) {
        setTeamApiBase(endpoint);
      }
    });
  }, [hasExtensionStorage, teamApiBase]);

  function onFileSelected(event) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result || "{}"));
        const migrated = migrateSessionPayload(parsed);
        const normalized = normalizePayload(migrated);
        setPayload(normalized);
        setSelectedId(normalized.steps[0]?.id || null);
        setError("");
      } catch (err) {
        setPayload(null);
        setSelectedId(null);
        setError(err instanceof Error ? err.message : "Invalid JSON file.");
      }
    };
    reader.readAsText(file);
  }

  function patchStep(stepId, patchFn) {
    setPayload((prev) => {
      if (!prev) {
        return prev;
      }
      return {
        ...prev,
        steps: patchStepById(prev.steps, stepId, patchFn)
      };
    });
  }

  function updateStep(stepId, patch) {
    patchStep(stepId, (step) => ({ ...step, ...patch }));
  }

  function moveStep(stepId, direction) {
    setPayload((prev) => {
      if (!prev) {
        return prev;
      }
      return { ...prev, steps: moveStepInList(prev.steps, stepId, direction) };
    });
  }

  function moveStepTo(stepId, targetId, placement) {
    setPayload((prev) => {
      if (!prev || stepId === targetId) {
        return prev;
      }

      const fromIndex = prev.steps.findIndex((step) => step.id === stepId);
      const targetIndex = prev.steps.findIndex((step) => step.id === targetId);
      if (fromIndex < 0 || targetIndex < 0) {
        return prev;
      }

      let insertIndex = targetIndex + (placement === "after" ? 1 : 0);
      const next = [...prev.steps];
      const [moved] = next.splice(fromIndex, 1);
      if (!moved) {
        return prev;
      }
      if (fromIndex < insertIndex) {
        insertIndex -= 1;
      }
      insertIndex = Math.min(Math.max(insertIndex, 0), next.length);
      next.splice(insertIndex, 0, moved);
      return { ...prev, steps: resequenceSteps(next) };
    });
  }

  function deleteStep(stepId) {
    setPayload((prev) => {
      if (!prev) {
        return prev;
      }
      const next = deleteStepById(prev.steps, stepId);
      setSelectedId(next[0]?.id || null);
      return { ...prev, steps: next };
    });
  }

  function upsertAnnotation(stepId, annotationId, patch) {
    patchStep(stepId, (step) => ({
      ...step,
      annotations: (step.annotations ?? []).map((annotation) =>
        annotation.id === annotationId ? { ...annotation, ...patch } : annotation
      )
    }));
  }

  function deleteAnnotation(stepId, annotationId) {
    patchStep(stepId, (step) => ({
      ...step,
      annotations: (step.annotations ?? []).filter((annotation) => annotation.id !== annotationId)
    }));
    if (activeAnnotationId === annotationId) {
      setActiveAnnotationId("");
    }
  }

  function onStepDragStart(stepId, event) {
    setDragState({ dragId: stepId, overId: stepId, placement: "after" });
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", stepId);
  }

  function onStepDragOver(stepId, event) {
    event.preventDefault();
    const rect = event.currentTarget.getBoundingClientRect();
    const placement = event.clientY < rect.top + rect.height / 2 ? "before" : "after";
    setDragState((prev) => {
      if (prev.overId === stepId && prev.placement === placement) {
        return prev;
      }
      return { ...prev, overId: stepId, placement };
    });
  }

  function onStepDrop(stepId, event) {
    event.preventDefault();
    const dragId = dragState.dragId || event.dataTransfer.getData("text/plain");
    if (dragId) {
      moveStepTo(dragId, stepId, dragState.placement);
      setSelectedId(dragId);
    }
    setDragState({ dragId: "", overId: "", placement: "after" });
  }

  function onStepDragEnd() {
    setDragState({ dragId: "", overId: "", placement: "after" });
  }

  function toRelativePoint(event, rect) {
    return {
      x: clampUnit((event.clientX - rect.left) / rect.width),
      y: clampUnit((event.clientY - rect.top) / rect.height)
    };
  }

  function buildRelativeRect(start, end) {
    const x = Math.min(start.x, end.x);
    const y = Math.min(start.y, end.y);
    const width = Math.abs(start.x - end.x);
    const height = Math.abs(start.y - end.y);
    return { x, y, width, height };
  }

  function onScreenshotMouseDown(event) {
    if (!annotationMode || !selectedStep || !selectedStep.thumbnailDataUrl || event.button !== 0) {
      return;
    }
    const surface = screenshotRef.current;
    if (!surface) {
      return;
    }

    event.preventDefault();
    const rect = surface.getBoundingClientRect();
    const start = toRelativePoint(event, rect);
    setDraftAnnotation({ x: start.x, y: start.y, width: 0, height: 0 });
    const stepId = selectedStep.id;

    const onMove = (moveEvent) => {
      const current = toRelativePoint(moveEvent, rect);
      setDraftAnnotation(buildRelativeRect(start, current));
    };

    const onUp = (upEvent) => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      const end = toRelativePoint(upEvent, rect);
      const nextRect = buildRelativeRect(start, end);
      setDraftAnnotation(null);
      if (nextRect.width < 0.02 || nextRect.height < 0.02) {
        return;
      }
      const annotation = {
        id: `ann_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        ...nextRect,
        label: ""
      };
      patchStep(stepId, (step) => ({
        ...step,
        annotations: [...(step.annotations ?? []), annotation]
      }));
      setActiveAnnotationId(annotation.id);
    };

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }

  function exportJson() {
    if (!payload) {
      return;
    }
    const exportPayload = buildSessionExport({
      exportedAt: Date.now(),
      session: payload.session,
      steps: payload.steps,
      meta: {
        capturedBy: payload.meta?.capturedBy ?? "unknown",
        appVersion: payload.meta?.appVersion ?? "0.0.0",
        syncRevision: payload.meta?.syncRevision ?? payload.session?.sync?.revision ?? 1
      }
    });
    const blob = new Blob([JSON.stringify(exportPayload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `cap-me-edited-${payload.session?.id || "session"}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function exportMarkdown() {
    if (!payload) {
      return;
    }
    const blob = new Blob([asMarkdown(payload)], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `cap-me-guide-${payload.session?.id || "session"}.md`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function exportHtml() {
    if (!payload) {
      return;
    }
    const blob = new Blob([asHtml(payload)], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `cap-me-guide-${payload.session?.id || "session"}.html`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function loadFromExtensionStorage() {
    if (hasExtensionStorage) {
      chrome.storage.local.get(["sessions", "steps"], (result) => {
        const sessions = (result.sessions ?? []).sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0));
        const steps = result.steps ?? [];
        setExtensionSessions(sessions);
        setExtensionSteps(steps);
        setSelectedExtensionSessionId(sessions[0]?.id ?? "");
        setExtensionStatus(sessions.length ? `Loaded ${sessions.length} session(s) from extension.` : "No sessions found in extension storage.");
      });
      return;
    }

    loadSessionsViaPageBridge().then((response) => {
      if (!response.ok) {
        setExtensionStatus("Extension bridge unavailable. Reload extension, refresh this page, then try again.");
        return;
      }
      const sessions = [...response.sessions].sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0));
      const steps = response.steps ?? [];
      setExtensionSessions(sessions);
      setExtensionSteps(steps);
      setSelectedExtensionSessionId(sessions[0]?.id ?? "");
      setExtensionStatus(sessions.length ? `Loaded ${sessions.length} session(s) from extension.` : "No sessions found in extension storage.");
    });
  }

  function importSelectedExtensionSession() {
    if (!selectedExtensionSessionId) {
      return;
    }

    const session = extensionSessions.find((x) => x.id === selectedExtensionSessionId);
    if (!session) {
      setExtensionStatus("Selected extension session was not found.");
      return;
    }

    const steps = extensionSteps
      .filter((x) => x.sessionId === session.id)
      .sort((a, b) => (a.stepIndex ?? 0) - (b.stepIndex ?? 0) || (a.at ?? 0) - (b.at ?? 0));
    const migrated = migrateSessionPayload({
      schemaVersion: APP_SCHEMA_VERSION,
      exportedAt: Date.now(),
      session,
      steps,
      meta: {
        capturedBy: "extension-local",
        appVersion: "0.0.0",
        syncRevision: session.sync?.revision ?? 1
      }
    });
    const normalized = normalizePayload(migrated);
    setPayload(normalized);
    setSelectedId(normalized.steps[0]?.id || null);
    setError("");
    setExtensionStatus(`Imported session ${session.id} (${steps.length} steps).`);
  }

  function buildTeamEndpoint(action, query = {}) {
    const base = String(teamApiBase || "").trim();
    if (!base) {
      throw new Error("Team API endpoint is required.");
    }
    const url = new URL(base);
    url.searchParams.set("action", action);
    Object.entries(query).forEach(([key, value]) => {
      if (value !== undefined && value !== null && String(value) !== "") {
        url.searchParams.set(key, String(value));
      }
    });
    return url.toString();
  }

  async function loadFromTeamLibrary() {
    try {
      setTeamStatus("Loading team sessions...");
      const response = await fetch(buildTeamEndpoint("listSessions", { limit: 50 }), {
        method: "GET",
        headers: teamAccessToken ? { Authorization: `Bearer ${teamAccessToken}` } : undefined
      });
      const body = await response.json();
      if (!response.ok || body?.ok === false) {
        throw new Error(body?.errorCode || body?.error || `HTTP_${response.status}`);
      }

      const items = Array.isArray(body?.items) ? body.items : [];
      setTeamSessions(items);
      setSelectedTeamSessionId(items[0]?.sessionId ?? items[0]?.id ?? "");
      setTeamStatus(items.length ? `Loaded ${items.length} team session(s).` : "No team sessions found.");
    } catch (err) {
      setTeamStatus(`Team load failed: ${err instanceof Error ? err.message : "unknown error"}`);
    }
  }

  async function importSelectedTeamSession() {
    if (!selectedTeamSessionId) {
      return;
    }

    try {
      setTeamStatus("Importing team session...");
      const response = await fetch(buildTeamEndpoint("getSession", { sessionId: selectedTeamSessionId }), {
        method: "GET",
        headers: teamAccessToken ? { Authorization: `Bearer ${teamAccessToken}` } : undefined
      });
      const body = await response.json();
      if (!response.ok || body?.ok === false) {
        throw new Error(body?.errorCode || body?.error || `HTTP_${response.status}`);
      }
      const rawPayload = body?.payload ?? body;
      const migrated = migrateSessionPayload(rawPayload);
      const normalized = normalizePayload(migrated);
      setPayload(normalized);
      setSelectedId(normalized.steps[0]?.id || null);
      setError("");
      setTeamStatus(`Imported team session ${normalized.session.id}.`);
    } catch (err) {
      setTeamStatus(`Team import failed: ${err instanceof Error ? err.message : "unknown error"}`);
    }
  }

  return (
    <main
      style={{
        fontFamily: "Segoe UI, sans-serif",
        padding: 16,
        color: palette.text,
        background: palette.bg,
        minHeight: "100vh",
        width: "100%",
        overflowX: "hidden",
        boxSizing: "border-box"
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <h1 style={{ marginTop: 0, marginBottom: 4 }}>Cap Me Action Editor</h1>
          <p style={{ margin: 0, color: palette.textSoft }}>Import a session, reorder steps by drag/drop, annotate screenshots, and export JSON or Markdown.</p>
        </div>
        <button type="button" style={buttonStyle(palette, false)} onClick={() => setTheme((t) => (t === "dark" ? "light" : "dark"))}>
          Theme: {theme}
        </button>
      </div>

      <div style={{ marginTop: 14, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <label htmlFor="dataSource" style={{ color: palette.textSoft, fontSize: 12 }}>
          Source
        </label>
        <select
          id="dataSource"
          value={dataSource}
          onChange={(event) => setDataSource(event.target.value)}
          style={{ padding: 8, borderRadius: 8, border: `1px solid ${palette.border}`, background: palette.surfaceAlt, color: palette.text, minWidth: 140 }}
        >
          <option value="local">Local (Extension)</option>
          <option value="team">Team Library</option>
        </select>
        <input
          type="file"
          accept=".json,application/json"
          onChange={onFileSelected}
          style={{ maxWidth: "320px", color: palette.textSoft }}
        />
        <button type="button" onClick={exportJson} disabled={!payload} style={{ ...buttonStyle(palette, !payload), marginLeft: 8 }}>
          Export JSON
        </button>
        <button type="button" onClick={exportMarkdown} disabled={!payload} style={{ ...buttonStyle(palette, !payload), marginLeft: 8 }}>
          Export Markdown
        </button>
        <button type="button" onClick={exportHtml} disabled={!payload} style={{ ...buttonStyle(palette, !payload), marginLeft: 8 }}>
          Export HTML
        </button>
      </div>
      {dataSource === "local" ? (
        <>
          <div style={{ marginTop: 10, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <button type="button" onClick={loadFromExtensionStorage} style={buttonStyle(palette, false)}>
              Load From Extension
            </button>
            <select
              value={selectedExtensionSessionId}
              onChange={(event) => setSelectedExtensionSessionId(event.target.value)}
              style={{ padding: 8, borderRadius: 8, border: `1px solid ${palette.border}`, background: palette.surfaceAlt, color: palette.text, minWidth: 260 }}
              disabled={!extensionSessions.length}
            >
              {!extensionSessions.length ? (
                <option value="">No extension sessions loaded</option>
              ) : (
                extensionSessions.map((session) => (
                  <option key={session.id} value={session.id}>
                    {session.id} ({session.stepsCount} steps{session.sync?.status ? ` | ${session.sync.status}` : ""})
                  </option>
                ))
              )}
            </select>
            <button type="button" onClick={importSelectedExtensionSession} style={buttonStyle(palette, !selectedExtensionSessionId)} disabled={!selectedExtensionSessionId}>
              Import Selected Session
            </button>
          </div>
          {extensionStatus ? <p style={{ marginTop: 8, color: palette.textSoft }}>{extensionStatus}</p> : null}
        </>
      ) : (
        <>
          <div style={{ marginTop: 10, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <input
              type="text"
              value={teamApiBase}
              placeholder="Apps Script endpoint URL"
              onChange={(event) => setTeamApiBase(event.target.value)}
              style={{ minWidth: 320, padding: 8, borderRadius: 8, border: `1px solid ${palette.border}`, background: palette.surfaceAlt, color: palette.text }}
            />
            <input
              type="password"
              value={teamAccessToken}
              placeholder="Bearer token (optional)"
              onChange={(event) => setTeamAccessToken(event.target.value)}
              style={{ minWidth: 220, padding: 8, borderRadius: 8, border: `1px solid ${palette.border}`, background: palette.surfaceAlt, color: palette.text }}
            />
            <button type="button" onClick={loadFromTeamLibrary} style={buttonStyle(palette, false)}>
              Load Team Sessions
            </button>
            <select
              value={selectedTeamSessionId}
              onChange={(event) => setSelectedTeamSessionId(event.target.value)}
              style={{ padding: 8, borderRadius: 8, border: `1px solid ${palette.border}`, background: palette.surfaceAlt, color: palette.text, minWidth: 260 }}
              disabled={!teamSessions.length}
            >
              {!teamSessions.length ? (
                <option value="">No team sessions loaded</option>
              ) : (
                teamSessions.map((session) => {
                  const id = session.sessionId || session.id;
                  const title = session.title || session.lastTitle || session.startTitle || id;
                  return (
                    <option key={id} value={id}>
                      {title}
                    </option>
                  );
                })
              )}
            </select>
            <button type="button" onClick={importSelectedTeamSession} style={buttonStyle(palette, !selectedTeamSessionId)} disabled={!selectedTeamSessionId}>
              Import Team Session
            </button>
          </div>
          {teamStatus ? <p style={{ marginTop: 8, color: palette.textSoft }}>{teamStatus}</p> : null}
        </>
      )}
      <p style={{ marginTop: 6, color: palette.textSoft, fontSize: 12 }}>
        Privacy warning: screenshots and typed values can include sensitive data. Review before sharing/exporting.
      </p>
      {error ? <p style={{ color: "#ef4444" }}>{error}</p> : null}

      {!payload ? (
        <p style={{ marginTop: 24, color: palette.textSoft }}>No file loaded yet.</p>
      ) : (
        <section style={{ display: "grid", gridTemplateColumns: "380px minmax(0, 1fr)", gap: 16, marginTop: 16 }}>
          <aside style={{ border: `1px solid ${palette.border}`, background: palette.surface, borderRadius: 10, padding: 12, maxHeight: 620, overflow: "auto" }}>
            <h2 style={{ fontSize: 16, margin: "0 0 8px" }}>
              Session: {payload.session.id} ({payload.steps.length} steps)
            </h2>
            {payload.steps.map((step, idx) => (
              <div
                key={step.id}
                draggable
                onDragStart={(event) => onStepDragStart(step.id, event)}
                onDragOver={(event) => onStepDragOver(step.id, event)}
                onDrop={(event) => onStepDrop(step.id, event)}
                onDragEnd={onStepDragEnd}
                style={{
                  border: `1px solid ${palette.border}`,
                  borderRadius: 8,
                  padding: 8,
                  marginBottom: 8,
                  background: step.id === selectedStep?.id ? palette.surfaceAlt : palette.surface,
                  boxShadow:
                    dragState.overId === step.id
                      ? `inset 0 ${dragState.placement === "before" ? "2" : "-2"}px 0 ${palette.accent}`
                      : "none"
                }}
              >
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <span style={{ color: palette.textSoft, cursor: "grab", userSelect: "none", fontSize: 13 }} title="Drag to reorder">
                    Drag
                  </span>
                  <button
                    type="button"
                    onClick={() => setSelectedId(step.id)}
                    style={{ width: "100%", textAlign: "left", border: 0, background: "transparent", padding: 0, cursor: "pointer", color: palette.text, fontWeight: 600 }}
                  >
                    #{step.stepIndex} {step.title}
                  </button>
                </div>
                <div style={{ marginTop: 6, display: "flex", gap: 6 }}>
                  <button type="button" onClick={() => moveStep(step.id, -1)} disabled={idx === 0} style={buttonStyle(palette, idx === 0)}>
                    Up
                  </button>
                  <button
                    type="button"
                    onClick={() => moveStep(step.id, 1)}
                    disabled={idx === payload.steps.length - 1}
                    style={buttonStyle(palette, idx === payload.steps.length - 1)}
                  >
                    Down
                  </button>
                  <button type="button" onClick={() => deleteStep(step.id)} style={{ ...buttonStyle(palette, false), color: "#ef4444" }}>
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </aside>

          <article style={{ border: `1px solid ${palette.border}`, background: palette.surface, borderRadius: 10, padding: 12, minWidth: 0 }}>
            {!selectedStep ? (
              <p style={{ color: palette.textSoft }}>Select a step.</p>
            ) : (
              <>
                <h2 style={{ marginTop: 0 }}>Step #{selectedStep.stepIndex}</h2>

                <label htmlFor="title" style={{ display: "block", fontWeight: 600 }}>Title</label>
                <input
                  id="title"
                  value={selectedStep.title}
                  onChange={(event) => updateStep(selectedStep.id, { title: event.target.value })}
                  style={{ width: "100%", marginTop: 4, marginBottom: 10, padding: 8, borderRadius: 8, border: `1px solid ${palette.border}`, background: palette.surfaceAlt, color: palette.text }}
                />

                <label htmlFor="instruction" style={{ display: "block", fontWeight: 600 }}>Instruction</label>
                <textarea
                  id="instruction"
                  rows={3}
                  value={selectedStep.instruction}
                  onChange={(event) => updateStep(selectedStep.id, { instruction: event.target.value })}
                  style={{ width: "100%", marginTop: 4, marginBottom: 10, borderRadius: 8, border: `1px solid ${palette.border}`, background: palette.surfaceAlt, color: palette.text }}
                />

                <label htmlFor="note" style={{ display: "block", fontWeight: 600 }}>Note (optional)</label>
                <textarea
                  id="note"
                  rows={2}
                  value={selectedStep.note}
                  onChange={(event) => updateStep(selectedStep.id, { note: event.target.value })}
                  style={{ width: "100%", marginTop: 4, marginBottom: 10, borderRadius: 8, border: `1px solid ${palette.border}`, background: palette.surfaceAlt, color: palette.text }}
                />

                {selectedStep.thumbnailDataUrl ? (
                  <>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                      <h3 style={{ margin: 0 }}>Screenshot Annotation</h3>
                      <div style={{ display: "flex", gap: 8 }}>
                        <button
                          type="button"
                          onClick={() => setAnnotationMode((prev) => !prev)}
                          style={{
                            ...buttonStyle(palette, false),
                            background: annotationMode ? palette.accent : palette.surface,
                            color: annotationMode ? "#ffffff" : palette.text
                          }}
                        >
                          {annotationMode ? "Drawing On" : "Draw Highlight"}
                        </button>
                        <button type="button" onClick={() => deleteAnnotation(selectedStep.id, activeAnnotationId)} style={buttonStyle(palette, !activeAnnotationId)} disabled={!activeAnnotationId}>
                          Delete Highlight
                        </button>
                      </div>
                    </div>

                    <div
                      ref={screenshotRef}
                      onMouseDown={onScreenshotMouseDown}
                      style={{
                        position: "relative",
                        border: `1px solid ${palette.border}`,
                        borderRadius: 8,
                        overflow: "hidden",
                        marginBottom: 10,
                        cursor: annotationMode ? "crosshair" : "default",
                        userSelect: "none"
                      }}
                    >
                      <img src={selectedStep.thumbnailDataUrl} alt="Step screenshot" style={{ width: "100%", display: "block" }} />
                      {(selectedStep.annotations ?? []).map((annotation) => (
                        <button
                          key={annotation.id}
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            setActiveAnnotationId(annotation.id);
                          }}
                          style={{
                            position: "absolute",
                            left: `${annotation.x * 100}%`,
                            top: `${annotation.y * 100}%`,
                            width: `${annotation.width * 100}%`,
                            height: `${annotation.height * 100}%`,
                            border: `2px solid ${annotation.id === activeAnnotationId ? "#fbbf24" : palette.accent}`,
                            background: "rgba(59, 130, 246, 0.15)",
                            borderRadius: 4
                          }}
                          title={annotation.label || "Highlight"}
                        />
                      ))}
                      {draftAnnotation ? (
                        <div
                          style={{
                            position: "absolute",
                            left: `${draftAnnotation.x * 100}%`,
                            top: `${draftAnnotation.y * 100}%`,
                            width: `${draftAnnotation.width * 100}%`,
                            height: `${draftAnnotation.height * 100}%`,
                            border: `2px dashed ${palette.accent}`,
                            background: "rgba(59, 130, 246, 0.12)",
                            borderRadius: 4,
                            pointerEvents: "none"
                          }}
                        />
                      ) : null}
                    </div>

                    {activeAnnotation ? (
                      <>
                        <label htmlFor="highlight-label" style={{ display: "block", fontWeight: 600 }}>
                          Highlight Label
                        </label>
                        <input
                          id="highlight-label"
                          value={activeAnnotation.label}
                          onChange={(event) => upsertAnnotation(selectedStep.id, activeAnnotation.id, { label: event.target.value })}
                          placeholder="e.g. Team Members tab"
                          style={{ width: "100%", marginTop: 4, marginBottom: 10, padding: 8, borderRadius: 8, border: `1px solid ${palette.border}`, background: palette.surfaceAlt, color: palette.text }}
                        />
                      </>
                    ) : (
                      <p style={{ marginTop: 4, marginBottom: 10, color: palette.textSoft, fontSize: 14 }}>
                        {annotationMode ? "Drag on the screenshot to draw a highlight." : "Enable drawing to add a new highlight box."}
                      </p>
                    )}
                  </>
                ) : (
                  <p style={{ marginTop: 0, color: palette.textSoft, fontSize: 14 }}>
                    This step has no screenshot thumbnail yet. Capture with thumbnails enabled to annotate visually.
                  </p>
                )}

                <h3 style={{ marginBottom: 6 }}>Step Metadata</h3>
                <pre
                  style={{
                    margin: 0,
                    background: palette.surfaceAlt,
                    border: `1px solid ${palette.border}`,
                    color: palette.textSoft,
                    padding: 10,
                    borderRadius: 6,
                    overflow: "auto",
                    maxHeight: 260,
                    whiteSpace: "pre-wrap",
                    overflowWrap: "anywhere"
                  }}
                >
                  {JSON.stringify(selectedStep, null, 2)}
                </pre>
              </>
            )}
          </article>
        </section>
      )}
    </main>
  );
}
