# Team Library Protocol

Status: current canonical contract for the remote team-library flow.

## Version

- `TEAM_SYNC_PROTOCOL_VERSION = 1.0.0`
- This is distinct from payload/schema version (`APP_SCHEMA_VERSION = 1.1.0`).
- Repo-backed backend source currently reports `TEAM_SYNC_BACKEND_VERSION = 2026-03-06`.
- Service marker is `cap-me-team-library`.

## Canonical source files

- App-side protocol constants: `app/src/lib/protocol.ts`
- App runtime caller: `app/src/App.jsx`
- Page bridge receiver: `extension/content-script.js`
- Extension runtime/auth/upload path: `extension/background.js`
- Repo-backed backend artifact: `backend/google-apps-script/team-library/Code.gs`

## Scope

This protocol covers:

1. Web app <-> extension page bridge
2. Extension/web app <-> Google Apps Script backend

It does not redefine local capture/storage contracts.

## Runtime path

1. The React app posts bridge requests on `window` using channel `CAP_ME_APP_BRIDGE`.
2. The content script accepts canonical request types plus older compatibility aliases and answers on the same channel.
3. For team auth, the content script delegates to the extension background via `GET_SYNC_ACCESS_TOKEN`.
4. The app calls the Apps Script web app over `fetch`.
5. Uploads originate from the extension background, not from the web app.

## Auth authority

- Primary auth authority: extension background
- Primary token acquisition path:
  - app -> page bridge (`REQUEST_TEAM_AUTH`)
  - content script -> extension background (`GET_SYNC_ACCESS_TOKEN`)
  - extension background -> Chrome Identity (`chrome.identity.getAuthToken`)
- Primary app behavior:
  - the app does not persist or reuse a durable bearer token for the normal team-library flow
  - the app requires a fresh bridge-provided token before calling `listSessions` or `getSession`
- Retained compatibility outside the primary path:
  - the Apps Script backend still supports Google session fallback when no access token is present
  - this is retained backend compatibility, not the canonical app auth path

## App <-> extension bridge

- Channel: `CAP_ME_APP_BRIDGE`
- Canonical requests from the page:
  - `REQUEST_SESSIONS`
  - `REQUEST_TEAM_AUTH`
- Canonical responses from the content script:
  - `SESSIONS_RESPONSE`
  - `TEAM_AUTH_RESPONSE`
- Legacy request aliases still accepted by the content script:
  - Sessions: `REQUEST_CAPTURE_SESSIONS`
  - Team auth: `REQUEST_TEAM_TOKEN`, `REQUEST_AUTH_TOKEN`
- Compatibility note:
  - The content script also accepts requests by historical `requestId` prefixes:
    - `cap_me_bridge_`
    - `cap_me_team_auth_`
  - This is a backward-compatibility behavior, not the canonical contract for new callers.

### Request: `REQUEST_SESSIONS`

```json
{
  "channel": "CAP_ME_APP_BRIDGE",
  "type": "REQUEST_SESSIONS",
  "requestId": "cap_me_bridge_<id>",
  "protocolVersion": "1.0.0"
}
```

### Response: `SESSIONS_RESPONSE`

```json
{
  "channel": "CAP_ME_APP_BRIDGE",
  "type": "SESSIONS_RESPONSE",
  "requestId": "cap_me_bridge_<id>",
  "protocolVersion": "1.0.0",
  "ok": true,
  "sessions": [],
  "steps": []
}
```

Failure shape visible from current code:

```json
{
  "channel": "CAP_ME_APP_BRIDGE",
  "type": "SESSIONS_RESPONSE",
  "requestId": "cap_me_bridge_<id>",
  "protocolVersion": "1.0.0",
  "ok": false,
  "error": "storage_unavailable"
}
```

Current explicit session bridge errors:

- `storage_unavailable`
- `storage_read_failed`
- `bridge_timeout` on the app side if no response arrives before timeout

### Request: `REQUEST_TEAM_AUTH`

```json
{
  "channel": "CAP_ME_APP_BRIDGE",
  "type": "REQUEST_TEAM_AUTH",
  "requestId": "cap_me_team_auth_<id>",
  "protocolVersion": "1.0.0"
}
```

### Response: `TEAM_AUTH_RESPONSE`

