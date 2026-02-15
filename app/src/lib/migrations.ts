// Purpose: provide schema-aware migrations for session payload import/export in the editor.
// Inputs: raw payloads from extension/local files. Outputs: normalized payloads on current schema version.
import { APP_SCHEMA_VERSION, defaultSessionSync, withSessionSync } from "./contracts";

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function asNumber(value: unknown, fallback: number): number {
  return Number.isFinite(value) ? (value as number) : fallback;
}

function asString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function normalizeAnnotation(raw: unknown, idx: number) {
  if (!isObject(raw)) {
    return null;
  }

  const clamp = (value: unknown) => {
    const n = Number(value);
    if (!Number.isFinite(n)) {
      return 0;
    }
    return Math.max(0, Math.min(1, n));
  };

  const width = clamp(raw.width);
  const height = clamp(raw.height);
  if (width < 0.01 || height < 0.01) {
    return null;
  }

  return {
    id: asString(raw.id, `ann_${idx + 1}`),
    x: clamp(raw.x),
    y: clamp(raw.y),
    width,
    height,
    label: asString(raw.label, "")
  };
}

export function migrateSessionPayload(raw: unknown) {
  if (!isObject(raw)) {
    throw new Error("Invalid payload object.");
  }
  if (!isObject(raw.session) || !Array.isArray(raw.steps)) {
    throw new Error("Expected payload shape: { session: {...}, steps: [...] }");
  }

  const session = withSessionSync({
    ...raw.session,
    id: asString(raw.session.id, `sess_${Date.now()}`),
    tabId: asNumber(raw.session.tabId, -1),
    startUrl: asString(raw.session.startUrl),
    startTitle: asString(raw.session.startTitle),
    lastUrl: asString(raw.session.lastUrl || raw.session.startUrl),
    lastTitle: asString(raw.session.lastTitle || raw.session.startTitle),
    startedAt: asNumber(raw.session.startedAt, Date.now()),
    updatedAt: asNumber(raw.session.updatedAt, Date.now()),
    stepsCount: asNumber(raw.session.stepsCount, raw.steps.length)
  });

  const steps = raw.steps.map((stepRaw, idx) => {
    const step = isObject(stepRaw) ? stepRaw : {};
    return {
      ...step,
      id: asString(step.id, `step_${idx + 1}`),
      sessionId: asString(step.sessionId, session.id),
      stepIndex: asNumber(step.stepIndex, idx + 1),
      type: asString(step.type, "unknown"),
      url: asString(step.url),
      pageTitle: asString(step.pageTitle),
      at: asNumber(step.at, Date.now()),
      annotations: Array.isArray(step.annotations)
        ? step.annotations
            .map((annotation, annotationIdx) => normalizeAnnotation(annotation, annotationIdx))
            .filter(Boolean)
        : []
    };
  });

  return {
    schemaVersion: asString(raw.schemaVersion, APP_SCHEMA_VERSION),
    exportedAt: asNumber(raw.exportedAt, Date.now()),
    session: {
      ...session,
      stepsCount: steps.length,
      updatedAt: asNumber(session.updatedAt, Date.now())
    },
    steps,
    meta: isObject(raw.meta) ? raw.meta : {}
  };
}

export function buildSessionExport(payload: {
  session: Record<string, unknown>;
  steps: Array<Record<string, unknown>>;
  exportedAt?: number;
  meta?: Record<string, unknown>;
}) {
  const migrated = migrateSessionPayload(payload);
  return {
    schemaVersion: APP_SCHEMA_VERSION,
    exportedAt: payload.exportedAt ?? Date.now(),
    session: withSessionSync(migrated.session),
    steps: migrated.steps.map((step) => ({
      ...step,
      annotations: Array.isArray(step.annotations) ? step.annotations : []
    })),
    meta: {
      capturedBy: asString(payload.meta?.capturedBy, "unknown"),
      appVersion: asString(payload.meta?.appVersion, "0.0.0"),
      syncRevision: asNumber(payload.meta?.syncRevision, migrated.session.sync?.revision ?? 1)
    }
  };
}

export function migrateStoredCollections(rawStore: Record<string, unknown>) {
  const sessions = Array.isArray(rawStore.sessions)
    ? rawStore.sessions.map((session) => withSessionSync((isObject(session) ? session : {}) as any))
    : [];
  const steps = Array.isArray(rawStore.steps)
    ? rawStore.steps.map((step, idx) => {
        const source = isObject(step) ? step : {};
        return {
          ...source,
          id: asString(source.id, `step_${idx + 1}`),
          stepIndex: asNumber(source.stepIndex, idx + 1),
          annotations: Array.isArray(source.annotations)
            ? source.annotations
                .map((annotation, annotationIdx) => normalizeAnnotation(annotation, annotationIdx))
                .filter(Boolean)
            : []
        };
      })
    : [];
  return { sessions, steps };
}

export { APP_SCHEMA_VERSION, defaultSessionSync };

