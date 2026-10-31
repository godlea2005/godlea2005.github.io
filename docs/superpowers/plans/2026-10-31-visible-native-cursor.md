# Visible Native Cursor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep the native pointer visible while retaining the target-frame effect on all opted-in clickable cards.

**Architecture:** Correct the shared active-target CSS rule only. No changes to pointer event listeners, motion eligibility, overlay geometry, routing or target opt-in scope.

**Tech Stack:** CSS, React, Vitest/Testing Library.

**Spec:** User-approved in chat on 2026-10-31: preserve green frame, show native hand pointer over links, apply to equivalent cards globally; local only.

## Global Constraints

- No publication, backend changes or edits to output/.
- Keep green target frame and its pointer-events:none behavior.
- Keep touch, reduced-motion and protected form/modal behavior unchanged.

### Task 1: Correct shared active cursor and verify

**Files:** src/components/target-cursor.css; tests/target-cursor.test.tsx.

**Interfaces:** Existing `[data-target-cursor].target-cursor-active` class contract remains unchanged.

- [ ] Add a regression rendering an opted-in link with actual stylesheet injected, fire pointerOver, assert overlay visible and `getComputedStyle(link).cursor === 'pointer'`; assert no `cursor:none` remains and overlay pointerEvents is none. Remove injected style in finally.
- [ ] Run `npm.cmd test -- tests/target-cursor.test.tsx`, expect failure because computed cursor is none.
- [ ] Change active-target rule to `cursor: pointer;` (one declaration). Native pointer stays visible over all opted-in clickable cards; overlay still frames target.
- [ ] Run cursor/navigation tests, production build and diff check. In local browser open navigation, pointer over a link and inspect computed cursor/frame visibility.
- [ ] Preserve implementation as local commit and report only verified results. No push/publication.

Self-review: complete narrow scope, explicit before/after behavior, no additional dependencies. Inline execution uses this checkpoint plan; executing-plans skill is unavailable on this machine.
