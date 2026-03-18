# Quality Risks And Known Gaps

Historical snapshot notice: this document captures March 2026 risk framing, not current implementation or environment truth. Reconcile against `docs/STATE.md`, `docs/team-library-protocol.md`, and current repo code before relying on it.

Some risks below are intentionally left as historical statements from that snapshot, but they should not be read as proof of today's exact runtime or deployment state.

## Product Risks

1. Capture quality depends on extension permissions and tab context.
2. Browser event model can still produce noisy or ambiguous step semantics on complex web apps.
3. Local capture data was still centered on `chrome.storage.local` in this snapshot; current repo code also includes a repo-backed team-library path, so do not read this line as current environment truth.

## Technical Risks

1. `app/src/App.jsx` is a large single component (maintainability risk).
2. No automated test suite for capture normalization, storage mutation, or export output.
3. Schema/version compatibility was still treated as a risk in this snapshot, even though current repo code now includes explicit schema/version constants.
4. MV3 service worker lifecycle may cause edge-case timing behavior under heavy use.

## Data/Storage Risks

1. `chrome.storage.local` capacity constraints can impact screenshot-heavy sessions.
2. Data retention truncates old sessions/steps (`20/500`), potentially surprising users.
3. Base64 thumbnails increase payload sizes for JSON/HTML exports.

## UX Risks

1. Multi-surface UI consistency is incomplete (popup/dock/editor/inspector look different).
2. Inspector is powerful but not user-friendly for non-technical teammates.
3. Some popup controls are visual placeholders and may imply unsupported features.
4. Split flow between extension and app can feel fragmented without strong handoff cues.

## Accessibility Gaps

1. No formal keyboard navigation/accessibility audit completed.
2. Color contrast and focus states are not standardized through a design system.
3. Annotation interactions are mouse-first and need keyboard/accessibility strategy.

## Security/Privacy Notes

1. Sensitive data redaction is not automated.
2. Input capture excludes password/hidden/file values but other fields may still contain sensitive text.
3. Exported files may contain full URLs/page titles and screenshot content.

## Operational Gaps

1. No backend telemetry/error reporting.
2. Release/versioning strategy beyond the repo's explicit schema/protocol constants was not yet settled in this snapshot.
3. No scripted migration path for storage format changes.

## Suggested Priority Order

1. Refactor app/editor into modules with tests around contracts.
2. Define UI system and unify extension/app visual language.
3. Add schema version and migration strategy for exports/storage.
4. Add optional privacy guardrails (redaction/field filters/warnings).
