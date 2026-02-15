# Product Scope And Goals

## Product Summary

Cap Me Action is a web workflow recorder intended as a lightweight alternative to tools like Tango/Scribe for small team usage.

Current implementation is a Chrome MV3 extension plus a React web editor.

## Core User Flow

1. User starts capture from extension popup, inspector, floating dock, or hotkey.
2. Content script records page interactions and sends normalized events.
3. Background service worker creates/updates session and persists step records in `chrome.storage.local`.
4. User opens React editor, imports session from JSON file or directly from extension storage.
5. User edits titles/instructions/notes, reorders steps, adds screenshot highlights.
6. User exports as JSON, Markdown, or HTML.

## Primary Value

- Capture repeatable support workflows quickly.
- Produce shareable guides with contextual screenshots.
- Avoid paid licensing overhead for a small team.

## Intended User Persona

- Support technician or operations user documenting browser tasks.
- Team members consuming exported guides.
- Solo maintainer/developer iterating quickly.

## In Scope Today

- Event capture types: click, key, input, select/toggle, navigation, scroll.
- Session/step persistence in extension local storage.
- Session selection and management in inspector.
- Floating in-page dock during capture.
- Editable web guide generation with screenshot annotation overlays.

## Out Of Scope Today

- Multi-user authentication or shared backend storage.
- Cross-browser extension support.
- Production-grade permissions, compliance, and enterprise controls.
- Robust accessibility system and formal design system.
- Automated test suite and CI quality gates for behavior.

## Product Constraints

- Storage uses `chrome.storage.local` only.
- Extension service worker lifecycle constraints apply (MV3).
- Current UI implementation is functional-first and mixed maturity.
- Data retention is capped in service worker (`sessions.slice(-20)`, `steps.slice(-500)`).

## Current Goal State

- Reliable capture and export flow for a small internal team.
- Improve UX consistency and readability to reduce friction.
- Keep architecture simple enough for rapid iteration.
