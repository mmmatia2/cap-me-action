import { useEffect, useMemo, useRef, useState } from "react";
import { APP_SCHEMA_VERSION, buildSessionExport, migrateSessionPayload } from "./lib/migrations";
import {
  APP_BRIDGE_CHANNEL,
  APP_BRIDGE_REQUEST_TYPES,
  APP_BRIDGE_RESPONSE_TYPES,
  TEAM_SYNC_BACKEND_ACTIONS,
  TEAM_SYNC_AUTH_ERROR_CODES,
  TEAM_SYNC_PROTOCOL_VERSION
} from "./lib/protocol";
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

function normalizeAnnotationType(value) {
  return value === "redact" ? "redact" : "highlight";
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
        label: normalizeText(annotation.label || ""),
        type: normalizeAnnotationType(annotation.type)
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
        .filter((ann) => ann?.type !== "redact")
        .map((ann, idx) => ann.label || `Highlight ${idx + 1}`)
        .join(", ");
      const redactionCount = step.annotations.filter((ann) => ann?.type === "redact").length;
      if (highlights) {
        lines.push(`Highlights: ${highlights}`);
      }
      if (redactionCount > 0) {
        lines.push(`Redactions: ${redactionCount}`);
      }
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
                    const annotationType = ann?.type === "redact" ? "redact" : "highlight";
                    const label = escapeHtml(
                      ann?.label || (annotationType === "redact" ? `Redaction ${idx + 1}` : `Highlight ${idx + 1}`)
                    );
                    const className =
                      annotationType === "redact"
                        ? "shot-highlight shot-redaction"
                        : "shot-highlight";
                    return `<div class="${className}" style="left:${(x * 100).toFixed(3)}%;top:${(y * 100).toFixed(3)}%;width:${(width * 100).toFixed(3)}%;height:${(height * 100).toFixed(3)}%;">
                        ${annotationType === "redact" ? "" : `<span class="shot-highlight-label">${label}</span>`}
                      </div>`;
                  })
                  .join("")}
              </div>
            </figure>`
          : "";
      const annotationList = Array.isArray(step.annotations) ? step.annotations : [];
      const highlightLabels = annotationList
        .filter((ann) => ann?.type !== "redact")
        .map((ann, idx) => ann.label || `Highlight ${idx + 1}`);
      const redactionCount = annotationList.filter((ann) => ann?.type === "redact").length;
      const highlights = highlightLabels.length
        ? `<p class="note"><strong>Highlights:</strong> ${escapeHtml(highlightLabels.join(", "))}</p>`
        : "";
      const redactions = redactionCount
        ? `<p class="note"><strong>Redactions:</strong> ${redactionCount}</p>`
        : "";
      return `
        <section class="step">
          <h2>${step.stepIndex}. ${escapeHtml(step.title)}</h2>
          <p>${escapeHtml(step.instruction || "")}</p>
          ${screenshot}
          ${note}
          ${url}
          ${highlights}
          ${redactions}
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
      .shot-redaction { border: none; background: rgba(15, 23, 42, 0.86); backdrop-filter: blur(2px); }
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
      bg: "#edf2f7",
      surface: "#ffffff",
      surfaceAlt: "#f5f8fb",
      border: "#ccd6e2",
      text: "#16202b",
      textSoft: "#627487",
      accent: "#24599b"
    };
  }

  return {
    bg: "#17212b",
    surface: "#1d2935",
    surfaceAlt: "#243240",
    border: "#334759",
    text: "#edf3f8",
    textSoft: "#9fb0c0",
    accent: "#78a6d8"
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
      if (!data || data.channel !== APP_BRIDGE_CHANNEL || data.type !== APP_BRIDGE_RESPONSE_TYPES.sessions) {
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
    window.postMessage(
      {
        channel: APP_BRIDGE_CHANNEL,
        type: APP_BRIDGE_REQUEST_TYPES.sessions,
        requestId,
        protocolVersion: TEAM_SYNC_PROTOCOL_VERSION
      },
      "*"
    );
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

function loadTeamAuthViaPageBridge(timeoutMs = 1500) {
  return new Promise((resolve) => {
    const requestId = `cap_me_team_auth_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
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
      if (!data || data.channel !== APP_BRIDGE_CHANNEL || data.type !== APP_BRIDGE_RESPONSE_TYPES.teamAuth) {
        return;
      }
      if (data.requestId !== requestId) {
        return;
      }
      finish({
        ok: Boolean(data.ok),
        token: data.token ? String(data.token) : "",
        error: data.error ? String(data.error) : null
      });
    };

    const timer = setTimeout(() => {
      finish({ ok: false, token: "", error: TEAM_SYNC_AUTH_ERROR_CODES.extensionUnavailable });
    }, timeoutMs);

    window.addEventListener("message", onMessage);
    window.postMessage(
      {
        channel: APP_BRIDGE_CHANNEL,
        type: APP_BRIDGE_REQUEST_TYPES.teamAuth,
        requestId,
        protocolVersion: TEAM_SYNC_PROTOCOL_VERSION
      },
      "*"
    );
  });
}

function normalizeTeamAuthErrorCode(value) {
  const text = normalizeText(value).toUpperCase().replace(/[^A-Z0-9]+/g, "_");
  if (!text || text === "TOKEN_UNAVAILABLE") {
    return TEAM_SYNC_AUTH_ERROR_CODES.tokenUnavailable;
  }
  if (text === "BRIDGE_TIMEOUT") {
    return TEAM_SYNC_AUTH_ERROR_CODES.extensionUnavailable;
  }
  return text;
}

function explainTeamFailure(errorCode) {
  const code = normalizeTeamAuthErrorCode(errorCode);
  switch (code) {
    case TEAM_SYNC_AUTH_ERROR_CODES.extensionUnavailable:
      return {
        type: "bridge_unavailable",
        message: "Extension auth bridge unavailable. Reload the extension and open the editor from the extension flow."
      };
    case TEAM_SYNC_AUTH_ERROR_CODES.authUnavailable:
      return {
        type: "auth_unavailable",
        message: "Extension auth is unavailable. Confirm the extension is loaded with identity permissions."
      };
    case TEAM_SYNC_AUTH_ERROR_CODES.authRequired:
      return {
        type: "auth_required",
        message: "You are not signed in for team sync. Sign in from the extension inspector, then retry."
      };
    case TEAM_SYNC_AUTH_ERROR_CODES.authDenied:
      return {
        type: "auth_denied",
        message: "Team auth was denied. Re-run Sign In from the extension inspector and approve access."
      };
    case TEAM_SYNC_AUTH_ERROR_CODES.tokenExpired:
      return {
        type: "token_expired",
        message: "Team auth token expired. Sign out and sign in again from the extension inspector."
      };
    case TEAM_SYNC_AUTH_ERROR_CODES.tokenUnavailable:
      return {
        type: "token_unavailable",
        message: "No sync access token is available from the extension background."
      };
    default:
      return {
        type: "backend_library_failure",
        message: `Team library/backend request failed (${code || "UNKNOWN_ERROR"}). Verify endpoint/deployment and retry.`
      };
  }
}

function parseEditorHandoffFromUrl() {
  if (typeof window === "undefined") {
    return { source: "local", sessionId: "" };
  }

  const params = new URLSearchParams(window.location.search || "");
  const sourceRaw = normalizeText(params.get("source")).toLowerCase();
  const source = sourceRaw === "team" ? "team" : "local";
  const sessionId = normalizeText(params.get("sessionId"));
  return { source, sessionId };
}

export default function App() {
  const [payload, setPayload] = useState(null);
  const [error, setError] = useState("");
  const [selectedId, setSelectedId] = useState(null);
  const [theme, setTheme] = useState("light");
  const [extensionSessions, setExtensionSessions] = useState([]);
  const [extensionSteps, setExtensionSteps] = useState([]);
  const [selectedExtensionSessionId, setSelectedExtensionSessionId] = useState("");
  const [extensionStatus, setExtensionStatus] = useState("");
  const [dataSource, setDataSource] = useState("local");
  const [teamApiBase, setTeamApiBase] = useState("");
  const [teamSessions, setTeamSessions] = useState([]);
  const [selectedTeamSessionId, setSelectedTeamSessionId] = useState("");
  const [teamStatus, setTeamStatus] = useState("");
  const [dragState, setDragState] = useState({ dragId: "", overId: "", placement: "after" });
  const [annotationMode, setAnnotationMode] = useState(null);
  const [draftAnnotation, setDraftAnnotation] = useState(null);
  const [activeAnnotationId, setActiveAnnotationId] = useState("");
  const [handoff] = useState(() => parseEditorHandoffFromUrl());
  const screenshotRef = useRef(null);
  const handoffAttemptedRef = useRef(false);
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
    window.localStorage.removeItem("cap_me_team_api_token");
  }, []);

  useEffect(() => {
    if (teamApiBase) {
      window.localStorage.setItem("cap_me_team_api_base", teamApiBase);
    }
  }, [teamApiBase]);

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

  useEffect(() => {
    const requestedSessionId = handoff.sessionId;
    if (!requestedSessionId || handoffAttemptedRef.current) {
      return;
    }

    if (handoff.source === "team" && !teamApiBase) {
      setDataSource("team");
      setTeamStatus(
        `Deep link detected for team session ${requestedSessionId}. Configure endpoint URL to continue.`
      );
      return;
    }

    handoffAttemptedRef.current = true;

    const run = async () => {
      if (handoff.source === "team") {
        setDataSource("team");
        setTeamStatus(`Deep link detected. Loading team session ${requestedSessionId}...`);
        const loaded = await loadFromTeamLibrary(requestedSessionId);
        if (!loaded.ok) {
          return;
        }
        await importTeamSessionById(requestedSessionId, {
          notFoundMessage: `Requested team session ${requestedSessionId} was not found in team library.`
        });
        return;
      }

      setDataSource("local");
      setExtensionStatus(`Deep link detected. Loading extension session ${requestedSessionId}...`);
      const loaded = await loadFromExtensionStorage(requestedSessionId);
      if (!loaded.ok) {
        return;
      }
      importExtensionSessionById(requestedSessionId, loaded.sessions, loaded.steps, {
        notFoundMessage: `Requested extension session ${requestedSessionId} was not found in extension storage.`
      });
    };

    void run();
  }, [handoff, teamApiBase]);

  function applyImportedPayload(parsed) {
    const migrated = migrateSessionPayload(parsed);
    const normalized = normalizePayload(migrated);
    setPayload(normalized);
    setSelectedId(normalized.steps[0]?.id || null);
    setError("");
    return normalized;
  }

  function onFileSelected(event) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result || "{}"));
        applyImportedPayload(parsed);
      } catch (err) {
        setPayload(null);
        setSelectedId(null);
        setError(err instanceof Error ? err.message : "Invalid JSON file.");
      }
    };
    reader.readAsText(file);
  }

  async function loadBundledSample() {
    try {
      const response = await fetch("/samples/local-smoke-session.json", { method: "GET" });
      if (!response.ok) {
        throw new Error(`Sample file unavailable (HTTP_${response.status})`);
      }
      const parsed = await response.json();
      const normalized = applyImportedPayload(parsed);
      setDataSource("local");
      setExtensionStatus(`Loaded bundled sample ${normalized.session.id}.`);
    } catch (err) {
      setPayload(null);
      setSelectedId(null);
      setError(err instanceof Error ? err.message : "Failed to load bundled sample.");
    }
  }

  useEffect(() => {
    if (handoff.sessionId || payload) {
      return;
    }
    const params = new URLSearchParams(window.location.search || "");
    const sample = normalizeText(params.get("sample")).toLowerCase();
    if (sample === "1" || sample === "true") {
      void loadBundledSample();
    }
  }, [handoff.sessionId, payload]);

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

  function mergeStepWithNext(stepId) {
    setPayload((prev) => {
      if (!prev) {
        return prev;
      }

      const index = prev.steps.findIndex((step) => step.id === stepId);
      if (index < 0 || index >= prev.steps.length - 1) {
        return prev;
      }

      const current = prev.steps[index];
      const next = prev.steps[index + 1];
      if (!current || !next) {
        return prev;
      }

      const mergedInstruction = [normalizeText(current.instruction), normalizeText(next.instruction)]
        .filter(Boolean)
        .join(" ");
      const mergedNote = [normalizeText(current.note), normalizeText(next.note)]
        .filter(Boolean)
        .join("\n");

      const merged = {
        ...current,
        title: normalizeText(current.title) || normalizeText(next.title) || "Merged step",
        instruction: mergedInstruction || normalizeText(current.instruction) || normalizeText(next.instruction),
        note: mergedNote,
        pageTitle: current.pageTitle || next.pageTitle || "",
        url: current.url || next.url || "",
        thumbnailDataUrl: current.thumbnailDataUrl || next.thumbnailDataUrl || null,
        annotations: [...(current.annotations ?? []), ...(next.annotations ?? [])]
      };

      const steps = [...prev.steps];
      steps.splice(index, 2, merged);
      return { ...prev, steps: resequenceSteps(steps) };
    });
    setSelectedId(stepId);
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
      const title = payload.session.lastTitle || payload.session.startTitle || "Cap Me Action Export";
      
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

  async function loadFromExtensionStorage(preferredSessionId = "") {
    try {
      let sessions = [];
      let steps = [];

      if (hasExtensionStorage) {
        const result = await new Promise((resolve) =>
          chrome.storage.local.get(["sessions", "steps"], resolve)
        );
        sessions = (result.sessions ?? []).sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0));
        steps = result.steps ?? [];
      } else {
        const response = await loadSessionsViaPageBridge();
        if (!response.ok) {
          setExtensionStatus(
            "Extension bridge unavailable. Reload extension, refresh this page, then try again."
          );
          return { ok: false, sessions: [], steps: [], error: response.error ?? "bridge_unavailable" };
        }
        sessions = [...response.sessions].sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0));
        steps = response.steps ?? [];
      }

      const preferred = String(preferredSessionId || "").trim();
      const selected =
        preferred && sessions.some((session) => session.id === preferred)
          ? preferred
          : sessions[0]?.id ?? "";

      setExtensionSessions(sessions);
      setExtensionSteps(steps);
      setSelectedExtensionSessionId(selected);
      setExtensionStatus(
        sessions.length
          ? `Loaded ${sessions.length} session(s) from extension.`
          : "No sessions found in extension storage."
      );
      return { ok: true, sessions, steps, error: null };
    } catch (err) {
      setExtensionStatus(`Extension load failed: ${err instanceof Error ? err.message : "unknown error"}`);
      return { ok: false, sessions: [], steps: [], error: "extension_load_failed" };
    }
  }

  function importExtensionSessionById(
    sessionId,
    sessions = extensionSessions,
    stepsPool = extensionSteps,
    options = {}
  ) {
    const session = sessions.find((x) => x.id === sessionId);
    if (!session) {
      setExtensionStatus(
        options.notFoundMessage || `Selected extension session ${sessionId} was not found.`
      );
      return false;
    }

    try {
      const steps = stepsPool
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
      setSelectedExtensionSessionId(session.id);
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Invalid extension payload.";
      setPayload(null);
      setSelectedId(null);
      setError(message);
      setExtensionStatus(`Extension import failed: ${message}`);
      return false;
    }
  }

  function importSelectedExtensionSession() {
    if (!selectedExtensionSessionId) {
      return;
    }
    importExtensionSessionById(selectedExtensionSessionId);
  }

  function buildTeamEndpoint(action, query = {}, accessToken = "") {
    const base = String(teamApiBase || "").trim();
    if (!base) {
      throw new Error("Team API endpoint is required.");
    }
    const url = new URL(base);
    url.searchParams.set("action", action);
    url.searchParams.set("protocolVersion", TEAM_SYNC_PROTOCOL_VERSION);
    const token = normalizeText(accessToken);
    if (token) {
      url.searchParams.set("accessToken", token);
    }
    Object.entries(query).forEach(([key, value]) => {
      if (value !== undefined && value !== null && String(value) !== "") {
        url.searchParams.set(key, String(value));
      }
    });
    return url.toString();
  }

  async function ensureTeamAccessToken() {
    const bridged = await loadTeamAuthViaPageBridge(1600);
    const token = normalizeText(bridged?.token || "");
    if (bridged?.ok && token) {
      return { ok: true, token, errorCode: null };
    }
    return {
      ok: false,
      token: "",
      errorCode: normalizeTeamAuthErrorCode(bridged?.error)
    };
  }

  async function loadFromTeamLibrary(preferredSessionId = "") {
    try {
      setTeamStatus("Loading team sessions...");
      const auth = await ensureTeamAccessToken();
      if (!auth.ok) {
        throw new Error(auth.errorCode || TEAM_SYNC_AUTH_ERROR_CODES.tokenUnavailable);
      }
      const response = await fetch(buildTeamEndpoint(TEAM_SYNC_BACKEND_ACTIONS.listSessions, { limit: 50 }, auth.token), {
        method: "GET"
      });
      const body = await response.json();
      if (!response.ok || body?.ok === false) {
        throw new Error(body?.errorCode || body?.error || `HTTP_${response.status}`);
      }

      const items = Array.isArray(body?.items) ? body.items : [];
      const preferred = String(preferredSessionId || "").trim();
      const selected =
        preferred &&
        items.some((session) => (session.sessionId || session.id) === preferred)
          ? preferred
          : items[0]?.sessionId ?? items[0]?.id ?? "";
      setTeamSessions(items);
      setSelectedTeamSessionId(selected);
      setTeamStatus(items.length ? `Loaded ${items.length} team session(s).` : "No team sessions found.");
      return { ok: true, items, error: null };
    } catch (err) {
      const code = normalizeTeamAuthErrorCode(err instanceof Error ? err.message : "unknown_error");
      const failure = explainTeamFailure(code);
      setTeamStatus(`Team load failed: ${failure.message}`);
      return { ok: false, items: [], error: code };
    }
  }

  async function importTeamSessionById(sessionId, options = {}) {
    if (!sessionId) {
      return false;
    }
    try {
      setTeamStatus("Importing team session...");
      const auth = await ensureTeamAccessToken();
      if (!auth.ok) {
        throw new Error(auth.errorCode || TEAM_SYNC_AUTH_ERROR_CODES.tokenUnavailable);
      }
      const response = await fetch(buildTeamEndpoint(TEAM_SYNC_BACKEND_ACTIONS.getSession, { sessionId }, auth.token), {
        method: "GET"
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
      setSelectedTeamSessionId(sessionId);
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : "unknown error";
      if (message.toLowerCase().includes("invalid sop payload contract")) {
        setPayload(null);
        setSelectedId(null);
        setError(message);
        setTeamStatus(`Team import failed: ${message}`);
        return false;
      }
      const code = normalizeTeamAuthErrorCode(err instanceof Error ? err.message : "unknown error");
      if (code === "SESSION_NOT_FOUND") {
        setTeamStatus(options.notFoundMessage || `Requested team session ${sessionId} was not found.`);
      } else {
        const failure = explainTeamFailure(code);
        setTeamStatus(`Team import failed: ${failure.message}`);
      }
      return false;
    }
  }

  async function importSelectedTeamSession() {
    if (!selectedTeamSessionId) {
      return;
    }
    await importTeamSessionById(selectedTeamSessionId);
  }

  return (
    <main className="app-shell flex flex-col">
      <header className="app-topbar">
        <div className="app-topbar__brand">
          <div className="app-topbar__mark">
            CM
          </div>
          <div>
            <h1 className="app-topbar__title">Cap Me Action Editor</h1>
            <p className="app-topbar__subtitle">Review, refine, and export captured operating procedures.</p>
          </div>
        </div>
        <div className="app-toolbar">
          <button 
            type="button" 
            onClick={() => setTheme((t) => (t === "dark" ? "light" : "dark"))}
            className="app-button app-button--quiet"
            title="Toggle theme"
          >
            {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
          </button>
          
          <div className="app-divider" />

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
          <div className="import-shell mb-6">
            <div className="import-shell__hero">
              <div>
                <p className="import-shell__eyebrow">Internal Workflow Editor</p>
                <h2 className="import-shell__title">Load a captured session</h2>
                <p className="import-shell__copy">
                  Start from extension storage, the hosted team library, or a direct JSON import. The editor is tuned
                  for internal procedure cleanup, not presentation polish.
                </p>
              </div>
              <div className="import-shell__badge">
                {dataSource === "local" ? "Local source" : "Team source"}
              </div>
            </div>
            
            <div className="import-grid">
              <div className="control-group">
                <label htmlFor="dataSource" className="field-label">
                  Source
                </label>
                <select
                  id="dataSource"
                  value={dataSource}
                  onChange={(event) => setDataSource(event.target.value)}
                  className="app-select min-w-[180px]"
                >
                  <option value="local">Local (Extension)</option>
                  <option value="team">Team Library</option>
                </select>
              </div>

              {dataSource === "local" ? (
                <div className="import-grid import-grid--local w-full">
                  <button 
                    type="button" 
                    onClick={loadFromExtensionStorage} 
                    className="app-button"
                  >
                    <MonitorSmartphone size={16} />
                    Load From Extension
                  </button>
                  <button
                    type="button"
                    onClick={loadBundledSample}
                    className="app-button"
                  >
                    <FileJson size={16} />
                    Load Sample SOP
                  </button>
                  <select
                    value={selectedExtensionSessionId}
                    onChange={(event) => setSelectedExtensionSessionId(event.target.value)}
                    className="app-select min-w-[300px]"
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
                    className="app-button app-button--primary"
                  >
                    Import Selected
                  </button>
                </div>
              ) : (
                <div className="import-grid import-grid--team w-full">
                  <div className="control-group flex-1 min-w-[240px]">
                    <label className="field-label">Endpoint URL</label>
                    <input
                      type="text"
                      value={teamApiBase}
                      placeholder="Apps Script endpoint URL"
                      onChange={(event) => setTeamApiBase(event.target.value)}
                      className="app-input"
                    />
                  </div>
                  <button 
                    type="button" 
                    onClick={loadFromTeamLibrary} 
                    className="app-button"
                  >
                    <Cloud size={16} />
                    Load Library
                  </button>
                  <select
                    value={selectedTeamSessionId}
                    onChange={(event) => setSelectedTeamSessionId(event.target.value)}
                    className="app-select min-w-[260px]"
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
                    className="app-button app-button--primary"
                  >
                    Import Team Session
                  </button>
                </div>
              )}
            </div>

            {dataSource === "team" && (
              <p className="import-note">
                Team Library auth comes from the loaded extension via the page bridge. Sign in from the extension inspector if team access is unavailable.
              </p>
            )}

            <div className="import-footer">
              <span className="import-footer__label">Direct JSON import</span>
              <input
                type="file"
                accept=".json,application/json"
                onChange={onFileSelected}
                className="app-file-input"
              />
            </div>
            
            {(extensionStatus || teamStatus) && (
              <p className="status-banner">
                {dataSource === "local" ? extensionStatus : teamStatus}
              </p>
            )}
          </div>
        )}

        {error && (
          <div className="status-banner status-banner--error mb-6 flex items-center gap-2">
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
