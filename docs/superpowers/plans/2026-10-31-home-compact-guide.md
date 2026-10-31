# Compact Home Guide Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver the approved sparse homepage and four expanding guide cards, with a unified settings/search/announcement surface.

**Architecture:** HomePage composes StatusScene and HomeGuide. A shared typed guide model derives statistics, category/tag filters and recent posts from editorial metadata. Header owns mutually exclusive navigation, settings, search and announcement state; App owns theme preference and resolved theme separately.

**Tech Stack:** React, TypeScript, plain CSS, Vitest/Testing Library, existing browser QA.

**Spec:** docs/superpowers/specs/2026-10-31-home-compact-guide-design.md

## Global Constraints

- Local only; no push/publication/backend changes; output/ remains untouched.
- Keep full-screen waves and particle/title interaction, existing independent routes, auth and music.
- Original graphics; no copied reference source/assets. No fabricated visitor counts or contact URLs.
- 44px interaction targets, keyboard semantics, focus restoration, reduced motion, 1440/1024/390 dark/light QA.

### Task 1: Guide model, compact hero and four-card homepage

**Files:** create src/components/home-guide/{model.ts,HomeGuide.tsx,GuideArt.tsx,home-guide.css}; modify src/components/{HomePage.tsx,StatusScene.tsx,status-scene.css}, src/editorial/WritingIndexPage.tsx, src/content/navigation.ts; tests/home-guide.test.tsx.

**Interfaces:** export guideCategories (`{name:string,articles:ArticleSummary[]}[]`), guideTags (`string[]`), `writingFilterHref(kind:'category'|'tag', value:string):string`; HomeGuide has no required props. Category rule is existing writing-index rule: 电商内容 tag => 电商内容, otherwise 设计实践.

- [ ] Add failing tests: `expect(screen.getByRole('button',{name:/展开站点数据/})).toHaveAttribute('aria-expanded','false')`; click to open, switch cards, click again to close; verify counts equal metadata and tag links encode the filter.
- [ ] Run `npm.cmd test -- tests/home-guide.test.tsx`, expect missing module failure.
- [ ] Implement four cards using native sibling header buttons and panel content, not nested interactive parents. Expanded card spans full grid. Controller stores `active: 'stats'|'posts'|'index'|'contact'|null`. Articles rotate via cleaned interval only when intersection/document visibility/motion permit, pause on focus/hover, allow buttons and horizontal pointer swipes. SVG artwork represents original archive layers, content branches and contact orbit. Article cards use existing local visualNotes images; no invented article covers in metadata.
- [ ] Add `#writing?tag=...` and `#writing?category=...` parsing within WritingIndexPage; maintain `#writing` routing and react to hashchange. Derive filters from shared model. Replace removed navigation destinations with #writing or #about; HomeGuide retains #about contact anchor and opens contact card for direct hash.
- [ ] Remove six home sections from HomePage; remove large blog word/eyebrow/actions/status decorations from StatusScene; one WENHAO H1, AI 工程师 and looping TextType, downward #home-guide link. Center compact copy; no framing card. Preserve background config and motion profile.
- [ ] Run focused tests and build. Commit scoped deliverable after verification.

### Task 2: Unified settings, search, announcements and theme

**Files:** create src/components/{SiteSettings.tsx,SiteAnnouncements.tsx,site-settings.css}, src/content/announcements.ts, src/lib/useThemePreference.ts; modify src/{App.tsx,lib/theme.ts}, src/components/{FloatingHeader.tsx,floating-header.css,SiteSearchDialog.tsx,site-search-dialog.css}; tests/site-settings.test.tsx.

**Interfaces:** `ThemePreference = Theme | 'system'`; `useThemePreference(): {theme:Theme,preference:ThemePreference,setPreference:(value:ThemePreference)=>void}`. FloatingHeader optional themePreference/onThemePreferenceChange keeps old onToggleTheme compatibility for isolated existing tests. SiteSettings receives controlled open/onOpenChange/onSearch/onAnnouncements and preference setters. Announcement uses existing ModalSurface.

- [ ] Add failing tests for opening settings, three theme radio buttons, selecting theme callback, search/announcement callbacks, outside and Escape closing. Add preference tests for old values, system resolution and storage separation.
- [ ] Run focused tests to prove missing-module failure.
- [ ] Persist preference separately from resolved theme; keep applyTheme's legacy default persistence argument but hook calls `applyTheme(theme,false)`. System changes update resolved theme without overwriting 'system'.
- [ ] Replace two persistent header buttons with 48px settings trigger and compact dropdown (search, announcement, segmented theme radios). Header closes navigation/settings before modal; route changes close all; keyboard Ctrl+K toggles search only when it owns the modal or no other modal is open. Reuse ModalSurface lifecycle.
- [ ] Search uses a wide pill input over blurred backdrop, no idle result pile; Enter activates first rendered result, explicit arrow button does same, Escape uses ModalSurface; result links preserve safe external attributes. Announcements are typed local true update records, close button and acknowledgment; no fake social links.
- [ ] Run focused tests/build, then whole suite; update only assertions invalidated by approved home removal and menu structure, preserve auth/route and cursor contracts.

### Task 3: Visual QA and local handoff

**Files:** update directly affected homepage/navigation/search tests and docs/project-log.md as needed.

- [ ] Run complete tests (`TEMP`/`TMP` worktree node_modules/.cache/vitest-tmp), expect zero failures, and production build.
- [ ] Start Vite bound 127.0.0.1. Browser inspect 1440×1000,1024×900,390×844 in dark/light; test settings, search empty/results/Enter/Escape, announcements, system preference, four-card switching/closing, index filter routes, article controls/drag and contact anchor; no page overflow or dock overlap.
- [ ] Check keyboard focus/44px targets, reduced-motion static state; fix defects and repeat relevant tests.
- [ ] Record actual evidence and any remaining gaps, commit only scoped tracked files; show local homepage and stop before push/publish.

## Plan Self-Review

Spec coverage mapped to three deliverables. Shared model owns filters/counts; theme preference is distinct from resolved Theme. No backend or dependency additions. Original visuals are code-native. Empty content and failed images remain usable, unconfigured contacts omitted. Implementation is inline because the requested execution skill is unavailable locally; follow these explicit test/verification checkpoints without claiming that skill ran.