```json
{
  "channel": "CAP_ME_APP_BRIDGE",
  "type": "TEAM_AUTH_RESPONSE",
  "requestId": "cap_me_team_auth_<id>",
  "protocolVersion": "1.0.0",
  "ok": true,
  "token": "<google_access_token>",
  "error": null
}
```

Failure shape visible from current code:

```json
{
  "channel": "CAP_ME_APP_BRIDGE",
  "type": "TEAM_AUTH_RESPONSE",
  "requestId": "cap_me_team_auth_<id>",
  "protocolVersion": "1.0.0",
  "ok": false,
  "token": null,
  "error": "AUTH_REQUIRED"
}
```

Current explicit team-auth bridge failures visible from runtime:

- `EXTENSION_UNAVAILABLE`
- `AUTH_UNAVAILABLE`
- `AUTH_REQUIRED`
- `AUTH_DENIED`
- `TOKEN_UNAVAILABLE`

App-side handling note:

- if the bridge does not answer before timeout, the app now normalizes that condition to `EXTENSION_UNAVAILABLE` for the team-library flow
- this means the visible app failure state is explicit even though the underlying cause may still be “extension missing” or “bridge not responding”

## Background auth/runtime contract

Messages visible in the current remote path:

- `GET_SYNC_ACCESS_TOKEN` -> `{ ok: true, token, protocolVersion }` on success
- `AUTH_SIGN_IN` -> `{ ok: true, accountEmail, protocolVersion }` on success
- `AUTH_SIGN_OUT` -> `{ ok: true, protocolVersion }` on success
- `GET_SYNC_STATUS` -> `{ ok: true, sessionId, sync, queueItem, syncState, protocolVersion }`
- `SYNC_SESSION_BY_ID` -> `{ ok, sessionId, error }`
- `SYNC_LAST_SESSION` -> `{ ok, sessionId, error }`
- `OPEN_EDITOR` -> `{ ok, tabId, url }` or `{ ok: false, error }`

Current visible auth/error codes in the extension/background path:

- `EXTENSION_UNAVAILABLE`
- `AUTH_UNAVAILABLE`
- `AUTH_REQUIRED`
- `AUTH_DENIED`
- `TOKEN_UNAVAILABLE`
- `TOKEN_EXPIRED`
- `SYNC_DISABLED`
- `SYNC_ENDPOINT_MISSING`
- `NETWORK_ERROR`
- `QUOTA_EXCEEDED`

## Backend contract

- Canonical actions:
  - `health`
  - `version`
  - `debugAuth`
  - `listSessions`
  - `getSession`
  - `uploadSession`
  - `deleteSession`
- Response wrapper:
  - Every JSON response is augmented by the backend with:
    - `service`
    - `protocolVersion`
    - `backendVersion`

## Auth semantics

- `health` and `version` do not require auth.
- `debugAuth` only works when `CAPME_DEBUG_AUTH=true`.
- `listSessions` and `getSession` require an allowed user resolved from:
  - `accessToken` query param, then
  - Google Apps Script active user session fallback
- `uploadSession` and `deleteSession` require an allowed user resolved from:
  - `accessToken` body field, then
  - `accessToken` query param, then
  - Google Apps Script active user session fallback
- The extension background currently sends `accessToken` in the POST body for uploads.
- The web app currently sends `accessToken` in the query string for `listSessions` and `getSession`.
- The app now requires a bridge-provided token for the normal team-library path and no longer relies on a locally persisted bearer-token fallback.
- The backend session fallback remains in repo code, but it is not the canonical app auth model.

### Health/version

- `GET ?action=health`
- `GET ?action=version`

Health response shape:

```json
{
  "ok": true,
  "status": "healthy",
  "service": "cap-me-team-library",
  "protocolVersion": "1.0.0",
  "backendVersion": "2026-03-06",
  "folderConfigured": true,
  "debugAuthEnabled": false,
  "checkedAt": 0
}
```

Version response shape:

```json
{
  "ok": true,
  "status": "ready",
  "service": "cap-me-team-library",
  "protocolVersion": "1.0.0",
  "backendVersion": "2026-03-06",
  "checkedAt": 0,
  "supportedActions": {
    "get": ["health", "version", "debugAuth", "listSessions", "getSession"],
    "post": ["uploadSession", "deleteSession"]
  },
  "requestConventions": {
    "protocolVersionQueryParam": true,
    "accessTokenQueryParam": true,
    "accessTokenBodyField": "accessToken",
    "payloadBodyField": "payload",
    "deleteSessionBodyField": "sessionId",
    "googleSessionFallback": true
  }
}
```

