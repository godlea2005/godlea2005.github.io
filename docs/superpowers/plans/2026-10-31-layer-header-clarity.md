# Layer and header clarity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the archive layers countable and align all three header controls.

**Architecture:** Modify the existing SVG artwork and scoped CSS, preserving React selection/state APIs. Shared header custom properties provide one height/radius/material; stationary SVG hit regions avoid feedback from selected-layer motion.

**Tech Stack:** React, TypeScript, SVG, plain CSS, Vitest.

**Spec:** `docs/superpowers/specs/2026-10-31-layer-header-clarity-design.md`

## Global Constraints

- Only local changes. Do not push, publish, change backend data or touch user-owned `output/`.
- Keep the existing dropdown/search/theme interactions.
- Preserve four metric indices, green selection linkage, original styling and reduced-motion support.

### Task 1: Clear four-sheet artwork

**Files:** Modify `src/components/home-guide/GuideArt.tsx`, `home-guide.css`; create `tests/archive-art.test.tsx`.

**Interfaces:** Keep `ArchiveArt({ expanded: boolean, selected: number, onSelect: (index: number) => void })`. Four outer `.archive-sheet` groups hold stationary `.archive-sheet-hit` paths and moving `.archive-sheet-body` artwork.

- [x] Add failing structural and interaction tests:

```ts
expect(container.querySelectorAll('.archive-sheet-face')).toHaveLength(4)
expect(container.querySelectorAll('.archive-sheet-edge')).toHaveLength(0)
expect(container.querySelectorAll('.archive-sheet-label')).toHaveLength(4)
fireEvent.pointerEnter(container.querySelector('[data-layer="2"]')!)
expect(onSelect).toHaveBeenCalledWith(2)
```

- [x] Run `npm.cmd test -- tests/archive-art.test.tsx` and confirm failure.
- [x] Remove doubled edge paths; use a flatter rounded diamond and 400×360 viewBox. Add small per-layer labels, stable transparent hit paths and a nested body for selected lift. CSS sets 60/68px spacing and `translate(8px,-18px)` only on selected body; add a soft shadow rather than another contour.
- [x] Run artwork and home-guide tests, inspect selected first/middle/last sheet in local preview.

### Task 2: Equal-height edge-aligned header

**Files:** Modify `src/components/floating-header.css`, `site-settings.css`, `tests/cross-page-shell.test.tsx`.

**Interfaces:** `.floating-header` defines `--header-control-height: 52px`, `--header-control-radius: 999px`, `--settings-control-width: 76px`, `--header-control-surface`. Shared control rule consumes height/radius. Phone overrides set 48px/64px; dropdown arrow and animation origin consume settings width.

- [x] Update former circular-settings static regression and add checks for shared height token and viewport-edge positioning; confirm failure:

```ts
expect(css).toContain('--header-control-height: 52px')
expect(css).not.toContain('width: min(1240px')
expect(settingsCss).toContain('width: var(--settings-control-width)')
expect(settingsCss).not.toContain('transform: rotate(90deg); background: var(--soft)')
```

- [x] Use left/right inset safe-area values, no max-width or centering transform on header. Center nav with equal minmax side columns. Apply shared tokens to all three controls, widen settings and rotate only SVG. Keep arrow aligned to widened trigger. Compact phone brand as necessary to keep 320px layout intact.
- [x] Run header/settings/navigation tests. Inspect actual heights/edges and dropdown bounds at 1440px, 390px and 320px; test an inner route and open menu, then reset viewport.

### Task 3: Verify and hand off locally

- [x] Run full `npm.cmd test`, `npm.cmd run build`, `git diff --check`.
- [x] Request independent scoped code review; fix important issues.
- [x] Record results and retain local preview. No push/deployment.

Self-review: scope is limited to two visual corrections; no new state APIs, dependencies or backend work. Inline execution follows these checkpoints in the existing isolated checkout (executing-plans is not installed). User requested implementing both approved changes together, so no additional process choice is needed.

## Local verification

- Full suite: 52 files / 511 tests passed; build and diff whitespace check passed. Existing Canvas-emulation and bundle-size warnings remain non-failing.
- Actual Chrome viewport tests: 1440×1000, 390×844, 320×740. All three header controls measured the same 51.996px height on desktop and 47.995px on phone (52/48 CSS-pixel targets). Shared top positions matched in closed and open settings states. Desktop brand/settings had 20px edge gaps; phone had 12px. Navigation stayed centered, with no overlaps at 320px.
- Body client/scroll widths matched at 390 (375px). The 320px dropdown initially extended 3px past the left viewport due to scrollbar width; a conservative safe-area-aware max-width corrected it to left=21px, right=293px, width=272px inside a 305px content viewport. Dropdown and navigation remained usable. Inner `#tools` route retained all three 52px controls and edge placement.
- Verified closed artwork and expanded first/last selection, with middle selection also visible during the automatic preview. An intrinsic SVG grid-size overflow discovered visually was fixed by positioning the SVG absolutely inside its reserved stage; both stage/SVG now measure 340px height and end before the title.
- Independent read-only review: no blockers; reviewer independently reran 17 artwork/shell tests successfully. No publication, push, backend changes or edits to `output/`.
