# Changelog

All notable user-visible changes should be recorded here.

## 2026-03-03

- Established lightweight Context Mesh documentation system.
- Added living-doc update rules, ADR templates, PR doc-impact checklist, and CI doc-sync guard.
- Added execution roadmap for Scribe-compatible core + corporate AI + professional UI:
  - `docs/roadmaps/2026-03-scribe-compatible-corporate-ai-plan.md`
- Added ADR `0001` to lock Scribe-compatibility launch scope boundary.
- Added execution backlog with milestone-ready implementation tickets:
  - `docs/roadmaps/2026-03-execution-backlog.md`
- Implemented `CMA-001` editor blocker fix:
  - Added `mergeStepWithNext` and `onStepDragEnd` handlers.
  - Removed duplicate `patchStep` declaration in `app/src/App.jsx`.
- Implemented `CMA-002` deep-link session handoff:
  - App now parses `source` and `sessionId` from URL query params.
  - App auto-loads/imports requested local/team session when available.
  - App now surfaces clear not-found messages for unresolved deep-linked session IDs.
- Implemented `CMA-003` redaction contract consistency:
  - Preserved annotation `type` (`highlight`/`redact`) in app normalization and migration/export helpers.
  - Extended shared annotation contract type with explicit `type` field.
  - Updated HTML export overlays so redactions render as opaque masks and summaries track redactions separately.
- Implemented `CMA-004` extension sync settings UI in inspector:
  - Added sync settings form for `enabled`, endpoint URL, auto-upload, masking, and allow-list emails.
  - Added validation and save-state feedback for sync settings persistence in `chrome.storage.local.syncConfig`.
- Advanced `CMA-005` sync/auth setup readiness:
  - Added inspector `Sign In` / `Sign Out` controls with connected account display.
  - Added OAuth client ID helper script: `pnpm extension:set-oauth-client-id -- --client-id \"...apps.googleusercontent.com\"`.
  - Expanded `docs/TEAM_SYNC_APPS_SCRIPT.md` into full step-by-step production runbook.
