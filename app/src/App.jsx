import { useEffect, useMemo, useState } from "react";

// Purpose: provide a practical step editor for exported recorder sessions.
// Inputs: exported session JSON files, extension storage sessions, and in-app edits.
// Outputs: edited JSON export plus markdown/html procedure exports for team sharing.
function normalizeText(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
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

function selectorToLabel(selector) {
  const text = sanitizeLabel(selector);
  if (!text) {
    return "";
  }
  if (text.includes(">")) {
    return "";
  }

  const normalized = text.replace(/:nth-of-type\(\d+\)/g, "").trim();
  if (!normalized || /^[a-z]+$/i.test(normalized)) {
    return "";
  }

  const lastToken = normalized.split(/\s+/).pop() || "";
  if (!lastToken || /^[a-z]+$/i.test(lastToken)) {
    return "";
  }
  return lastToken;
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
  const selectorHint = selectorToLabel(step.selectors?.css);
  return (
    sanitizeLabel(step.target?.label) ||
    sanitizeLabel(step.target?.text) ||
    sanitizeLabel(step.target?.id ? `#${step.target.id}` : "") ||
    sanitizeLabel(step.target?.name ? `[${step.target.name}]` : "") ||
    sanitizeLabel(selectorHint) ||
    semanticFallback(step) ||
    sanitizeLabel(step.target?.tag) ||
    "target"
  );
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
      note: normalizeText(step.note)
    };
  });

  return { ...raw, steps };
}

function resequence(steps) {
  return steps.map((step, idx) => ({ ...step, stepIndex: idx + 1 }));
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
    lines.push("");
    return lines;
  });
  return [...header, ...body].join("\n");
}

function asHtml(payload) {
  const sessionTitle = payload.session?.lastTitle || payload.session?.startTitle || payload.session?.id || "Procedure";
  const lines = payload.steps
    .map((step) => {
      const note = step.note ? `<p class="note"><strong>Note:</strong> ${step.note}</p>` : "";
      const url = step.url ? `<p class="url"><strong>URL:</strong> ${step.url}</p>` : "";
      return `
        <section class="step">
          <h2>${step.stepIndex}. ${step.title}</h2>
          <p>${step.instruction || ""}</p>
          ${note}
          ${url}
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
    </style>
  </head>
  <body>
    <h1>${sessionTitle}</h1>
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

  function onFileSelected(event) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result || "{}"));
        const normalized = normalizePayload(parsed);
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

  function updateStep(stepId, patch) {
    setPayload((prev) => {
      if (!prev) {
        return prev;
      }
      return {
        ...prev,
        steps: prev.steps.map((step) => (step.id === stepId ? { ...step, ...patch } : step))
      };
    });
  }

  function moveStep(stepId, direction) {
    setPayload((prev) => {
      if (!prev) {
        return prev;
      }
      const index = prev.steps.findIndex((step) => step.id === stepId);
      if (index < 0) {
        return prev;
      }
      const nextIndex = index + direction;
      if (nextIndex < 0 || nextIndex >= prev.steps.length) {
        return prev;
      }

      const next = [...prev.steps];
      [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
      return { ...prev, steps: resequence(next) };
    });
  }

  function deleteStep(stepId) {
    setPayload((prev) => {
      if (!prev) {
        return prev;
      }
      const next = prev.steps.filter((step) => step.id !== stepId);
      setSelectedId(next[0]?.id || null);
      return { ...prev, steps: resequence(next) };
    });
  }

  function exportJson() {
    if (!payload) {
      return;
    }
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
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
    const normalized = normalizePayload({ session, steps });
    setPayload(normalized);
    setSelectedId(normalized.steps[0]?.id || null);
    setError("");
    setExtensionStatus(`Imported session ${session.id} (${steps.length} steps).`);
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
          <p style={{ margin: 0, color: palette.textSoft }}>Import a session, refine step wording/order, and export JSON or Markdown.</p>
        </div>
        <button type="button" style={buttonStyle(palette, false)} onClick={() => setTheme((t) => (t === "dark" ? "light" : "dark"))}>
          Theme: {theme}
        </button>
      </div>

      <div style={{ marginTop: 14, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
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
                {session.id} ({session.stepsCount} steps)
              </option>
            ))
          )}
        </select>
        <button type="button" onClick={importSelectedExtensionSession} style={buttonStyle(palette, !selectedExtensionSessionId)} disabled={!selectedExtensionSessionId}>
          Import Selected Session
        </button>
      </div>
      {extensionStatus ? <p style={{ marginTop: 8, color: palette.textSoft }}>{extensionStatus}</p> : null}
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
                style={{
                  border: `1px solid ${palette.border}`,
                  borderRadius: 8,
                  padding: 8,
                  marginBottom: 8,
                  background: step.id === selectedStep?.id ? palette.surfaceAlt : palette.surface
                }}
              >
                <button
                  type="button"
                  onClick={() => setSelectedId(step.id)}
                  style={{ width: "100%", textAlign: "left", border: 0, background: "transparent", padding: 0, cursor: "pointer", color: palette.text, fontWeight: 600 }}
                >
                  #{step.stepIndex} {step.title}
                </button>
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
