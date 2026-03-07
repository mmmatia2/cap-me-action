// Canonical team-library boundary constants for the app/runtime contract.
export const TEAM_SYNC_PROTOCOL_VERSION = "1.0.0";
export const TEAM_SYNC_SERVICE_NAME = "cap-me-team-library";

export const APP_BRIDGE_CHANNEL = "CAP_ME_APP_BRIDGE";

export const APP_BRIDGE_REQUEST_TYPES = {
  sessions: "REQUEST_SESSIONS",
  teamAuth: "REQUEST_TEAM_AUTH"
} as const;

export const APP_BRIDGE_RESPONSE_TYPES = {
  sessions: "SESSIONS_RESPONSE",
  teamAuth: "TEAM_AUTH_RESPONSE"
} as const;

export const APP_BRIDGE_LEGACY_REQUEST_TYPES = {
  sessions: ["REQUEST_CAPTURE_SESSIONS"],
  teamAuth: ["REQUEST_TEAM_TOKEN", "REQUEST_AUTH_TOKEN"]
} as const;

export const TEAM_SYNC_BACKEND_ACTIONS = {
  health: "health",
  version: "version",
  debugAuth: "debugAuth",
  listSessions: "listSessions",
  getSession: "getSession",
  uploadSession: "uploadSession",
  deleteSession: "deleteSession"
} as const;

export const TEAM_SYNC_AUTH_ERROR_CODES = {
  extensionUnavailable: "EXTENSION_UNAVAILABLE",
  authUnavailable: "AUTH_UNAVAILABLE",
  authRequired: "AUTH_REQUIRED",
  authDenied: "AUTH_DENIED",
  tokenUnavailable: "TOKEN_UNAVAILABLE",
  tokenExpired: "TOKEN_EXPIRED"
} as const;

export const TEAM_SYNC_VISIBLE_ERROR_CODES = [
  "EXTENSION_UNAVAILABLE",
  "AUTH_UNAVAILABLE",
  "AUTH_REQUIRED",
  "AUTH_DENIED",
  "TOKEN_UNAVAILABLE",
  "TOKEN_EXPIRED",
  "SYNC_DISABLED",
  "SYNC_ENDPOINT_MISSING",
  "NETWORK_ERROR",
  "QUOTA_EXCEEDED",
  "INVALID_JSON_BODY",
  "UNKNOWN_ACTION",
  "SESSION_ID_REQUIRED",
  "SESSION_NOT_FOUND",
  "FOLDER_NOT_CONFIGURED",
  "FOLDER_ACCESS_DENIED_OR_INVALID_ID",
  "DEBUG_AUTH_DISABLED"
] as const;
