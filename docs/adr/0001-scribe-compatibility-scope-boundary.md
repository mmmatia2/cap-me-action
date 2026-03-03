# 0001: Scribe-Compatibility Scope Boundary (Internal Launch Candidate)

- Status: accepted
- Date: 2026-03-03
- Owners: project maintainers

## Context

The team needs an internal production launch candidate within 2 weeks.
The product goal is to be close to Scribe/Tango on core workflow capture and guide authoring, while adding a professional corporate UI and practical AI assistance.

Full parity is not feasible within this window without high delivery risk.
We need an explicit boundary for what "compatible enough" means now.

## Decision

For the current launch window, Scribe-compatibility is defined as:

1. End-to-end recorder flow:
   - Capture browser actions.
   - Edit captured steps.
   - Export procedural guides.
2. Team collaboration baseline:
   - Authenticated team library sync/import for sessions.
3. Authoring quality:
   - Annotation/redaction support with reliable export behavior.
4. Professional product bar:
   - Unified corporate UI system across popup, dock, inspector, and editor.
5. AI baseline:
   - Optional AI rewrite and quality review assistance that is non-destructive.

Out of scope for this launch candidate:

- Full enterprise governance parity (SCIM/advanced audit stack/complex RBAC).
- Advanced analytics platform parity.
- Broad browser support parity beyond current Chrome MV3 foundation.

## Consequences

- Positive:
  - Reduces delivery risk and keeps team focused on high-impact capabilities.
  - Provides clear acceptance criteria for "launch ready."
  - Prevents uncontrolled scope expansion.
- Negative:
  - Some parity gaps remain visible after launch.
  - Additional roadmap phases are required for enterprise-level maturity.
- Risks:
  - Stakeholders may over-assume parity unless scope is communicated clearly.
  - AI features can create trust issues if change provenance is unclear.

## Alternatives Considered

1. Attempt broad feature parity in this window.
   - Rejected due to high regression risk and low confidence in timeline.
2. Ship only recorder stability with no AI/UI push.
   - Rejected because it misses the corporate quality bar required for adoption.

## Rollout Plan

1. Execute workstreams in `docs/roadmaps/2026-03-scribe-compatible-corporate-ai-plan.md`.
2. Track delivery through milestone backlog in `docs/roadmaps/2026-03-execution-backlog.md`.
3. Reassess parity gaps after launch candidate stabilization.

## References

- Code paths:
  - `extension/`
  - `app/src/`
- Related docs:
  - `docs/roadmaps/2026-03-scribe-compatible-corporate-ai-plan.md`
  - `docs/STATE.md`
