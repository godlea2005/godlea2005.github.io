# Homepage guide motion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace abrupt homepage guide reflow and static artwork with continuous, interruptible local interactions.

**Architecture:** Use native Web Animations for measured card geometry and CSS for artwork/deck state transitions. Keep all card and detail content stable in the DOM, with closed details inert; use a small retained-presence hook for the settings exit. No new dependency or backend change.

**Tech Stack:** React, TypeScript, plain CSS, Web Animations, Vitest/Testing Library.

**Spec:** `docs/superpowers/specs/2026-10-31-home-guide-motion.md`

## Global Constraints

- Publication requires the user's explicit “发布” or “上线”; continuation or approval does not authorize it.
- Preserve native cursor, all routing, genuine content, existing keyboard focus behavior, hero, authentication and commerce functionality.
- No new dependency or backend change.
- Do not fabricate analytics.
- Do not modify the user-owned `output/` directory.

### Task 1: Continuous card geometry

**Files:** Create `src/components/home-guide/useGuideLayout.ts`; modify `HomeGuide.tsx`, `home-guide.css`; test `tests/home-guide-motion.test.tsx`.

**Interfaces:** `useGuideLayout(active: string | null, enabled: boolean)` returns `{ grid: RefObject<HTMLDivElement | null>, capture: () => void }`. Capture current rectangles immediately before changing active state. Commit measures final rectangles and animates width/height/translation over 620ms, also grid height. Cancel old animations after capturing their painted rectangles; cancel all on resize, disable or unmount.

- [x] Add a failing hook test using mocked rectangles and `Element.prototype.animate`; assert four cards plus grid animate, first width is the captured width and final width is the new width.

```ts
expect(animate).toHaveBeenCalledWith(expect.arrayContaining([
  expect.objectContaining({ width: '300px' }),
  expect.objectContaining({ width: '620px' }),
]), expect.objectContaining({ duration: 620 }))
```

- [x] Run `npm.cmd test -- tests/home-guide-motion.test.tsx` and confirm failure before implementation.
- [x] Implement capture/measure/animate/cancel in a layout effect. Use `order: -1` and six-column grid with spans 3/6/2 for initial/selected/remaining cards. Details remain DOM-mounted but `inert` and `aria-hidden` when closed.
- [x] Run motion and existing guide tests; add interruption and reduced-motion assertions.

### Task 2: Art, deck and index behavior

**Files:** Modify `GuideArt.tsx`, `HomeGuide.tsx`, `home-guide.css`; create `GuideIndex.tsx`; test `tests/home-guide.test.tsx`.

**Interfaces:** `ArchiveArt({ expanded, selected, onSelect })` maps four layers to metric indices. `IndexArt({ expanded })` reveals the phrase with a bounded CSS steps animation (no timer needed). `GuideIndex` owns `'category' | 'tag'` state and exposes two aria-expanded buttons with inert closed panels. Deck position is `(index - slide + count) % count` and records direction; only front cover is exposed to assistive technology.

- [x] Add tests asserting metric focus changes the SVG selection, category/tag exclusivity, three mounted deck cards and manual order changes. Update former `[hidden]` selectors to `.is-front` because real rear cards remain painted.
- [x] Run guide tests to confirm new expectations fail.
- [x] Replace static layers with four selectable, separated SVG sheets; apply selected accent to both SVG and metric tile. Animate deck transforms/opacity across front/rear positions, with direction-specific outgoing keyframes. Type the index phrase then reveal dashed branches/nodes. Use staged contact-node arrival.
- [x] Run guide and motion tests; preserve independent focus/hover pause and manual reduced-motion controls.

### Task 3: Settings presence and theme motion

**Files:** Create `src/lib/useAnimatedPresence.ts`; modify `SiteSettings.tsx`, `site-settings.css`; test `tests/site-settings.test.tsx`.

**Interfaces:** `useAnimatedPresence(open: boolean, duration: number): boolean` retains the closing subtree, clears its exit timer on reopening/unmount, and returns false after duration. Settings use 240ms exit, immediate close with reduced motion; `data-open`, `aria-hidden` and `inert` reflect the real open prop immediately. Theme pill consumes numeric `--theme-index` 0/1/2.

- [x] Add a fake-timer rerender test: closing removes accessible region immediately but retains inert DOM until 240ms; rapid reopen cancels removal; reduced motion closes immediately.
- [x] Run settings tests and confirm failure.
- [x] Implement presence, panel opacity/scale/translation transitions and sliding pill. Keep outside/Escape/blur behavior and modal focus restoration unchanged.
- [x] Run settings, navigation and cross-page tests.

### Task 4: Local verification and review

**Files:** Record results here after verification; no deploy files.

- [x] Run `npm.cmd test` and `npm.cmd run build` with TEMP/TMP set to `node_modules/.cache/vitest-tmp`.
- [x] Open local preview at desktop and mobile widths. Expand all four cards, reverse mid-animation, switch metrics/index, use next/previous, open/close settings and change theme. Check keyboard and no horizontal overflow. Browser DOM tooling does not expose `getAnimations`; verify actual intermediate rectangles instead of claiming keyframe introspection.
- [x] Request independent review using requesting-code-review skill, fix important findings and rerun affected checks.
- [x] Hand off a local preview URL only. Do not push or publish.

## Plan self-review

All approved behaviors map to Tasks 1–3. Task 4 verifies both semantics and real rendered motion. All new interfaces are defined above; existing theme, route and motion-profile APIs are reused. Inline execution continues in the existing isolated worktree; the executing-plans skill is not installed, so checkpoints are followed directly rather than claiming that skill was run.

## Verified local result (2026-10-31)

- Final full suite: 51 files, 509 tests passed. Production build passed. Existing non-failing JSDOM Canvas notices and >500kB chunk warnings remain.
- Chrome local preview: `http://127.0.0.1:5174/#home-guide`. Tested 1440×1000, 1024×900 and 390×844; reset the viewport override and restored the initial light theme afterward.
- Desktop selected card measured 1200px; the other three measured 385px each at the same top coordinate. During collapse a real intermediate width of 865px was observed between expanded and collapsed sizes.
- Body/client width matched scroll width at medium (1009px) and phone (375px). All four cards were opened, article next and tag index switching were exercised, metric selection matched SVG layer 1, and settings closing retained inert/aria-hidden DOM.
- Mobile long article closing restored focus to a visible trigger (final top 209px). A full reload after development updates produced no new browser errors.
- Independent review found in-flow animated-track movement, a reduced-motion departure stacking bug, and viewport scroll being counted in layout translation. Fixed with frozen destination tracks, cleared/guarded departure state, grid-relative coordinates and preventScroll focus. Reproduced both latter failures before fixing; reviewer confirmed both closed and 18 focused checks passed. Added a further dynamic preference-toggle regression in the final 509-test run.
- Local changes only. No push, deployment, database change or modification to user-owned `output/`.
