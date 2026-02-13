import { useMemo, useState } from "react";

// Purpose: provide a local step editor for exported recorder sessions.
// Inputs: session JSON file exported from the extension and inline user edits.
// Outputs: editable steps with instruction/note fields and downloadable updated JSON.
function deriveInstruction(step) {
  const target = step.target?.label || step.target?.text || step.target?.tag || "target element";
  const key = step.key ? ` "${step.key}"` : "";
  const map = {
    click: `Click ${target}.`,
    input: `Enter "${step.value || ""}" in ${target}.`,
    key: `Press${key} on ${target}.`,
    select: `Select "${step.optionText || step.optionValue || ""}" in ${target}.`,
    toggle: `${step.checked ? "Enable" : "Disable"} ${target}.`,
    navigate: `Navigate to ${step.pageTitle || step.url || "the page"}.`,
    scroll: `Scroll to x:${step.scrollX || 0}, y:${step.scrollY || 0}.`
  };
  return map[step.type] || `Perform ${step.type || "action"} on ${target}.`;
}

function normalizePayload(raw) {
  if (!raw || typeof raw !== "object" || !raw.session || !Array.isArray(raw.steps)) {
    throw new Error("Expected payload shape: { session: {...}, steps: [...] }");
  }

  const steps = raw.steps.map((step, idx) => ({
    ...step,
    stepIndex: step.stepIndex || idx + 1,
    instruction: step.instruction || deriveInstruction(step),
    note: step.note || ""
  }));

  return { ...raw, steps };
}

function formatStepLabel(step) {
  const type = (step.type || "step").toUpperCase();
  const target = step.target?.label || step.target?.text || step.target?.tag || "target";
  return `#${step.stepIndex} [${type}] ${target}`;
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

  function updateStepField(stepId, field, value) {
    setPayload((prev) => {
      if (!prev) {
        return prev;
      }
      return {
        ...prev,
        steps: prev.steps.map((step) => (step.id === stepId ? { ...step, [field]: value } : step))
      };
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

  return (
    <main style={{ fontFamily: "Segoe UI, sans-serif", padding: 16, color: "#111827" }}>
      <h1 style={{ marginTop: 0 }}>Cap Me Action Step Editor</h1>
      <p style={{ marginBottom: 16 }}>Import a session JSON, edit the step wording, and export the updated guide.</p>

      <input type="file" accept=".json,application/json" onChange={onFileSelected} />
      <button type="button" onClick={exportJson} disabled={!payload} style={{ marginLeft: 8 }}>
        Export Edited JSON
      </button>
      {error ? <p style={{ color: "#b91c1c" }}>{error}</p> : null}

      {!payload ? (
        <p style={{ marginTop: 24 }}>No file loaded yet.</p>
      ) : (
        <section style={{ display: "grid", gridTemplateColumns: "360px 1fr", gap: 16, marginTop: 16 }}>
          <aside style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: 12, maxHeight: 560, overflow: "auto" }}>
            <h2 style={{ fontSize: 16, margin: "0 0 8px" }}>
              Session: {payload.session.id} ({payload.steps.length} steps)
            </h2>
            {payload.steps.map((step) => (
              <button
                key={step.id}
                type="button"
                onClick={() => setSelectedId(step.id)}
                style={{
                  width: "100%",
                  textAlign: "left",
                  border: "1px solid #d1d5db",
                  borderRadius: 6,
                  padding: "8px 10px",
                  marginBottom: 8,
                  background: step.id === selectedStep?.id ? "#eff6ff" : "#fff"
                }}
              >
                {formatStepLabel(step)}
              </button>
            ))}
          </aside>

          <article style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: 12 }}>
            {!selectedStep ? (
              <p>Select a step.</p>
            ) : (
              <>
                <h2 style={{ marginTop: 0 }}>{formatStepLabel(selectedStep)}</h2>
                <label htmlFor="instruction" style={{ display: "block", fontWeight: 600 }}>
                  Instruction
                </label>
                <textarea
                  id="instruction"
                  rows={3}
                  value={selectedStep.instruction}
                  onChange={(event) => updateStepField(selectedStep.id, "instruction", event.target.value)}
                  style={{ width: "100%", marginTop: 4, marginBottom: 10 }}
                />

                <label htmlFor="note" style={{ display: "block", fontWeight: 600 }}>
                  Note (optional)
                </label>
                <textarea
                  id="note"
                  rows={2}
                  value={selectedStep.note}
                  onChange={(event) => updateStepField(selectedStep.id, "note", event.target.value)}
                  style={{ width: "100%", marginTop: 4, marginBottom: 10 }}
                />

                <h3 style={{ marginBottom: 6 }}>Step Metadata</h3>
                <pre style={{ margin: 0, background: "#f9fafb", padding: 10, borderRadius: 6, overflow: "auto" }}>
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
