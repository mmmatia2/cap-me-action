# 2026-03 Execution Backlog

Derived from:

- `docs/roadmaps/2026-03-scribe-compatible-corporate-ai-plan.md`
- `docs/adr/0001-scribe-compatibility-scope-boundary.md`

This backlog is ordered for a 2-week internal launch candidate.

## Milestone M1: Foundation (Days 1-6)

## CMA-001: Fix editor integration blockers

- Priority: P0
- Estimate: S
- Labels: `editor`, `stability`, `p0`
- Depends on: none
- Scope:
  - Implement `mergeStepWithNext`.
  - Implement `onStepDragEnd`.
  - Remove duplicate `patchStep` declaration and stabilize local handlers.
- Acceptance criteria:
  - Editor renders and functions without runtime reference errors.
  - Merge and drag interactions work in smoke flow.

## CMA-002: Query-param session handoff from extension to editor

- Priority: P0
- Estimate: M
- Labels: `editor`, `extension`, `integration`, `p0`
- Depends on: CMA-001
- Scope:
  - Parse `source` and `sessionId` from URL.
  - Auto-load target local/team session when available.
  - Show clear fallback status when session not found.
- Acceptance criteria:
  - Opening editor from popup/inspector lands on selected session.
  - Missing session path produces non-blocking error guidance.

## CMA-003: Redaction type contract consistency

- Priority: P0
- Estimate: M
- Labels: `privacy`, `contracts`, `p0`
- Depends on: CMA-001
- Scope:
  - Preserve annotation `type` through normalize/migrate/export.
  - Ensure HTML export renders redactions as opaque masks.
  - Keep highlight behavior unchanged.
- Acceptance criteria:
  - Redaction boxes survive import/export roundtrip.
  - Exported guide does not leak redacted content visually.

## CMA-004: Sync settings UI in extension inspector

- Priority: P0
- Estimate: M
- Labels: `sync`, `extension`, `ux`, `p0`
- Depends on: none
- Scope:
  - Add controls for `enabled`, `endpointUrl`, `autoUploadOnStop`, `maskInputValues`, `allowedEmails`.
  - Persist settings to `chrome.storage.local.syncConfig`.
  - Show validation and save state.
- Acceptance criteria:
  - Non-technical user can configure sync without code edits.
  - Invalid config is blocked with actionable error text.

## CMA-005: OAuth + Apps Script production validation

- Priority: P0
- Estimate: M
- Labels: `sync`, `auth`, `ops`, `p0`
- Depends on: CMA-004
- Scope:
  - Replace OAuth placeholder client ID.
  - Validate sign-in, upload, list, import with real endpoint/folder/users.
  - Document setup and troubleshooting updates.
- Acceptance criteria:
  - At least 2 team users complete full sync flow successfully.
  - Known error cases documented and reproducible.

## CMA-006: Baseline tests and CI checks

- Priority: P1
- Estimate: M
- Labels: `quality`, `ci`, `tests`
- Depends on: CMA-001, CMA-003
- Scope:
  - Add reducer tests and migration tests.
  - Add export serializer tests (JSON/Markdown/HTML snapshots).
  - Add CI workflow to run tests + build + docs sync.
- Acceptance criteria:
  - CI blocks on failing tests/build/docs sync.
  - Critical state transformations are covered.

## Milestone M2: AI + Privacy Hardening (Days 7-9)

## CMA-007: AI provider interface + service boundary

- Priority: P1
- Estimate: M
- Labels: `ai`, `architecture`, `backend`
- Depends on: CMA-006
- Scope:
  - Define `AIProvider` abstraction and invocation contract.
  - Add provider config via environment/runtime settings.
  - Add safe failure behavior when AI is unavailable.
- Acceptance criteria:
  - AI calls are isolated behind one interface.
  - Core editor works with AI disabled.

## CMA-008: AI rewrite actions (step + full procedure)

- Priority: P1
- Estimate: M
- Labels: `ai`, `editor`, `ux`
- Depends on: CMA-007
- Scope:
  - Rewrite selected step action.
  - Rewrite full procedure action with tone presets.
  - Diff preview and one-click revert.
- Acceptance criteria:
  - User can accept or revert AI edits non-destructively.
  - No silent overwrite of manual text.

## CMA-009: AI procedure QA and privacy assist

- Priority: P1
- Estimate: M
- Labels: `ai`, `privacy`, `quality`
- Depends on: CMA-007
- Scope:
  - Add AI checklist review for ambiguity/missing context.
  - Add sensitive-text warnings and redaction suggestions.
  - Record AI suggestion metadata in payload `meta`.
- Acceptance criteria:
  - QA report appears with actionable findings.
  - Suggestions do not auto-apply without user confirmation.

## CMA-010: Security and dependency remediation

- Priority: P1
- Estimate: S
- Labels: `security`, `deps`, `ops`
- Depends on: none
- Scope:
  - Resolve known vulnerable dependency paths where feasible.
  - Remove plain sensitive token persistence when possible.
  - Add privacy pre-export checklist/warning gate.
- Acceptance criteria:
  - No known high-severity unresolved dependency alert in launch branch.
  - Export path includes explicit privacy confirmation.

## Milestone M3: Professional UI (Days 10-14)

## CMA-011: Shared design tokens and component primitives

- Priority: P0
- Estimate: M
- Labels: `design-system`, `ui`, `p0`
- Depends on: CMA-001
- Scope:
  - Unify token definitions used by app and extension surfaces.
  - Define base primitives: buttons, inputs, badges, cards, alerts.
  - Remove major style drift and duplicate token declarations.
- Acceptance criteria:
  - Popup, dock, inspector, and editor consume aligned token system.
  - Visual language is consistent across surfaces.

## CMA-012: Inspector redesign to production admin surface

- Priority: P1
- Estimate: M
- Labels: `ui`, `inspector`, `ux`
- Depends on: CMA-011
- Scope:
  - Replace utilitarian debug layout with polished task-oriented layout.
  - Keep all existing power actions while improving discoverability.
- Acceptance criteria:
  - Internal users can run capture/sync/export operations without confusion.
  - Inspector no longer looks visually disconnected from product.

## CMA-013: Editor responsive and accessibility baseline pass

- Priority: P0
- Estimate: M
- Labels: `ui`, `a11y`, `editor`, `p0`
- Depends on: CMA-011
- Scope:
  - Responsive behavior for laptop/tablet widths.
  - Keyboard focus flow and visible focus styles.
  - Contrast and semantic labeling baseline.
- Acceptance criteria:
  - Editor is usable via keyboard for core operations.
  - No critical contrast regressions on primary screens.

## CMA-014: Launch candidate hardening and release docs lock

- Priority: P0
- Estimate: S
- Labels: `release`, `qa`, `p0`
- Depends on: CMA-002, CMA-003, CMA-005, CMA-008, CMA-011, CMA-013
- Scope:
  - End-to-end smoke runs (capture/edit/export/sync/privacy).
  - Final risk review and rollback notes.
  - Generate context bundle and update release docs.
- Acceptance criteria:
  - Launch checklist passes.
  - `pnpm docs:check` and `pnpm docs:bundle` complete successfully.
