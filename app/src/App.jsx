import { useMemo, useState } from "react";

// Purpose: provide a practical step editor for exported recorder sessions.
// Inputs: exported session JSON files and in-app edits to title/instruction/note/order.
// Outputs: edited JSON export and markdown procedure export for team sharing.
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

  // Drop long ancestry selectors; they are noisy and brittle.
  if (text.includes(">")) {
    return "";
  }

  const normalized = text.replace(/:nth-of-type\(\d+\)/g, "").trim();
  if (!normalized || /^[a-z]+$/i.test(normalized)) {
    return "";
  }

  // Prefer the most specific chunk of a selector.
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
    return `Scroll page`;
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

function buttonStyle(disabled = false) {
  return {
    border: "1px solid #d1d5db",
    borderRadius: 6,
    padding: "7px 10px",
    background: disabled ? "#f3f4f6" : "#fff",
    color: disabled ? "#9ca3af" : "#111827",
    cursor: disabled ? "not-allowed" : "pointer"
  };
}

export default function App() {
  const [payload, setPayload] = useState(null);
  const [error, setError] = useState("");
  const [selectedId, setSelectedId] = useState(null);

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

  return (
    <main style={{ fontFamily: "Segoe UI, sans-serif", padding: 16, color: "#111827" }}>
      <h1 style={{ marginTop: 0 }}>Cap Me Action Editor</h1>
      <p style={{ marginBottom: 16 }}>Import a session, refine step wording/order, and export JSON or Markdown.</p>

      <input type="file" accept=".json,application/json" onChange={onFileSelected} />
      <button type="button" onClick={exportJson} disabled={!payload} style={{ ...buttonStyle(!payload), marginLeft: 8 }}>
        Export JSON
      </button>
      <button type="button" onClick={exportMarkdown} disabled={!payload} style={{ ...buttonStyle(!payload), marginLeft: 8 }}>
        Export Markdown
      </button>
      {error ? <p style={{ color: "#b91c1c" }}>{error}</p> : null}

      {!payload ? (
        <p style={{ marginTop: 24 }}>No file loaded yet.</p>
      ) : (
        <section style={{ display: "grid", gridTemplateColumns: "380px 1fr", gap: 16, marginTop: 16 }}>
          <aside style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: 12, maxHeight: 620, overflow: "auto" }}>
            <h2 style={{ fontSize: 16, margin: "0 0 8px" }}>
              Session: {payload.session.id} ({payload.steps.length} steps)
            </h2>
            {payload.steps.map((step, idx) => (
              <div key={step.id} style={{ border: "1px solid #d1d5db", borderRadius: 6, padding: 8, marginBottom: 8, background: step.id === selectedStep?.id ? "#eff6ff" : "#fff" }}>
                <button type="button" onClick={() => setSelectedId(step.id)} style={{ width: "100%", textAlign: "left", border: 0, background: "transparent", padding: 0, cursor: "pointer", fontWeight: 600 }}>
                  #{step.stepIndex} {step.title}
                </button>
                <div style={{ marginTop: 6, display: "flex", gap: 6 }}>
                  <button type="button" onClick={() => moveStep(step.id, -1)} disabled={idx === 0} style={buttonStyle(idx === 0)}>Up</button>
                  <button type="button" onClick={() => moveStep(step.id, 1)} disabled={idx === payload.steps.length - 1} style={buttonStyle(idx === payload.steps.length - 1)}>Down</button>
                  <button type="button" onClick={() => deleteStep(step.id)} style={{ ...buttonStyle(false), color: "#b91c1c" }}>Delete</button>
                </div>
              </div>
            ))}
          </aside>

          <article style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: 12 }}>
            {!selectedStep ? (
              <p>Select a step.</p>
            ) : (
              <>
                <h2 style={{ marginTop: 0 }}>Step #{selectedStep.stepIndex}</h2>

                <label htmlFor="title" style={{ display: "block", fontWeight: 600 }}>Title</label>
                <input
                  id="title"
                  value={selectedStep.title}
                  onChange={(event) => updateStep(selectedStep.id, { title: event.target.value })}
                  style={{ width: "100%", marginTop: 4, marginBottom: 10, padding: 8 }}
                />

                <label htmlFor="instruction" style={{ display: "block", fontWeight: 600 }}>Instruction</label>
                <textarea
                  id="instruction"
                  rows={3}
                  value={selectedStep.instruction}
                  onChange={(event) => updateStep(selectedStep.id, { instruction: event.target.value })}
                  style={{ width: "100%", marginTop: 4, marginBottom: 10 }}
                />

                <label htmlFor="note" style={{ display: "block", fontWeight: 600 }}>Note (optional)</label>
                <textarea
                  id="note"
                  rows={2}
                  value={selectedStep.note}
                  onChange={(event) => updateStep(selectedStep.id, { note: event.target.value })}
                  style={{ width: "100%", marginTop: 4, marginBottom: 10 }}
                />

                <h3 style={{ marginBottom: 6 }}>Step Metadata</h3>
                <pre style={{ margin: 0, background: "#f9fafb", padding: 10, borderRadius: 6, overflow: "auto", maxHeight: 260 }}>
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
