// Purpose: define shared session/step contracts and defaults for editor import/export logic.
// Inputs: in-memory payload objects. Outputs: normalized schema-aware payload fragments.

export const APP_SCHEMA_VERSION = "1.1.0";
export const SUPPORTED_IMPORT_SCHEMA_VERSIONS = [APP_SCHEMA_VERSION, "1.0.0"] as const;

export type SyncStatus = "local" | "pending" | "synced" | "failed" | "blocked";

export type SessionSync = {
  status: SyncStatus;
  revision?: number | null;
  lastSyncedAt?: number | null;
  errorCode?: string | null;
};

export type SessionRecord = {
  id: string;
  tabId?: number;
  startUrl?: string;
  startTitle?: string;
  lastUrl?: string;
  lastTitle?: string;
  startedAt?: number;
  updatedAt?: number;
  stepsCount?: number;
  sync?: SessionSync;
};

export type StepAnnotation = {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  label?: string;
  type?: "highlight" | "redact";
};

export type StepRecord = {
  id: string;
  sessionId: string;
  stepIndex?: number;
  type: string;
  url?: string;
  pageTitle?: string;
  at?: number;
  key?: string | null;
  modifiers?: Record<string, boolean> | null;
  value?: string | null;
  inputType?: string | null;
  optionValue?: string | null;
  optionText?: string | null;
  checked?: boolean | null;
  scrollX?: number | null;
  scrollY?: number | null;
  navigationKind?: string | null;
  fromHref?: string | null;
  target?: Record<string, unknown> | null;
  selectors?: Record<string, unknown> | null;
  thumbnailDataUrl?: string | null;
  annotations?: StepAnnotation[];
};

export type SessionPayload = {
  schemaVersion: string;
  exportedAt?: number;
  session: SessionRecord;
  steps: StepRecord[];
  meta?: {
    capturedBy?: string;
    appVersion?: string;
    syncRevision?: number;
  };
};

export function defaultSessionSync(): SessionSync {
  return {
    status: "local",
    revision: null,
    lastSyncedAt: null,
    errorCode: null
  };
}

export function withSessionSync(session: SessionRecord): SessionRecord {
  const merged = {
    ...session,
    sync: {
      ...defaultSessionSync(),
      ...(session.sync ?? {})
    }
  };

  const allowed: SyncStatus[] = ["local", "pending", "synced", "failed", "blocked"];
  if (!allowed.includes(merged.sync?.status as SyncStatus)) {
    merged.sync = { ...merged.sync, status: "local" };
  }

  return merged;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function assertValidSessionPayloadContract(raw: unknown): asserts raw is SessionPayload {
  if (!isRecord(raw)) {
    throw new Error("Invalid SOP payload contract: payload must be an object.");
  }

  if (typeof raw.schemaVersion !== "string" || !raw.schemaVersion.trim()) {
    throw new Error("Invalid SOP payload contract: schemaVersion is required.");
  }
  if (!SUPPORTED_IMPORT_SCHEMA_VERSIONS.includes(raw.schemaVersion as (typeof SUPPORTED_IMPORT_SCHEMA_VERSIONS)[number])) {
    throw new Error(
      `Invalid SOP payload contract: unsupported schemaVersion "${raw.schemaVersion}". Supported: ${SUPPORTED_IMPORT_SCHEMA_VERSIONS.join(", ")}.`
    );
  }

  if (!isRecord(raw.session)) {
    throw new Error("Invalid SOP payload contract: session object is required.");
  }
  if (typeof raw.session.id !== "string" || !raw.session.id.trim()) {
    throw new Error("Invalid SOP payload contract: session.id is required.");
  }

  if (!Array.isArray(raw.steps)) {
    throw new Error("Invalid SOP payload contract: steps must be an array.");
  }

  raw.steps.forEach((step, stepIndex) => {
    if (!isRecord(step)) {
      throw new Error(`Invalid SOP payload contract: steps[${stepIndex}] must be an object.`);
    }

    const annotations = step.annotations;
    if (annotations === undefined) {
      return;
    }
    if (!Array.isArray(annotations)) {
      throw new Error(`Invalid SOP payload contract: steps[${stepIndex}].annotations must be an array.`);
    }

    annotations.forEach((annotation, annotationIndex) => {
      if (!isRecord(annotation)) {
        throw new Error(
          `Invalid SOP payload contract: steps[${stepIndex}].annotations[${annotationIndex}] must be an object.`
        );
      }
      if (annotation.type !== "highlight" && annotation.type !== "redact") {
        throw new Error(
          `Invalid SOP payload contract: steps[${stepIndex}].annotations[${annotationIndex}].type must be "highlight" or "redact".`
        );
      }
    });
  });
}

