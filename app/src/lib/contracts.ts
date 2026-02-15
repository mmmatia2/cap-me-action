// Purpose: define shared session/step contracts and defaults for editor import/export logic.
// Inputs: in-memory payload objects. Outputs: normalized schema-aware payload fragments.

export const APP_SCHEMA_VERSION = "1.1.0";

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
  schemaVersion?: string;
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

