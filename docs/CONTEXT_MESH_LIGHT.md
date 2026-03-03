# Context Mesh (Lightweight Profile)

This project uses a lightweight Context Mesh profile so docs stay aligned with fast development.

## Goals

- Keep operational context current with minimal overhead.
- Preserve key decisions and interfaces.
- Make onboarding and AI-assisted work reliable.

## Canonical Artifacts

- Living state: `docs/STATE.md`
- Decision memory: `docs/adr/*.md`
- Release memory: `docs/CHANGELOG.md`
- Deep baseline snapshots: `docs/audit-pack/`

## Rules

1. Every behavior or contract change must update at least one canonical artifact.
2. Every non-trivial architecture change should include an ADR.
3. Keep docs concise and linked; avoid duplicating the same truth in many files.
4. If uncertain where to write, update `docs/STATE.md` first.

## Recommended Cadence

- Per PR: update `STATE` and/or ADR/changelog.
- Weekly: quick `STATE` cleanup and risk review.
- Per milestone/release: run `pnpm docs:bundle` and attach bundle to release notes.
