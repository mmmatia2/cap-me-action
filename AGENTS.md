# Cap Me Action Agent Workflow

This file is the repo-root operating contract for agent-driven work in this repository.

Use it together with repository reality, not instead of repository reality.

## Product Baseline

- This is an internal backoffice tool, not a public web-store product.
- The Chrome extension is a core product surface. It creates the capture artifacts.
- The editor is the refinement, import, and export surface for those artifacts.
- The current operator baseline is:
  - packaged extension artifact
  - hosted editor default at `https://cap-me-action.vercel.app`
  - localhost editor only as an explicit developer override

## Roles

- `ARCHITECT`
  - owns analysis, sequencing, risk framing, audits, and next-step definition
  - should hand off the next smallest safe increment, not a broad vague plan
- `EXECUTOR`
  - inspects the actual repo, implements narrow changes, runs checks, and reports validated vs unvalidated claims
  - must not assume a plan doc proves implementation
- Human
  - final decision-maker
  - validates runtime behavior and accepts or rejects stage outcomes

## Standard Workflow

1. Inspect the real repository before making claims.
2. Work from the next smallest safe increment.
3. Keep reports explicit about:
   - confirmed repo facts
   - implemented changes
   - validated checks
   - unvalidated assumptions
   - risks and hidden coupling
4. Do not treat a passing build as proof of runtime correctness.
5. Call out manual validation only when it is actually crucial.
6. Prefer narrow, reversible stages over broad rewrites.

## Required Executor Handoff Shape

Executor implementation handoffs should end with this exact structure:

## 1. Objective
## 2. Repository facts
## 3. Implemented
## 4. Validated
## 5. Unvalidated / assumptions
## 6. Risks / hidden coupling
## 7. Next smallest safe increment

## Review Standards

- Read the file tree, contracts, and touched code paths before concluding anything.
- Distinguish clearly between:
  - confirmed
  - implemented but unvalidated
  - assumed
  - missing
  - planned
- Do not hide risks to make a stage sound cleaner than it is.
- If a stage is not ready to expand, say so directly.

## Repo-Specific Constraints

### Documentation Truth

- Canonical active docs:
  - `docs/STATE.md`
  - `docs/CHANGELOG.md`
  - `docs/team-library-protocol.md`
  - `docs/export-schema.json`
  - `docs/adr/*.md`
- Update at least one canonical artifact for any behavior, contract, or operator-flow change.
- If uncertain where to write, update `docs/STATE.md`.
- Do not restore `docs/validation/2026-03-07-linux-mint-auth-boundary-runtime.md`.

### Operator and Distribution Baseline

- The hosted editor URL `https://cap-me-action.vercel.app` is the default operator handoff target.
- Localhost `http://localhost:5173` remains supported only as a developer override.
- Canonical operator handoff runbook:
  - `docs/internal-operator-handoff.md`
- Team-sync bootstrap remains a supporting path:
  - `docs/internal-oauth-bootstrap.md`
  - `docs/TEAM_SYNC_APPS_SCRIPT.md`
  - `docs/team-library-fresh-setup.md`

### Extension Packaging Requirement

- If a change affects the extension and that iteration is intended to be handed to another operator, the executor must generate a fresh packaged extension artifact before closing the stage.
- Required commands for distributable extension iterations:
  - `pnpm extension:package`
  - `pnpm extension:verify-package`
- The generated artifact lives under `artifacts/extension/` and is ignored as generated output.
- Do not commit generated packaging artifacts.

### Validation Expectations

- For extension-focused changes, run:
  - `pnpm extension:check-syntax`
- For editor/product changes, run:
  - `pnpm build:app`
- For contract-boundary changes, run:
  - `pnpm test:contracts`
  - `pnpm typecheck:contracts` when the touched area includes `app/src/lib/contracts.ts` or `app/src/lib/migrations.ts`
- For doc-impact changes, run:
  - `pnpm docs:bundle`
  - `pnpm docs:check`

### Design Direction

- UI should feel like one internal backoffice product.
- Prefer:
  - calm operational styling
  - stronger hierarchy
  - disciplined spacing and panel structure
  - consistent controls and status styling
- Avoid:
  - playful/jelly/Scribe-like styling
  - one-off cosmetic changes that do not move the shared system forward

### Scope Discipline

- Do not broaden narrow stages into hidden refactors.
- Do not mix backend hardening, auth redesign, and UI work in the same increment unless explicitly requested.
- Treat extension + editor + Apps Script as one operational chain when evaluating handoff or adoption risk.
