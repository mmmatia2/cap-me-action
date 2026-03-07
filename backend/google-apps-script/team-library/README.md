# Team Library Apps Script Backend

Canonical source for the Google Apps Script backend used by the remote team-library flow.

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
- `GET ?action=listSessions&limit=50&accessToken=...`
- `GET ?action=getSession&sessionId=...&accessToken=...`
- `POST ?action=uploadSession`
- `POST ?action=deleteSession`
