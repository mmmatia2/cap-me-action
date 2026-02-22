import { useEffect, useMemo, useRef, useState } from "react";
import { APP_SCHEMA_VERSION, buildSessionExport, migrateSessionPayload } from "./lib/migrations";
import { deleteStepById, moveStepInList, patchStepById, resequenceSteps } from "./editor/state/sessionReducer";
import { StepList } from "./editor/components/StepList";
import { StepDetails } from "./editor/components/StepDetails";
import { AnnotationCanvas } from "./editor/components/AnnotationCanvas";
import { ExportPanel } from "./editor/components/ExportPanel";
import { Download, UploadCloud, Cloud, Moon, Sun, MonitorSmartphone, Share2, Trash2, GripVertical, FileCode2, FileText, FileJson } from "lucide-react";
import jsPDF from "jspdf";
import "jspdf-autotable";

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
  const [annotationMode, setAnnotationMode] = useState(null);
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
        label: "",
        type: annotationMode || "highlight"
      };
      patchStep(stepId, (step) => ({
        ...step,
        annotations: [...(step.annotations ?? []), annotation]
      }));
      setActiveAnnotationId(annotation.id);
      setAnnotationMode(null);
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

  function exportPdf() {
    if (!payload) return;
    try {
      const doc = new jsPDF();
      const title = payload.session.lastTitle || payload.session.startTitle || "Scribe Clone Export";
      
      // Title
      doc.setFontSize(24);
      doc.text(title, 14, 20);
      
      // Metadata
      doc.setFontSize(10);
      doc.setTextColor(100);
      doc.text(`${payload.steps.length} steps • Created on ${new Date(payload.session.startedAt || Date.now()).toLocaleDateString()}`, 14, 30);

      // Reset text color
      doc.setTextColor(0);

      let yPos = 45;
      const margin = 14;
      const pageWidth = doc.internal.pageSize.width;
      const contentWidth = pageWidth - (margin * 2);

      payload.steps.forEach((step, index) => {
        // Add new page if we're near the bottom
        if (yPos > doc.internal.pageSize.height - 40) {
          doc.addPage();
          yPos = 20;
        }

        // Step number and title
        doc.setFontSize(14);
        doc.setFont(undefined, 'bold');
        const stepTitle = `${step.stepIndex}. ${step.title || 'Untitled Step'}`;
        const titleLines = doc.splitTextToSize(stepTitle, contentWidth);
        doc.text(titleLines, margin, yPos);
        yPos += (titleLines.length * 7) + 2;

        // Step instruction
        if (step.instruction) {
          doc.setFontSize(11);
          doc.setFont(undefined, 'normal');
          const instructionLines = doc.splitTextToSize(step.instruction, contentWidth);
          doc.text(instructionLines, margin, yPos);
          yPos += (instructionLines.length * 6) + 4;
        }

        // Step note
        if (step.note) {
          doc.setFontSize(10);
          doc.setTextColor(100);
          const noteLines = doc.splitTextToSize(step.note, contentWidth - 10);
          doc.text(noteLines, margin + 5, yPos);
          doc.setTextColor(0);
          yPos += (noteLines.length * 5) + 4;
        }

        // We can't easily embed images without loading them first and converting to base64
        // If the thumbnailDataUrl is a data URL, we could theoretically embed it, but for now
        // we'll just leave a placeholder or skip it since handling arbitrary URLs in jsPDF is tricky
        yPos += 10;
      });

      doc.save(`${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.pdf`);
    } catch (err) {
      console.error("PDF export failed:", err);
      alert("Failed to generate PDF. See console for details.");
    }
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
    <main className="min-h-screen bg-bg text-text font-sans flex flex-col">
      <header className="sticky top-0 z-10 bg-surface border-b border-border shadow-sm px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-accent text-white flex items-center justify-center font-bold">
            S
          </div>
          <div>
            <h1 className="text-lg font-bold leading-tight m-0">Scribe Clone Editor</h1>
            <p className="text-xs text-muted m-0">Organize, annotate, and export your captured workflows</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <button 
            type="button" 
            onClick={() => setTheme((t) => (t === "dark" ? "light" : "dark"))}
            className="p-2 rounded-full text-muted hover:text-text hover:bg-surface-2 transition-colors"
            title="Toggle theme"
          >
            {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
          </button>
          
          <div className="h-6 w-px bg-border mx-1" />

          {payload && (
            <ExportPanel 
              disabled={!payload}
              onJson={exportJson}
              onMarkdown={exportMarkdown}
              onHtml={exportHtml}
              onPdf={exportPdf}
            />
          )}
        </div>
      </header>

      <div className="flex-1 flex flex-col overflow-hidden max-w-[1400px] w-full mx-auto px-6 py-6">
        {!payload && (
          <div className="bg-surface border border-border rounded-xl p-6 mb-6 shadow-sm flex flex-col gap-5">
            <h2 className="text-base font-semibold m-0 flex items-center gap-2">
              <UploadCloud size={18} className="text-accent" />
              Import Session
            </h2>
            
            <div className="flex flex-wrap gap-4 items-end">
              <div className="flex flex-col gap-1.5">
                <label htmlFor="dataSource" className="text-xs font-semibold text-muted uppercase tracking-wider">
                  Source
                </label>
                <select
                  id="dataSource"
                  value={dataSource}
                  onChange={(event) => setDataSource(event.target.value)}
                  className="px-3 py-2 rounded-lg border border-border bg-surface-2 text-text focus:outline-none focus:border-accent min-w-[160px]"
                >
                  <option value="local">Local (Extension)</option>
                  <option value="team">Team Library</option>
                </select>
              </div>

              {dataSource === "local" ? (
                <div className="flex flex-wrap gap-3 items-end w-full">
                  <button 
                    type="button" 
                    onClick={loadFromExtensionStorage} 
                    className="px-4 py-2 bg-surface text-text border border-border rounded-lg hover:bg-surface-2 font-medium text-sm transition-colors flex items-center gap-2"
                  >
                    <MonitorSmartphone size={16} />
                    Load From Extension
                  </button>
                  <select
                    value={selectedExtensionSessionId}
                    onChange={(event) => setSelectedExtensionSessionId(event.target.value)}
                    className="px-3 py-2 rounded-lg border border-border bg-surface-2 text-text focus:outline-none focus:border-accent min-w-[280px]"
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
                  <button 
                    type="button" 
                    onClick={importSelectedExtensionSession} 
                    disabled={!selectedExtensionSessionId}
                    className="px-4 py-2 bg-accent text-white rounded-lg hover:bg-accent/90 disabled:opacity-50 disabled:cursor-not-allowed font-medium text-sm transition-colors"
                  >
                    Import Selected
                  </button>
                </div>
              ) : (
                <div className="flex flex-wrap gap-3 items-end w-full">
                  <div className="flex flex-col gap-1.5 flex-1 min-w-[240px]">
                    <label className="text-xs font-semibold text-muted uppercase tracking-wider">Endpoint URL</label>
                    <input
                      type="text"
                      value={teamApiBase}
                      placeholder="Apps Script endpoint URL"
                      onChange={(event) => setTeamApiBase(event.target.value)}
                      className="w-full px-3 py-2 rounded-lg border border-border bg-surface-2 text-text focus:outline-none focus:border-accent"
                    />
                  </div>
                  <div className="flex flex-col gap-1.5 flex-1 min-w-[200px]">
                    <label className="text-xs font-semibold text-muted uppercase tracking-wider">Bearer Token</label>
                    <input
                      type="password"
                      value={teamAccessToken}
                      placeholder="(optional)"
                      onChange={(event) => setTeamAccessToken(event.target.value)}
                      className="w-full px-3 py-2 rounded-lg border border-border bg-surface-2 text-text focus:outline-none focus:border-accent"
                    />
                  </div>
                  <button 
                    type="button" 
                    onClick={loadFromTeamLibrary} 
                    className="px-4 py-2 bg-surface text-text border border-border rounded-lg hover:bg-surface-2 font-medium text-sm transition-colors flex items-center gap-2"
                  >
                    <Cloud size={16} />
                    Load Library
                  </button>
                  <select
                    value={selectedTeamSessionId}
                    onChange={(event) => setSelectedTeamSessionId(event.target.value)}
                    className="px-3 py-2 rounded-lg border border-border bg-surface-2 text-text focus:outline-none focus:border-accent min-w-[240px]"
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
                  <button 
                    type="button" 
                    onClick={importSelectedTeamSession} 
                    disabled={!selectedTeamSessionId}
                    className="px-4 py-2 bg-accent text-white rounded-lg hover:bg-accent/90 disabled:opacity-50 disabled:cursor-not-allowed font-medium text-sm transition-colors"
                  >
                    Import Team Session
                  </button>
                </div>
              )}
            </div>

            <div className="flex items-center gap-4 pt-4 border-t border-border">
              <span className="text-sm text-muted font-medium">Or upload JSON file directly:</span>
              <input
                type="file"
                accept=".json,application/json"
                onChange={onFileSelected}
                className="text-sm text-muted file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-surface-2 file:text-text hover:file:bg-surface-2/80 cursor-pointer"
              />
            </div>
            
            {(extensionStatus || teamStatus) && (
              <p className="text-sm text-accent m-0 bg-accent/10 px-3 py-2 rounded-md border border-accent/20">
                {dataSource === "local" ? extensionStatus : teamStatus}
              </p>
            )}
          </div>
        )}

        {error && (
          <div className="mb-6 p-4 rounded-xl bg-danger/10 border border-danger/20 text-danger text-sm font-medium flex items-center gap-2">
            <span className="w-5 h-5 rounded-full bg-danger/20 flex items-center justify-center font-bold">!</span>
            {error}
          </div>
        )}

        {payload && (
          <div className="flex-1 flex gap-6 min-h-0">
            {/* Sidebar List */}
            <aside className="w-[380px] flex-shrink-0 flex flex-col bg-surface border border-border rounded-xl shadow-sm overflow-hidden">
              <div className="p-4 border-b border-border bg-surface flex justify-between items-center">
                <h2 className="text-base font-bold m-0 text-text truncate pr-4">
                  {payload.session.lastTitle || payload.session.startTitle || payload.session.id}
                </h2>
                <span className="text-xs font-semibold bg-surface-2 text-muted px-2 py-1 rounded-md whitespace-nowrap">
                  {payload.steps.length} steps
                </span>
              </div>
              <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
                <StepList 
                  steps={payload.steps}
                  selectedId={selectedId}
                  onSelect={setSelectedId}
                  onMove={moveStep}
                  onDelete={deleteStep}
                  onMergeWithNext={mergeStepWithNext}
                  onDragStart={onStepDragStart}
                  onDragOver={onStepDragOver}
                  onDrop={onStepDrop}
                  onDragEnd={onStepDragEnd}
                  dragState={dragState}
                />
              </div>
            </aside>

            {/* Main Content Area */}
            <article className="flex-1 flex flex-col bg-surface border border-border rounded-xl shadow-sm overflow-y-auto custom-scrollbar relative">
              {!selectedStep ? (
                <div className="flex-1 flex flex-col items-center justify-center text-muted p-12 text-center">
                  <div className="w-16 h-16 rounded-2xl bg-surface-2 flex items-center justify-center mb-4 border border-border">
                    <MonitorSmartphone size={32} className="opacity-50" />
                  </div>
                  <h3 className="text-lg font-semibold text-text mb-2">No Step Selected</h3>
                  <p className="max-w-md">Select a step from the sidebar to edit its title, instructions, and annotate its screenshot.</p>
                </div>
              ) : (
                <div className="p-8 max-w-3xl mx-auto w-full flex flex-col gap-8">
                  <div className="flex items-center gap-3 border-b border-border pb-4">
                    <span className="w-8 h-8 rounded-full bg-accent/10 text-accent flex items-center justify-center font-bold text-sm">
                      {selectedStep.stepIndex}
                    </span>
                    <h2 className="text-xl font-bold m-0 text-text">Edit Step</h2>
                  </div>

                  <StepDetails 
                    title={selectedStep.title}
                    instruction={selectedStep.instruction}
                    note={selectedStep.note}
                    onChange={(patch) => updateStep(selectedStep.id, patch)}
                  />

                  <div className="pt-6 border-t border-border">
                    <div className="flex justify-between items-end mb-4">
                      <div>
                        <h3 className="text-base font-semibold m-0 text-text">Screenshot</h3>
                        <p className="text-sm text-muted m-0 mt-1">Annotate important areas visually</p>
                      </div>
                      <div className="flex gap-2">
                        {selectedStep.thumbnailDataUrl && (
                          <>
                            <button
                              type="button"
                              onClick={() => setAnnotationMode((prev) => prev === "highlight" ? null : "highlight")}
                              className={`px-3 py-1.5 rounded-lg font-medium text-sm transition-colors border shadow-sm
                                ${annotationMode === "highlight"
                                  ? "bg-accent text-white border-accent" 
                                  : "bg-surface-2 text-text border-border hover:border-muted"}`}
                            >
                              Highlight
                            </button>
                            <button
                              type="button"
                              onClick={() => setAnnotationMode((prev) => prev === "redact" ? null : "redact")}
                              className={`px-3 py-1.5 rounded-lg font-medium text-sm transition-colors border shadow-sm
                                ${annotationMode === "redact"
                                  ? "bg-accent text-white border-accent" 
                                  : "bg-surface-2 text-text border-border hover:border-muted"}`}
                            >
                              Redact
                            </button>
                          </>
                        )}
                        {activeAnnotationId && (
                          <button 
                            type="button" 
                            onClick={() => deleteAnnotation(selectedStep.id, activeAnnotationId)}
                            className="px-3 py-1.5 rounded-lg font-medium text-sm bg-danger/10 text-danger border border-danger/20 hover:bg-danger/20 transition-colors shadow-sm flex items-center gap-1.5"
                          >
                            <Trash2 size={14} />
                            Remove
                          </button>
                        )}
                      </div>
                    </div>

                    {selectedStep.thumbnailDataUrl ? (
                      <div className="relative">
                        <AnnotationCanvas 
                          imageUrl={selectedStep.thumbnailDataUrl}
                          annotations={selectedStep.annotations ?? []}
                          activeAnnotationId={activeAnnotationId}
                          onAnnotationClick={(id, e) => {
                            e.stopPropagation();
                            setActiveAnnotationId(id);
                          }}
                          draftAnnotation={draftAnnotation}
                          onMouseDown={onScreenshotMouseDown}
                          annotationMode={annotationMode}
                          screenshotRef={screenshotRef}
                        />

                        {activeAnnotation && activeAnnotation.type !== "redact" ? (
                          <div className="mt-4 bg-surface-2 p-4 rounded-xl border border-border">
                            <label htmlFor="highlight-label" className="text-sm font-semibold text-text block mb-1.5">
                              Highlight Label
                            </label>
                            <input
                              id="highlight-label"
                              value={activeAnnotation.label || ""}
                              onChange={(event) => upsertAnnotation(selectedStep.id, activeAnnotation.id, { label: event.target.value })}
                              placeholder="e.g. Click the 'Save' button"
                              className="w-full px-3 py-2 bg-surface border border-border rounded-lg text-text focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-all"
                            />
                          </div>
                        ) : (
                          <p className="text-sm text-muted bg-surface-2 p-3 rounded-lg border border-border text-center">
                            {annotationMode ? "Drag a rectangle on the image to draw." : "Click a tool above to add boxes, or select an existing one to edit."}
                          </p>
                        )}
                      </div>
                    ) : (
                      <div className="bg-surface-2 p-8 rounded-xl border border-border text-center flex flex-col items-center justify-center text-muted gap-3">
                        <MonitorSmartphone size={32} className="opacity-40" />
                        <p className="m-0 text-sm">No screenshot available for this step.</p>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </article>
          </div>
        )}
      </div>
    </main>
  );
}
