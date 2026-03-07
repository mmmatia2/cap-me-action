# Team Library Apps Script Backend

Canonical source for the Google Apps Script backend used by the remote team-library flow.

Current version markers:

- `TEAM_SYNC_PROTOCOL_VERSION = 1.0.0`
- `TEAM_SYNC_BACKEND_VERSION = 2026-03-06`
- `TEAM_SYNC_SERVICE_NAME = cap-me-team-library`

## Source files

- `Code.gs`: deployed web app logic
- `appsscript.json`: manifest/scopes for manual setup or `clasp`

## Required script properties

- `CAPME_FOLDER_ID`
- `CAPME_ALLOWED_EMAILS`
- `CAPME_DEBUG_AUTH`

## Deployment notes

Deploy as:

- Execute as: `Me`
- Who has access: `Anyone`

Use the generated `/exec` URL as the extension/app team endpoint.

## Operational endpoints

- `GET ?action=health`
- `GET ?action=version`
- `GET ?action=debugAuth&accessToken=...` when `CAPME_DEBUG_AUTH=true`
- `GET ?action=listSessions&limit=50&protocolVersion=1.0.0&accessToken=...`
- `GET ?action=getSession&sessionId=...&protocolVersion=1.0.0&accessToken=...`
- `POST ?action=uploadSession`
- `POST ?action=deleteSession`

`health` and `version` responses include `service`, `protocolVersion`, and `backendVersion`.
`version` also exposes the currently repo-backed action list and request conventions so reviewers can compare deployed behavior with repo source.
