# Linux Mint Runtime Validation: Auth Boundary

Date: 2026-03-07
Environment: Linux Mint 22.3, X11, `google-chrome-stable`, local app dev server
Scope: live runtime validation for `app -> bridge -> extension background -> Chrome Identity -> backend`

## Blunt Summary

Runtime validation was only partially completed.

What was directly validated:

- the local app can run in this environment
- the unpacked repo extension is installed in the default Chrome profile
- the deployed backend URL currently does not match the repo-backed unauthenticated `health` / `version` behavior

What was blocked:

- clean sign-in
- sign-out / unavailable token from the real app UI
- app reload with verified team-library auth continuity
- extension reload with verified team-library auth continuity
- live `listSessions` / `getSession` through the real app + bridge + background path

Primary blocker:

- no stable browser-control path in this environment was able to both:
  - load the unpacked extension in an automatable Chrome session
  - expose the running browser/extension state for scripted interaction

## Exact Steps Executed

1. Confirmed Linux Mint/X11/Chrome environment from shell.
2. Started the local app with `pnpm dev:app`.
3. Confirmed the app served successfully at `http://localhost:5173/`.
4. Queried the deployed backend URL:
   - `GET ?action=health`
   - `GET ?action=version`
5. Confirmed the repo extension is installed as an unpacked extension in the default Chrome profile by reading Chrome preferences:
   - extension ID: `hdpjinoipinpocchkemccoppnlfbnpgl`
   - path: `/home/matias/Documents/Projects/cap-me-action/extension`
6. Inspected the extension's local storage files from the default Chrome profile.
7. Attempted isolated Chrome launches with:
   - direct Chrome CLI + temp profile + remote debugging
   - Playwright headless
   - Playwright headed
   - Playwright headed under `dbus-launch`

## Observed Results

### App runtime

Status: observed

- Local app server started successfully.
- Vite reported the app as ready.
- Playwright headless could load `http://localhost:5173/`.
- Observed page title: `Cap Me Action`

### Extension presence in current environment

Status: observed

- The unpacked extension is registered in the default Chrome profile.
- Chrome preference data showed:
  - location: unpacked extension
  - path: `/home/matias/Documents/Projects/cap-me-action/extension`
  - active permissions include:
    - `activeTab`
    - `alarms`
    - `identity`
    - `identity.email`
    - `storage`
    - `tabs`
    - `scripting`

### Extension runtime state in default profile

Status: observed

The extension local storage snapshot showed:

- `syncConfig.enabled = false`
- `syncConfig.endpointUrl = ""`
- `syncConfig.allowedEmails = []`
- `syncConfig.autoUploadOnStop = false`
- `syncConfig.maskInputValues = true`
- `syncState.lastErrorCode = null`
- `teamLibraryCache.items = []`

Observed implication:

- the installed extension had not yet been configured for team sync in the default Chrome profile at the time of inspection
- no previously validated sign-in state was present in the local extension storage snapshot

### Deployed backend: `health`

Status: observed failure

Request:

- `GET https://script.google.com/macros/s/AKfycby4urOWip73KNL-4CpKG8njOJ1fWtxEAuQNVi54ZyMB6CVkxWWjc2bo8yYLZa0qq6bDcg/exec?action=health`

Observed response:

```json
{"ok":false,"errorCode":"AUTH_REQUIRED"}
```

### Deployed backend: `version`

Status: observed failure

Request:

- `GET https://script.google.com/macros/s/AKfycby4urOWip73KNL-4CpKG8njOJ1fWtxEAuQNVi54ZyMB6CVkxWWjc2bo8yYLZa0qq6bDcg/exec?action=version`

Observed response:

```json
{"ok":false,"errorCode":"AUTH_REQUIRED"}
```

Observed implication:

- the currently deployed backend does not match the repo-backed expectation that `health` and `version` are unauthenticated and include protocol/backend metadata

### `listSessions`

