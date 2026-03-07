# Team Library Protocol

Status: current canonical contract for the remote team-library flow.

## Version

- `TEAM_SYNC_PROTOCOL_VERSION = 1.0.0`
- This is distinct from payload/schema version (`APP_SCHEMA_VERSION = 1.1.0`).

## Scope

This protocol covers:

1. Web app <-> extension page bridge
2. Extension/web app <-> Google Apps Script backend

It does not redefine local capture/storage contracts.

## App <-> extension bridge

- Channel: `CAP_ME_APP_BRIDGE`
- Canonical requests from the page:
  - `REQUEST_SESSIONS`
  - `REQUEST_TEAM_AUTH`
- Canonical responses from the content script:
  - `SESSIONS_RESPONSE`
  - `TEAM_AUTH_RESPONSE`

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

## Backend contract

- Canonical actions:
  - `health`
  - `version`
  - `debugAuth`
  - `listSessions`
  - `getSession`
  - `uploadSession`
  - `deleteSession`

### Health/version

- `GET ?action=health`
- `GET ?action=version`

Both return:

```json
{
  "ok": true,
  "service": "cap-me-team-library",
  "protocolVersion": "1.0.0",
  "backendVersion": "2026-03-06"
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

### List request

- `GET ?action=listSessions&limit=50&accessToken=<token>&protocolVersion=1.0.0`

### Get request

- `GET ?action=getSession&sessionId=<id>&accessToken=<token>&protocolVersion=1.0.0`

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

## Deployment gap

- The backend is now versioned in this repo under `backend/google-apps-script/team-library/`.
- The deployed Apps Script web app is still external and must be manually updated/redeployed to match repo source.
