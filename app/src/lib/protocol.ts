export const TEAM_SYNC_PROTOCOL_VERSION = "1.0.0";

export const APP_BRIDGE_CHANNEL = "CAP_ME_APP_BRIDGE";

export const APP_BRIDGE_REQUEST_TYPES = {
  sessions: "REQUEST_SESSIONS",
  teamAuth: "REQUEST_TEAM_AUTH"
} as const;

export const APP_BRIDGE_RESPONSE_TYPES = {
  sessions: "SESSIONS_RESPONSE",
  teamAuth: "TEAM_AUTH_RESPONSE"
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