Current compatibility reality:

- `protocolVersion=1.0.0` is sent by app callers and documented as canonical.
- The repo-backed backend currently echoes its own protocol version in responses but does not reject request/version mismatches.
- That means protocol agreement is explicit but not yet server-enforced.
- Auth authority is explicit in the app/runtime path even though the backend still retains session-based compatibility fallback.

### List request

- `GET ?action=listSessions&limit=50&accessToken=<token>&protocolVersion=1.0.0`

Success response shape:

```json
{
  "ok": true,
  "service": "cap-me-team-library",
  "protocolVersion": "1.0.0",
  "backendVersion": "2026-03-06",
  "items": [
    {
      "id": "sess_123",
      "sessionId": "sess_123",
      "title": "Example title",
      "stepsCount": 5,
      "updatedAt": 0
    }
  ]
}
```

### Get request

- `GET ?action=getSession&sessionId=<id>&accessToken=<token>&protocolVersion=1.0.0`

Success response shape:

```json
{
  "ok": true,
  "service": "cap-me-team-library",
  "protocolVersion": "1.0.0",
  "backendVersion": "2026-03-06",
  "sessionId": "sess_123",
  "payload": {
    "schemaVersion": "1.1.0",
    "exportedAt": 0,
    "session": {},
    "steps": [],
    "meta": {}
  }
}
```

### Upload request

- `POST ?action=uploadSession`
- `Content-Type: application/json`

```json
{
  "schemaVersion": "1.1.0",
  "protocolVersion": "1.0.0",
  "accessToken": "<google_access_token>",
  "payload": { "session": {}, "steps": [], "meta": {} },
  "client": {
    "name": "cap-me-action-extension",
    "version": "0.0.1"
  }
}
```

Notes tied to current implementation:

- The background sends `schemaVersion` and `protocolVersion` at the top level.
- The session payload written to Drive also contains its own `schemaVersion`.
- The backend currently mutates `payload.meta` before saving:
  - `capturedBy`
  - `serverSavedAt`
  - `protocolVersion`

### Upload response

```json
{
  "ok": true,
  "service": "cap-me-team-library",
  "protocolVersion": "1.0.0",
  "backendVersion": "2026-03-06",
  "sessionId": "sess_...",
  "fileId": "<drive_file_id>",
  "uploadedAt": 0,
  "revision": 1
}
```

### Delete request

- `POST ?action=deleteSession`
- `Content-Type: application/json`

```json
{
  "accessToken": "<google_access_token>",
  "sessionId": "sess_123"
}
```

### Failure/error shape

Current backend failures visible from repo code use this shape:

```json
{
  "ok": false,
  "service": "cap-me-team-library",
  "protocolVersion": "1.0.0",
  "backendVersion": "2026-03-06",
  "errorCode": "AUTH_REQUIRED"
}
```

Current explicit backend error codes visible from code:

- `DEBUG_AUTH_DISABLED`
- `INVALID_JSON_BODY`
- `UNKNOWN_ACTION`
- `AUTH_REQUIRED`
- `AUTH_DENIED`
- `SESSION_ID_REQUIRED`
- `SESSION_NOT_FOUND`
- `FOLDER_NOT_CONFIGURED`
- `FOLDER_ACCESS_DENIED_OR_INVALID_ID`

## Compatibility notes

- The content script still accepts older bridge request variants:
  - `REQUEST_CAPTURE_SESSIONS`
  - `REQUEST_TEAM_TOKEN`
  - `REQUEST_AUTH_TOKEN`
  - requestId prefixes `cap_me_bridge_` and `cap_me_team_auth_`
- Reason: these shapes already shipped during iterative debugging and removing them in this stage would be a risky behavior change.
- Canonical callers should use only:
  - `REQUEST_SESSIONS`
  - `REQUEST_TEAM_AUTH`
- The app no longer exposes a manual bearer-token input for team-library reads.

## Deployment gap

- The backend is now versioned in this repo under `backend/google-apps-script/team-library/`.
- The deployed Apps Script web app is still external and must be manually updated/redeployed to match repo source.
- Repo inspection can confirm source-of-truth behavior, but it cannot prove the currently deployed web app matches this source until a fresh manual verification pass is run.
