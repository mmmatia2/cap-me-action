# 2026-03 Plan: Scribe-Compatible + Corporate AI

Historical snapshot notice: this is a March 2026 planning record, not active execution truth. Some items in this plan are now implemented in repo code, some remain unvalidated, and others are incomplete. Use `docs/STATE.md` and current repo code for present status.

Latest recorded runtime validation evidence in `HEAD` conflicts with the repo-backed backend expectation, but `docs/validation/2026-03-07-linux-mint-auth-boundary-runtime.md` is currently deleted in the working tree and is therefore not an active local source during this refresh.

- Status: proposed
- Date: 2026-03-03
- Horizon: 2 weeks to internal production launch candidate
- Operating model: lightweight Context Mesh (`docs/CONTEXT_MESH_LIGHT.md`)

## Objective

Deliver a production-ready internal recorder/editor that is close to Scribe on core workflow capture and guide authoring, with a polished corporate UI and practical AI assistance for authoring quality.

## Non-Goals (This Window)

- Full enterprise governance parity (SSO/SCIM/audit-compliance stack).
- Full analytics platform parity.
- Multi-browser extension parity.

## Success Criteria

- Capture->edit->export flow is reliable for daily team use.
- Team library sync is authenticated and stable.
- Privacy guardrails are enabled by default.
- UI across popup/dock/inspector/editor is visually unified and production-grade.
- AI authoring features reduce editing time without blocking manual control.

## Target Capability Set

1. Scribe-compatible core:
   - Stable capture of click/input/select/toggle/key/navigation/scroll.
   - Session editing, reorder, merge, annotation, redaction, and export.
   - Team library listing/import and one-click handoff from extension to editor.
2. Corporate AI layer:
   - AI rewrite for step titles/instructions (tone presets).
   - AI procedure QA (missing step detection, vague instruction warnings).
   - AI privacy assist (sensitive text warnings, redaction suggestions).
3. Corporate UX:
   - Shared design system/tokens/components across all surfaces.
   - Professional responsive editor and consistent interaction model.

## Workstreams

## WS1: Reliability + Production Readiness

- Fix known editor integration defects (`mergeStepWithNext`, `onStepDragEnd`).
- Enforce typed contract consistency for annotations including `redact` type.
- Add URL query import/handoff support from extension (`source`, `sessionId`).
- Add error boundaries and recoverable error states in app/editor.
- Add baseline tests:
  - Session/step migration tests.
  - Export snapshot tests (JSON/Markdown/HTML).
  - Reducer tests for reorder/delete/merge.
- Add CI quality gates:
  - Build.
  - Docs sync (`pnpm docs:check`).
  - Test suite.

Definition of done:
- Zero blocking runtime errors in smoke test.
- Reproducible local + CI pass for build/tests/docs checks.

## WS2: Sync/Auth + Team Library Hardening

- Finalize OAuth client configuration and environment setup runbook.
- Build extension sync settings UI (enable, endpoint, mask values, auto-upload, allowed emails).
- Validate Apps Script endpoint against real Drive folder and real user accounts.
- Implement sync failure UX states and retry visibility.
- Add operational limits guidance (storage retention, quota behavior).

Definition of done:
- Team member can authenticate, sync, list, and import sessions reliably.
- Known error codes map to actionable user guidance.

## WS3: Privacy + Security Guardrails

- Default masking for captured input values in sync/export paths.
- Preserve and render redaction boxes consistently across migration/export.
- Add pre-export privacy review banner/checklist.
- Remove sensitive token persistence in plain localStorage where possible.
- Dependency remediation for reported vulnerabilities and lockfile refresh.

Definition of done:
- Privacy review passes for sample sensitive workflow.
- No known high vulnerabilities in production dependency graph.

## WS4: Corporate AI Authoring

- Add AI service adapter boundary (`AIProvider` interface).
- Ship 3 first AI actions:
  - Rewrite selected step.
  - Rewrite full procedure in selected tone.
  - Procedure quality review (clarity, sequencing, missing context).
- Add AI provenance in UI (show what was changed and allow revert).
- Add prompt/version logging metadata in exported JSON `meta` block.

Definition of done:
- AI features are optional, non-destructive, and produce measurable edit-time reduction.

## WS5: Professional UI System (Final Step)

- Create shared token package and remove ad-hoc inline style divergence.
- Unify typography, spacing, radius, shadows, and button patterns.
- Redesign inspector from utilitarian debug look to production admin surface.
- Normalize extension popup/dock/editor visual language.
- Add responsive pass for editor (desktop + laptop + tablet).
- Add accessibility baseline:
  - Keyboard focus order.
  - Visible focus rings.
  - Contrast pass.
  - ARIA labels for controls.

Definition of done:
- Cross-surface visual consistency achieved.
- UI accepted by internal stakeholders as production-grade.

## Sequencing (2 Weeks)

1. Days 1-3:
   - WS1 critical fixes + WS2 OAuth/setup + WS3 vulnerability/privacy quick wins.
2. Days 4-6:
   - WS1 tests/CI + WS2 sync UX hardening + WS4 AI adapter and first action.
3. Days 7-9:
   - WS4 remaining AI actions + WS3 export privacy review experience.
4. Days 10-12:
   - WS5 full UI system pass (final planned step).
5. Days 13-14:
   - Regression, docs lock, release checklist, launch candidate.

## Context Mesh Integration Requirements

For each merged PR in this plan:

- Update `docs/STATE.md` for behavior/contract/risk changes.
- Update `docs/CHANGELOG.md` for user-visible changes.
- Add ADR for non-trivial decisions:
  - `0001`: Scribe-compatible scope boundary.
  - `0002`: Sync/auth architecture and trust boundary.
  - `0003`: AI architecture and privacy policy.
  - `0004`: Unified design system and UI migration strategy.

## Release Checklist

- Functional smoke test:
  - Start capture -> perform workflow -> stop -> open editor -> edit -> export.
- Sync smoke test:
  - Authenticate -> auto upload -> manual sync -> import team session.
- Privacy smoke test:
  - Confirm masking/redaction behavior in exported artifacts.
- Performance sanity:
  - Large session load/edit/export remains responsive.
- Documentation lock:
  - `pnpm docs:check` passing.
  - `pnpm docs:bundle` generated for release handoff.