Status: blocked

- not validated through the real app + bridge + background path
- reason:
  - the extension was present in the default profile, but no stable scripted browser-control path could both load the extension and interact with the UI/runtime boundary

### `getSession`

Status: blocked

- not validated through the real app + bridge + background path
- same blocker as `listSessions`

### Clean sign-in

Status: blocked

- not completed in a live browser session
- existing default Chrome profile contained Google accounts, but isolated copied-profile browser runs failed to reuse decryptable Google token state
- the automatable browser sessions that launched did not successfully register the unpacked extension for interaction

### Sign-out / unavailable token

Status: blocked

- unavailable-token behavior was not observed through the app UI
- only backend-level unauthenticated `AUTH_REQUIRED` was directly observed

### App reload

Status: blocked

- app process could be restarted/reloaded locally
- auth continuity after reload was not validated through the real app + bridge + background path

### Extension reload

Status: blocked

- extension reload was not validated in a usable interactive automation session

### Failure visibility in app/bridge/runtime

Status: blocked / partially observed

Partially observed:

- deployed backend unauthenticated failure: `AUTH_REQUIRED`

Not directly observed:

- app-visible `EXTENSION_UNAVAILABLE`
- app-visible `AUTH_REQUIRED`
- app-visible `TOKEN_UNAVAILABLE`
- app-visible bridge/runtime failure messaging after UI actions

## Browser-Control Attempts And Outcomes

### Direct Chrome CLI with temp profile + remote debugging

Status: failed

- Chrome command returned, but no debugging endpoint became available
- no usable browser-control channel was established

### Playwright headless

Status: partial

- app page loaded
- unpacked extension did not load/register in the generated profile
- no extension worker or extension state was available

### Playwright headed

Status: failed

- initial runs failed with `Browser.getWindowForTarget`

### Playwright headed under `dbus-launch`

Status: partial

- browser window launch succeeded
- unpacked extension still did not register in the generated profile
- no usable extension runtime target became available for validation

## Checklist Status

- Load the extension in the current Linux Mint environment: PASS
  - observed in default Chrome profile, unpacked extension registered
- Run the app against the real deployed backend: PARTIAL
  - app ran locally
  - backend endpoint was reached directly
  - full app-to-backend auth path not completed
- Clean sign-in: BLOCKED
- Sign-out / unavailable token: BLOCKED
- App reload: BLOCKED
- Extension reload: BLOCKED
- Failure visibility: PARTIAL
  - backend `AUTH_REQUIRED` observed
  - app-visible failure states not validated

## Mismatches Found

### Repo-backed docs/code vs deployed backend

Observed mismatch:

- repo-backed backend contract says `health` and `version` are unauthenticated and return protocol/backend metadata
- deployed backend at the provided `/exec` URL returned `AUTH_REQUIRED` for both endpoints

Confidence:

- high, directly observed

### Repo extension presence vs configured runtime state

Observed mismatch:

- extension is installed locally
- extension runtime storage is still essentially fresh/unconfigured for sync

Confidence:

- high, directly observed from local extension storage files

## Confidence Split

- Validated:
  - local app startup
  - extension installed in default Chrome profile
  - extension local sync config is unconfigured
  - deployed backend `health` and `version` currently return `AUTH_REQUIRED`
- Observed but incomplete:
  - browser automation can launch Chrome in some modes
- Assumed:
  - interactive sign-in would require a stable automatable extension session plus usable Google account selection/auth UI
- Unknown:
  - whether `listSessions` and `getSession` succeed when invoked through the real loaded extension in a manually driven session
  - whether the deployed backend accepts authenticated requests correctly from this extension build

## Gate Recommendation

PASS WITH RISKS

Reason:

- this stage did produce real runtime evidence and surfaced a concrete deployed-backend mismatch
- however, the full live auth boundary was not fully validated end-to-end because the browser-control environment could not provide a stable automatable extension session
