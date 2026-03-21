# Internal Operator Handoff (Hosted Editor Baseline)

Use this as the canonical operator runbook for receiving a packaged extension artifact and reaching a working capture -> open-in-editor flow.

Scope: extension handoff + hosted editor baseline.  
Out of scope: full backend hardening and full support automation.

## 1) Receive the artifact

You should receive a versioned folder like:

- `artifacts/extension/<extension-name>-v<manifest.version>/`

Chrome load target is always:

- `artifacts/extension/<extension-name>-v<manifest.version>/extension/`

## 2) Verify artifact metadata (repo checkout only)

If you are working from this repo, run:

```bash
pnpm extension:verify-package
```

Confirm the output includes:

- `Artifact path`
- `Load unpacked from` (must end in `/extension`)
- `Manifest version`
- `Expected extension ID`

If you are not working from repo, ask the sender to provide this output.

## 3) Load in Chrome

Manual browser action:

1. Open `chrome://extensions`.
2. Enable Developer mode.
3. Click `Load unpacked`.
4. Select the packaged `extension/` folder from Step 1.

## 4) Confirm loaded extension identity

In `chrome://extensions`, confirm the loaded extension ID matches the expected extension ID from Step 2 (`pnpm extension:verify-package`).

## 5) Confirm hosted editor baseline

Operator default editor URL is:

- `https://cap-me-action.vercel.app`

Do not switch to localhost for normal operator use.

## 6) Capture -> open-in-editor smoke

1. Open any normal webpage.
2. Start and stop a short capture from the extension popup.
3. Click `Open Last Capture In Editor` (or open a recent capture card).
4. Confirm the editor opens at hosted URL and loads the captured session.

## 7) Team sync setup (only when needed)

Team sync is separate from capture/open flow. Do it only if remote team library is needed:

1. Follow `docs/internal-oauth-bootstrap.md` for OAuth + endpoint + sign-in.
2. Use `docs/team-library-fresh-setup.md` for deeper upload/list/load validation.
3. Use `docs/TEAM_SYNC_APPS_SCRIPT.md` for backend deployment and troubleshooting.

## Developer-only localhost override

Localhost is supported only as an explicit developer override:

- Inspector -> `Sync Settings` -> `Editor URL` = `http://localhost:5173`

When using localhost override, run the app locally (`pnpm dev:app`) and use `Check Local Editor` before handoff.
