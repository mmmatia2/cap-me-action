# GPT Audit Brief (Documentation + UI/UX Refactor)

Use this prompt with GPT and provide the full `docs/audit-pack/` folder plus referenced source files.

## Prompt

You are auditing a Chrome MV3 extension + React app called Cap Me Action.

Read all docs in `docs/audit-pack/` and treat them as the current implementation baseline.  
Assume this is a solo-maintained tool used by a small support team.

Your deliverables:

1. Documentation audit
2. Architecture/code quality audit
3. UI/UX audit and refactor proposal
4. Prioritized implementation plan

Constraints:

- Keep recommendations pragmatic for a small team.
- Favor high impact over enterprise-heavy process.
- Preserve existing capture and export behavior unless change is justified.
- Clearly separate:
  - must-fix now
  - should-fix next
  - nice-to-have later

For each issue, provide:

- Severity (critical/high/medium/low)
- Evidence (file path and behavior)
- User impact
- Suggested fix
- Effort estimate (S/M/L)

For UI/UX refactor specifically, include:

- Current UI inventory assessment by surface:
  - popup
  - floating dock
  - inspector
  - web editor
- Design system proposal:
  - color tokens
  - typography
  - spacing/radius/shadows
  - component primitives
- Interaction model improvements:
  - capture controls consistency
  - session-to-editor handoff
  - export workflow clarity
- Accessibility improvements
- Mobile/responsive considerations for the web editor
- Migration strategy:
  - phase 1 visual consistency wins
  - phase 2 structural componentization
  - phase 3 advanced UX polish

Output format:

1. Executive summary (max 12 bullets)
2. Findings table
3. Proposed target architecture
4. Proposed UI system spec
5. 30/60/90 day refactor plan
6. Risks and rollback strategy

## Optional Follow-Up Prompt

Now convert your plan into concrete GitHub issues with:

- title
- description
- acceptance criteria
- dependencies
- labels
- estimate

Group issues into 3 milestones:

- M1 Foundation
- M2 UX Consistency
- M3 Advanced Authoring
