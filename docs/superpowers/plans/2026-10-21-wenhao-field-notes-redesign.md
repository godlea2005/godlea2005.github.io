# WENHAO Field Notes Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the existing commerce-first homepage into WENHAO Field Notes: an original personal editorial blog with real article/project routes, restrained React Bits-inspired interactions, original visual notes, and a coherent shell across every existing page.

**Architecture:** Keep the current React/Vite hash-routed application and business integrations intact. Introduce a typed editorial content domain and route parser, lazy standalone editorial pages, focused interaction components, and a `HomePage` composition that owns only section order. Existing commerce, guestbook and music logic remains isolated; the redesign changes their shared shell and visual tokens, not their repositories, authentication, database calls or audio state.

**Tech Stack:** React 19, TypeScript, Vite, Vitest, Testing Library, plain CSS, existing OGL/Three renderers, built-in image generation for six project-bound raster assets, browser QA through the app browser or Playwright.

**Spec:** `docs/superpowers/specs/2026-10-21-wenhao-field-notes-redesign.md`

## Global Constraints

- The homepage identity is “文昊的个人编辑型博客”; AI commerce is one featured laboratory, not the whole-site theme.
- Do not reuse reference-site text, images, visual assets, character art, dialog composition, navigation appearance or a one-to-one layout.
- Keep the existing `#ai-commerce`, `#tools`, `#guestbook`, `#music` and `#commerce-admin` behavior available.
- Do not change Supabase authentication, guestbook persistence, DeepSeek generation, upload security, quota, cleanup or database logic.
- Card Nav, Target Cursor, Text Type, Tilted Card, Masonry, Gradient Waves and Particle Text each have the single scoped use defined by the spec; do not scatter effects across normal reading content.
- No large animation dependency may be added. Use React, CSS and existing OGL/Three dependencies.
- Every effect must have a static, keyboard-usable and reduced-motion-safe fallback.
- Target Cursor is present only for fine hover pointers and explicit `[data-target-cursor]` targets; it must stay out of forms and modal contents.
- Provide exactly 3 initial articles, 3 projects and 6 visual notes without fabricated clients, metrics, awards or brand partnerships.
- Generated visual assets contain no text, logo, watermark or identifiable portrait and must be stored under `public/images/field-notes/` as WebP.
- Preserve at least 44px interactive hit targets and validate 1440×1000, 1024×900, 768×1024 and 390×844 in both themes.
- Leave the user-owned untracked `output/` directory untouched and unstaged.
- Work locally only. Do not push GitHub or deploy until the user reviews the local build and explicitly approves release.

---

## File Structure

| Path | Responsibility |
| --- | --- |
| `src/editorial/types.ts` | Article, project, visual-note and article-block contracts. |
| `src/editorial/index.ts` | Lightweight article/project summaries and six visual-note records used by the homepage, indexes and search. |
| `src/editorial/articleDetails.ts` | Full article bodies and `findArticle`; imported only by the lazy article page chunk. |
| `src/editorial/projectDetails.ts` | Full project case-study bodies and `findProject`; imported only by the lazy project page chunk. |
| `src/editorial/search.ts` | Pure grouped site-search index over navigation, editorial content and tools. |
| `src/content/navigation.ts` | Shared Card Nav groups and public page destinations. |
| `src/lib/siteRoutes.ts` | Exact static and dynamic hash parsing. |
| `src/editorial/WritingIndexPage.tsx` | Filterable chronological article index. |
| `src/editorial/ArticlePage.tsx` | Accessible article detail and missing-slug state. |
| `src/editorial/WorkIndexPage.tsx` | Project index. |
| `src/editorial/ProjectPage.tsx` | Project case-study detail and missing-slug state. |
| `src/editorial/editorial-pages.css` | Reading and case-study page layout. |
| `src/components/FloatingHeader.tsx` | Original Card Nav shell, mobile drawer and grouped search UI. |
| `src/components/CardNav.tsx` | Expand/collapse, grouped navigation cards and mobile drawer semantics. |
| `src/components/SiteSearchDialog.tsx` | Grouped site search rendered inside ModalSurface. |
| `src/components/floating-header.css` | Lightweight brand/actions/header positioning. |
| `src/components/card-nav.css` | Compact/expanded Card Nav and mobile drawer styling. |
| `src/components/site-search-dialog.css` | Search modal/result styling. |
| `src/components/TextType.tsx` | One-pass, accessible hero descriptor typing. |
| `src/components/text-type.css` | Caret and reduced-motion styling. |
| `src/lib/useMotionProfile.ts` | Shared reduced-motion, fine-hover and page-visibility state. |
| `src/components/StatusScene.tsx` | Full-bleed waves, WENHAO particle mark, Text Type and hero actions. |
| `src/components/status-scene.css` | Full-screen hero composition and static fallbacks. |
| `src/components/GradientWaves/GradientWaves.jsx` | WebGL initialization/observer fallbacks and zero-speed RAF control. |
| `src/components/ParticleText/ParticleText.tsx` | Event-driven particle settling instead of a permanent animation loop. |
| `src/components/GradientWaves/GradientWaves.css` | Permanent static fallback behind the canvas. |
| `src/components/ParticleText/ParticleText.css` | Static, forming and settled text states. |
| `src/editorial/TiltedCard.tsx` | Restrained pointer tilt for featured projects. |
| `src/editorial/tilted-card.css` | Six-degree transform, glare and fallbacks. |
| `src/editorial/VisualNotes.tsx` | Masonry gallery and accessible detail modal. |
| `src/editorial/visual-notes.css` | Responsive masonry columns and modal styling. |
| `src/components/HomePage.tsx` | Approved homepage section composition. |
| `src/components/FeaturedNotes.tsx` | One lead and two secondary article cards. |
| `src/components/SelectedWork.tsx` | Featured project cards using TiltedCard. |
| `src/components/WritingPreview.tsx` | Recent article list and writing-index link. |
| `src/components/AboutSection.tsx` | Personal summary, current status and contact links. |
| `src/components/SiteFooter.tsx` | Footer with a unique `site-footer` anchor, separate from About. |
| `src/components/CommerceHomeSection.tsx` | Compact commerce-lab feature, not the former full demo. |
| `src/components/home-sections.css` | Editorial homepage sections and responsive layout. |
| `public/images/field-notes/*.webp` | Six original generated visual-note assets. |
| `src/styles.css` | Root tokens, global reset, frame, footer and cross-page surface rules only. |
| Existing page CSS | Page-specific visual alignment for tools, guestbook, commerce and music. |

### Task 1: Typed editorial content and exact hash routing

**Files:**
- Create: `src/editorial/types.ts`
- Create: `src/editorial/index.ts`
- Create: `src/editorial/articleDetails.ts`
- Create: `src/editorial/projectDetails.ts`
- Modify: `src/lib/siteRoutes.ts`
- Create: `tests/editorial-content.test.ts`
- Create: `tests/site-routes.test.ts`
- Modify: `tests/tool-navigation-route.test.tsx`

**Interfaces:**
- Produces `ArticleBlock`, `Article`, `ArticleSummary`, `Project`, `ProjectSummary`, `VisualNote`, `articleSummaries`, `projectSummaries`, `visualNotes`, `findArticle(slug)` and `findProject(slug)`.
- Homepage/search/index modules import only `src/editorial/index.ts`; full bodies stay behind the lazy article/project chunks.
- Produces `StaticPage`, `SiteRoute`, `parseSiteRoute(hash)`, `isSiteSubpageRoute(route)`, `isRouteCurrent(route, destinationHash)` and preserves `isSiteSubpageHash(hash)` for current callers.
- Slugs are lowercase ASCII kebab-case and unique inside their own collection.

- [ ] **Step 1: Write failing content-contract tests**

```ts
import { articleSummaries, projectSummaries, visualNotes } from '../src/editorial/index'
import { findArticle } from '../src/editorial/articleDetails'
import { findProject } from '../src/editorial/projectDetails'

it('ships the approved honest editorial collection', () => {
  expect(articleSummaries).toHaveLength(3)
  expect(projectSummaries).toHaveLength(3)
  expect(visualNotes).toHaveLength(6)
  expect(new Set(articleSummaries.map((item) => item.slug)).size).toBe(articleSummaries.length)
  expect(new Set(projectSummaries.map((item) => item.slug)).size).toBe(projectSummaries.length)
  expect(visualNotes.every((item) => item.alt.trim() && item.image.endsWith('.webp'))).toBe(true)
  expect(projectSummaries.every((item) => item.kind === 'personal-experiment')).toBe(true)
  expect(articleSummaries.every((item) => findArticle(item.slug)?.body.length)).toBe(true)
  expect(projectSummaries.every((item) => findProject(item.slug)?.process.length)).toBe(true)
})
```

- [ ] **Step 2: Run the focused test and verify failure**

Run: `npm.cmd test -- tests/editorial-content.test.ts`  
Expected: FAIL because the editorial index/detail modules do not exist.

- [ ] **Step 3: Create the exact editorial contracts**

```ts
export type ArticleBlock =
  | { type: 'paragraph'; text: string }
  | { type: 'heading'; text: string }
  | { type: 'quote'; text: string }
  | { type: 'list'; items: string[] }

export type Article = {
  slug: string
  title: string
  excerpt: string
  date: string
  readingMinutes: number
  tags: string[]
  featured: boolean
  body: ArticleBlock[]
}

export type ArticleSummary = Omit<Article, 'body'>

export type Project = {
  slug: string
  title: string
  summary: string
  role: string
  period: string
  tags: string[]
  cover: string
  coverAlt: string
  kind: 'personal-experiment'
  challenge: string
  process: string[]
  outcome: string
}

export type ProjectSummary = Omit<Project, 'challenge' | 'process' | 'outcome'>

export type VisualNote = {
  id: string
  image: string
  alt: string
  caption: string
  date: string
  ratio: 'portrait' | 'landscape' | 'square'
}
```

- [ ] **Step 4: Populate the initial honest content**

Put summary metadata in `index.ts` and full bodies in `articleDetails.ts` / `projectDetails.ts`. Use these exact article titles and themes:

1. `ai-speeds-up-judgment` — “AI 不替代设计，它让判断更快抵达现场”; sections: “先定义问题”, “让模型扩大选择”, “最后的判断仍属于人”.
2. `commerce-every-step-has-a-next-step` — “电商内容的关键，是让每一步都有下一步”; sections: “首图只负责第一步”, “详情页建立连续理由”, “平台语境决定顺序”.
3. `design-becomes-real-in-frontend` — “把设计做进前端之后，细节才真正有了重量”; sections: “静态稿没有最后一公里”, “动效必须解释关系”, “性能也是视觉的一部分”.

Mark all three initial article summaries `featured: true`. Use the three current project titles as personal experiments: “内容增长实验室”, “品牌的第一次相遇”, “有呼吸感的页面”. Expand each with a role, challenge, three process steps and an outcome phrased as learning or working result, never a client metric. Assign the first three visual-note images as project covers. Define all six visual notes with concrete Chinese alt text and captions matching the assets specified in Task 5.

- [ ] **Step 5: Write failing route-parser tests**

```ts
import { parseSiteRoute, isSiteSubpageRoute } from '../src/lib/siteRoutes'

it.each([
  ['#writing', { kind: 'static', page: 'writing' }],
  ['#work', { kind: 'static', page: 'work' }],
  ['#article/ai-speeds-up-judgment', { kind: 'article', slug: 'ai-speeds-up-judgment' }],
  ['#project/content-growth-lab', { kind: 'project', slug: 'content-growth-lab' }],
])('parses %s', (hash, expected) => expect(parseSiteRoute(hash)).toEqual(expected))

it('keeps homepage anchors on the homepage', () => {
  expect(parseSiteRoute('#featured')).toEqual({ kind: 'home', anchor: 'featured' })
  expect(isSiteSubpageRoute(parseSiteRoute('#top'))).toBe(false)
})

it('groups detail routes under their parent destinations', () => {
  expect(isRouteCurrent(parseSiteRoute('#article/ai-speeds-up-judgment'), '#writing')).toBe(true)
  expect(isRouteCurrent(parseSiteRoute('#project/content-growth-lab'), '#work')).toBe(true)
})
```

- [ ] **Step 6: Implement exact static/dynamic routing**

```ts
export type StaticPage = 'music' | 'guestbook' | 'ai-commerce' | 'commerce-admin' | 'tools' | 'writing' | 'work'
export type SiteRoute =
  | { kind: 'home'; anchor: string }
  | { kind: 'static'; page: StaticPage }
  | { kind: 'article'; slug: string }
  | { kind: 'project'; slug: string }

export const parseSiteRoute = (hash: string): SiteRoute => {
  const article = hash.match(/^#article\/([a-z0-9-]+)$/)
  if (article) return { kind: 'article', slug: article[1] }
  const project = hash.match(/^#project\/([a-z0-9-]+)$/)
  if (project) return { kind: 'project', slug: project[1] }
  const staticPage = staticPageByHash[hash as keyof typeof staticPageByHash]
  return staticPage ? { kind: 'static', page: staticPage } : { kind: 'home', anchor: hash.replace(/^#/, '') || 'top' }
}
```

`isSiteSubpageHash` delegates to `isSiteSubpageRoute(parseSiteRoute(hash))` so existing imports remain valid. Update the old exact-array assertion in `tests/tool-navigation-route.test.tsx` to the new route behavior instead of freezing the implementation array.

`isRouteCurrent` returns true for exact static routes, maps every article to `#writing`, every project to `#work`, and maps homepage anchors only to their own `#<anchor>` destination. FloatingHeader consumes this helper so article/project detail pages keep the correct parent card highlighted.

- [ ] **Step 7: Run focused tests and commit**

Run: `npm.cmd test -- tests/editorial-content.test.ts tests/site-routes.test.ts tests/tool-navigation-route.test.tsx`  
Expected: PASS.

```powershell
git add -- src/editorial/types.ts src/editorial/index.ts src/editorial/articleDetails.ts src/editorial/projectDetails.ts src/lib/siteRoutes.ts tests/editorial-content.test.ts tests/site-routes.test.ts tests/tool-navigation-route.test.tsx
git commit -m "feat: add editorial content and routes"
```

### Task 2: Real writing and project index/detail pages

**Files:**
- Create: `src/editorial/WritingIndexPage.tsx`
- Create: `src/editorial/ArticlePage.tsx`
- Create: `src/editorial/WorkIndexPage.tsx`
- Create: `src/editorial/ProjectPage.tsx`
- Create: `src/editorial/editorial-pages.css`
- Modify: `src/App.tsx`
- Create: `tests/editorial-pages.test.tsx`
- Modify: `tests/tool-navigation-route.test.tsx`

**Interfaces:**
- `ArticlePage({ slug }: { slug: string })` imports `findArticle`; `ProjectPage({ slug }: { slug: string })` imports `findProject`; each renders either full content or an in-site not-found panel.
- `WritingIndexPage` owns only selected-tag state; `WorkIndexPage` is data-driven and stateless.
- App resolves one `SiteRoute`, lazy-loads the four page components and retains the current guestbook OAuth-return override.

- [ ] **Step 1: Write failing page tests**

```tsx
it('filters the writing index and links to a real article route', async () => {
  render(<WritingIndexPage />)
  await userEvent.click(screen.getByRole('button', { name: '设计实践' }))
  expect(screen.getByRole('link', { name: /AI 不替代设计/ })).toHaveAttribute('href', '#article/ai-speeds-up-judgment')
  expect(screen.queryByRole('link', { name: /电商内容的关键/ })).not.toBeInTheDocument()
})

it('renders article blocks and a recoverable missing state', () => {
  const view = render(<ArticlePage slug="ai-speeds-up-judgment" />)
  expect(screen.getByRole('heading', { level: 1, name: /AI 不替代设计/ })).toBeInTheDocument()
  view.rerender(<ArticlePage slug="missing" />)
  expect(screen.getByRole('heading', { name: '这篇文章还不存在' })).toBeInTheDocument()
  expect(screen.getByRole('link', { name: '返回文章索引' })).toHaveAttribute('href', '#writing')
})
```

Add equivalent assertions for all three project links, project detail sections, `kind === 'personal-experiment'` labeling and the missing-project state.

- [ ] **Step 2: Run the test and verify failure**

Run: `npm.cmd test -- tests/editorial-pages.test.tsx`  
Expected: FAIL because the page components do not exist.

- [ ] **Step 3: Implement the four pages**

The index header pattern is: eyebrow, H1, one-sentence description, then content. Article cards expose title, excerpt, ISO `<time>`, reading minutes and tags. Article detail uses a 720px reading column and a semantic switch over every `ArticleBlock` variant. Project detail renders cover, “个人实验” disclosure, role/period/tags, challenge, ordered process and outcome.

Use an explicit exhaustive renderer:

```tsx
const renderBlock = (block: ArticleBlock, index: number) => {
  switch (block.type) {
    case 'heading': return <h2 key={index}>{block.text}</h2>
    case 'paragraph': return <p key={index}>{block.text}</p>
    case 'quote': return <blockquote key={index}>{block.text}</blockquote>
    case 'list': return <ul key={index}>{block.items.map((item) => <li key={item}>{item}</li>)}</ul>
  }
}
```

- [ ] **Step 4: Route the pages from App**

Replace the parallel page booleans with `const route = parseSiteRoute(pageHash)`. Keep existing lazy components and add lazy imports for the four editorial pages. Dynamic page routes pass the parsed slug. `subpage` comes from `isSiteSubpageRoute(route)`. Preserve the current `GlobalMusicDock` rule: absent only on the full music page and in commerce mode only for commerce/admin.

- [ ] **Step 5: Implement reading-focused CSS**

Use a `min(1240px, calc(100% - 64px))` index frame, 720px article body, 1.8 body line-height, strong focus styles, warm-paper/light and ink/dark surfaces. At 760px use 32px side gutters and a single project column. Do not add animation to long-form body copy.

- [ ] **Step 6: Run focused tests, build and commit**

Run: `npm.cmd test -- tests/editorial-pages.test.tsx tests/site-routes.test.ts tests/tool-navigation-route.test.tsx`  
Expected: PASS.

Run: `npm.cmd run build`  
Expected: TypeScript and Vite succeed; existing bundle-size warnings may remain but no new compile error is accepted.

```powershell
git add -- src/editorial/WritingIndexPage.tsx src/editorial/ArticlePage.tsx src/editorial/WorkIndexPage.tsx src/editorial/ProjectPage.tsx src/editorial/editorial-pages.css src/App.tsx tests/editorial-pages.test.tsx tests/tool-navigation-route.test.tsx
git commit -m "feat: add writing and project pages"
```

### Task 3: Original Card Nav and content-aware search

**Files:**
- Create: `src/editorial/search.ts`
- Create: `src/content/navigation.ts`
- Modify: `src/components/FloatingHeader.tsx`
- Modify: `src/components/floating-header.css`
- Create: `src/components/CardNav.tsx`
- Create: `src/components/card-nav.css`
- Create: `src/components/SiteSearchDialog.tsx`
- Create: `src/components/site-search-dialog.css`
- Create: `tests/site-search.test.ts`
- Create: `tests/card-navigation.test.tsx`
- Modify: `tests/tool-navigation-route.test.tsx`
- Modify: `tests/commerce-form.test.tsx`
- Modify: `tests/commerce-admin.test.tsx`

**Interfaces:**
- `SearchEntry = { id: string; type: 'page' | 'article' | 'project' | 'tool'; title: string; detail: string; href: string; terms: string[]; external: boolean }`.
- `buildSiteSearchEntries({ includeAdmin = false }?: { includeAdmin?: boolean }): SearchEntry[]` and `searchSite(entries, query): Array<{ type: SearchEntry['type']; items: SearchEntry[] }>` are pure.
- `FloatingHeader` keeps `{ theme, pageHash, onToggleTheme }` and only composes the brand, CardNav, SiteSearchDialog and action buttons.
- `CardNav({ groups, currentHash, open, onOpenChange, onNavigate }: CardNavProps)` owns expansion and grouped-link markup, not search or theme state.
- `SiteSearchDialog({ open, onClose, includeAdmin }: SiteSearchDialogProps)` owns the query and grouped results.

- [ ] **Step 1: Write failing pure search tests**

```ts
it('groups editorial and tool matches without duplicate routes', () => {
  const result = searchSite(buildSiteSearchEntries(), '设计')
  expect(result.flatMap((group) => group.items).some((item) => item.href === '#article/ai-speeds-up-judgment')).toBe(true)
  expect(new Set(result.flatMap((group) => group.items).map((item) => item.href)).size)
    .toBe(result.flatMap((group) => group.items).length)
})

it('keeps the operator console out of public search', () => {
  expect(buildSiteSearchEntries().some((item) => item.href === '#commerce-admin')).toBe(false)
  expect(buildSiteSearchEntries({ includeAdmin: true }).some((item) => item.href === '#commerce-admin')).toBe(true)
})
```

- [ ] **Step 2: Write failing Card Nav interaction tests**

Test the closed compact header, “打开导航” expansion, three labeled groups, current route, Esc close with trigger focus restoration, outside-pointer close, search open/close and mobile-drawer ARIA state. Preserve the existing admin-only link when `useAuth().isAdmin` is true. JSDOM does not prove responsive CSS; the real 390px layout is verified in Task 9.

```tsx
await user.click(screen.getByRole('button', { name: '打开导航' }))
expect(screen.getByRole('navigation', { name: '主导航' })).toHaveClass('is-expanded')
expect(screen.getByRole('heading', { name: '阅读' })).toBeInTheDocument()
expect(screen.getByRole('link', { name: '文章' })).toHaveAttribute('href', '#featured')
await user.keyboard('{Escape}')
expect(screen.getByRole('button', { name: '打开导航' })).toHaveFocus()
```

- [ ] **Step 3: Implement grouped search data**

`navigation.ts` exports the three immutable Card Nav groups plus the public page destinations used by search. Page entries include 首页、文章、作品、AI 电商实验室、工具导航、留言、音乐、关于与联系. Add all article/project summaries and flatten `toolCategories`. Mark tool records `external: true`, all internal records false, and add the admin route only for `includeAdmin: true`. Normalize with `toLocaleLowerCase('zh-CN')`; an empty query returns the eight public page shortcuts grouped as `page`; a non-empty miss returns an empty group list so the UI can show the required recovery links.

- [ ] **Step 4: Refactor FloatingHeader into Card Nav**

Closed desktop state shows brand, current section, “打开导航”, search and theme. Keep FloatingHeader as a small orchestrator; CardNav owns the expanded markup and SiteSearchDialog owns modal query state/results. Expanded state springs open through CSS `grid-template-rows`/opacity and renders three original cards:

- 阅读：文章（`#featured`）、现场笔记（`#visual-notes`）、归档（`#writing`）
- 探索：作品、AI 电商实验室、工具导航
- 连接：留言、音乐、关于与联系, plus admin console for site admins

Do not copy the reference header’s labels or visual proportions. Use the existing `ModalSurface` for search. Search results render grouped headings and show three fixed recovery links on miss. External tool results retain `target="_blank" rel="noreferrer"`; internal results do not open a new tab. Every nav card and non-modal featured destination gets `data-target-cursor`; search-modal links do not opt into Target Cursor because modal content is protected.

- [ ] **Step 5: Implement desktop and mobile styling**

Desktop expanded shell stays centered with a maximum width of 880px, three unequal cards, a soft paper/ink surface and subtle accent index marks. At `max-width: 900px`, use a full-width drawer below the header with stacked groups; disable expansion transforms and keep body scroll available except while search modal is open. Every control is at least 44px.

- [ ] **Step 6: Update existing header expectations**

Replace the former “文章 / 联系 / 更多” dropdown assertions in existing tests with the three approved Card Nav groups. Preserve tests for admin-only visibility, current-page styling, Ctrl/Cmd+K search, search modal focus lifecycle and OAuth/commerce header rendering.

- [ ] **Step 7: Run tests, build and commit**

Run: `npm.cmd test -- tests/site-search.test.ts tests/card-navigation.test.tsx tests/tool-navigation-route.test.tsx tests/commerce-form.test.tsx tests/commerce-admin.test.tsx`  
Expected: PASS.

```powershell
git add -- src/editorial/search.ts src/content/navigation.ts src/components/FloatingHeader.tsx src/components/floating-header.css src/components/CardNav.tsx src/components/card-nav.css src/components/SiteSearchDialog.tsx src/components/site-search-dialog.css tests/site-search.test.ts tests/card-navigation.test.tsx tests/tool-navigation-route.test.tsx tests/commerce-form.test.tsx tests/commerce-admin.test.tsx
git commit -m "feat: replace header with editorial card nav"
```

### Task 4: Motion profile, Text Type and a calmer full-bleed hero

**Files:**
- Create: `src/lib/useMotionProfile.ts`
- Create: `src/components/TextType.tsx`
- Create: `src/components/text-type.css`
- Modify: `src/components/StatusScene.tsx`
- Modify: `src/components/status-scene.css`
- Modify: `src/components/ParticleText/ParticleText.tsx`
- Modify: `src/components/ParticleText/ParticleText.css`
- Modify: `src/components/GradientWaves/GradientWaves.jsx`
- Modify: `src/components/GradientWaves/GradientWaves.css`
- Modify: `src/components/TargetCursor.tsx`
- Modify: `src/App.tsx`
- Modify: `tests/homepage-content.test.tsx`
- Create: `tests/text-type.test.tsx`
- Create: `tests/motion-profile.test.tsx`
- Create: `tests/particle-text.test.tsx`
- Create: `tests/gradient-waves.test.tsx`
- Modify: `tests/target-cursor.test.tsx`

**Interfaces:**
- `useMotionProfile(): { reducedMotion: boolean; fineHover: boolean; pageVisible: boolean }` listens to both media queries and `visibilitychange`.
- `TextType({ texts, typingMs = 55, deletingMs = 28, pauseMs = 1100 }: TextTypeProps)` types each string once and settles on `texts[0]`; reduced motion renders `texts[0]` immediately.
- `StatusScene({ theme }: { theme: Theme })` receives the current theme directly; it does not observe DOM attributes after first paint.
- `ParticleText` runs RAF only during initial formation or a resize rebuild; after twelve settled frames it cancels RAF and ignores pointer movement.
- `GradientWaves` reports `data-renderer="webgl" | "fallback"`, renders a CSS fallback after renderer failure, and schedules no recurring RAF while `speed === 0` or the page/section is hidden.

- [ ] **Step 1: Write failing motion-profile tests**

Mock `(prefers-reduced-motion: reduce)` and `(hover: hover) and (pointer: fine)` separately. Assert state updates on media change, page visibility changes, and every listener is removed on unmount.

- [ ] **Step 2: Write failing Text Type tests with fake timers**

```tsx
it('types each phrase once and settles on the first phrase', async () => {
  vi.useFakeTimers()
  render(<TextType texts={['记录设计与技术的现场', '把想法做成看得见的作品']} typingMs={1} deletingMs={1} pauseMs={1} />)
  await act(async () => vi.runAllTimers())
  expect(screen.getByLabelText('记录设计与技术的现场')).toHaveTextContent('记录设计与技术的现场')
})
```

Add a reduced-motion test that advances no timers and a teardown test with no state update after unmount.

- [ ] **Step 3: Implement the shared motion hook and Text Type**

The Text Type wrapper owns the full settled sentence in `aria-label`; its animated glyph span is `aria-hidden="true"`. The caret is decorative. Stop timers while `pageVisible` is false. Never erase to a blank accessible name.

- [ ] **Step 4: Write failing renderer-hardening tests**

For Particle Text, mock fine hover and RAF: initial formation starts, twelve consecutive settled frames stop further scheduling, pointer movement does not restart it, resize rebuilds it, page hiding cancels it, and reduced motion/coarse pointer leaves only the static wordmark. For Gradient Waves, mock the OGL `Renderer` to throw and assert `data-renderer="fallback"` without an uncaught error; test absent `ResizeObserver`/`IntersectionObserver`; test `speed={0}` renders one frame but does not begin a recurring RAF; and verify every installed listener/observer/context is released on unmount.

- [ ] **Step 5: Harden Particle Text and Gradient Waves**

Particle Text starts with scattered points, animates until the total position/velocity error stays below the settled threshold for twelve frames, then cancels RAF and remains stable. It has no pointer listener; only a size change rebuilds and restarts formation. It stops while `document.hidden`; coarse/reduced-motion contexts return the static fallback without creating a canvas or observers. Use `ParticleText.css` states for fallback/forming/settled visibility.

Wrap Gradient Waves renderer/program setup in a guarded initialization path. If WebGL2/OGL setup fails, set `data-renderer="fallback"` and leave the permanent CSS gradient visible. If ResizeObserver is absent, use a window resize listener; if IntersectionObserver is absent, treat the section as visible. Store `start`, `stop`, and `renderOnce` in the component context so speed changes can stop/start the loop: `speed === 0` calls `stop()` plus `renderOnce()`, while a positive speed starts only when section and page are visible.

- [ ] **Step 6: Recompose the Hero**

Keep Gradient Waves full-bleed with the approved configuration. Put a CSS gradient fallback behind the canvas at all times. Keep Particle Text for WENHAO only when `fineHover && !reducedMotion`; otherwise render a static WENHAO wordmark. Use Text Type for these exact phrases:

1. 记录设计与技术的现场
2. 把想法做成看得见的作品
3. 在商业与创作之间持续实践

The H1 remains “WENHAO 博客”. Change primary action to `开始阅读 → #featured`, secondary to `查看作品 → #work`, and move AI commerce to the later exploration section. Light theme must keep the waves visibly present through a lighter scrim rather than setting them near transparent. Initialize App theme with `useState<Theme>(() => getInitialTheme())`, apply it from `useLayoutEffect(() => applyTheme(theme), [theme])`, and pass it to StatusScene so the hero does not flash the wrong palette.

- [ ] **Step 7: Tighten Target Cursor activation**

Use the shared exact query `(hover: hover) and (pointer: fine)` plus reduced-motion suppression. Keep existing modal/form protections and lifecycle behavior. Add `data-target-cursor` only to Card Nav cards, featured article cards, featured project cards and tool cards. Hero CTAs and ordinary reading links keep the native cursor.

- [ ] **Step 8: Run tests, build and commit**

Run: `npm.cmd test -- tests/motion-profile.test.tsx tests/text-type.test.tsx tests/particle-text.test.tsx tests/gradient-waves.test.tsx tests/homepage-content.test.tsx tests/target-cursor.test.tsx`  
Expected: PASS with fake timers restored after every test.

```powershell
git add -- src/lib/useMotionProfile.ts src/components/TextType.tsx src/components/text-type.css src/components/StatusScene.tsx src/components/status-scene.css src/components/ParticleText/ParticleText.tsx src/components/ParticleText/ParticleText.css src/components/GradientWaves/GradientWaves.jsx src/components/GradientWaves/GradientWaves.css src/components/TargetCursor.tsx src/App.tsx tests/motion-profile.test.tsx tests/text-type.test.tsx tests/particle-text.test.tsx tests/gradient-waves.test.tsx tests/homepage-content.test.tsx tests/target-cursor.test.tsx
git commit -m "feat: refine hero motion and identity"
```

### Task 5: Generate the original visual-note asset set

**Files:**
- Create: `public/images/field-notes/signal-desk.webp`
- Create: `public/images/field-notes/paper-systems.webp`
- Create: `public/images/field-notes/night-interface.webp`
- Create: `public/images/field-notes/prototype-hands.webp`
- Create: `public/images/field-notes/material-study.webp`
- Create: `public/images/field-notes/quiet-window.webp`
- Create: `tests/editorial-assets.test.ts`

**Interfaces:**
- Consumes the exact paths already declared by `visualNotes` and project `cover` fields.
- Produces six optimized WebP files; no runtime image package is added.

- [ ] **Step 1: Write a failing asset-manifest test**

```ts
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { visualNotes } from '../src/editorial/index'

it('keeps every visual-note asset local and WebP encoded', () => {
  const files = visualNotes.map((note) => resolve(process.cwd(), 'public', note.image.replace(/^\//, '')))
  expect(new Set(files).size).toBe(6)
  for (const note of visualNotes) {
    const file = resolve(process.cwd(), 'public', note.image.replace(/^\//, ''))
    expect(existsSync(file)).toBe(true)
    expect(readFileSync(file).subarray(8, 12).toString('ascii')).toBe('WEBP')
    expect(readFileSync(file).byteLength).toBeLessThanOrEqual(450_000)
  }
})
```

Also assert the directory contains exactly six `.webp` files, their combined size is at most 2.4 MB, and every project cover equals one of those six public paths.

- [ ] **Step 2: Run the test and verify missing files**

Run: `npm.cmd test -- tests/editorial-assets.test.ts`  
Expected: FAIL because the six images do not exist.

- [ ] **Step 3: Generate six separate original images with the built-in image tool**

Use one generation call per prompt, `transparent_background: false`, no reference image, and the shared constraints “editorial photography, realistic tactile materials, quiet digital-studio atmosphere, ink black / warm paper / mist violet / tiny acid-green accent, no text, no logo, no watermark, no recognizable face, no imitation of any supplied website”.

1. `signal-desk` (3:2): overhead matte-black desk, translucent grid film, blank notebook, soft violet monitor spill, one acid-green status light.
2. `paper-systems` (4:5): folded warm-white paper, frosted acrylic planes, metal clips, soft violet shadow, tiny green pin.
3. `night-interface` (1:1): close crop of glass monitor reflections and abstract interface light, no legible UI, deep ink room.
4. `prototype-hands` (3:2): anonymous hands arranging blank printed cards, product-shape sketches and material swatches, no readable writing.
5. `material-study` (4:5): chrome, frosted glass, paper samples and one acid-green thread in a controlled still life.
6. `quiet-window` (1:1): rainy studio window, violet city reflection, distant heavily blurred silhouette without identifiable features.

- [ ] **Step 4: Inspect, convert and persist assets**

Inspect each generated output for forbidden text/faces/logos and malformed hands; regenerate only the failed asset. Copy selected outputs into `%TEMP%\wenhao-field-notes-assets`, then use the bundled workspace Python/Pillow runtime from `codex_app__load_workspace_dependencies` to convert to quality 82–86 WebP: 1600×1067 for 3:2, 1280×1600 for 4:5, and 1440×1440 for 1:1. Keep each file at or below 450 KB and the six-file total at or below 2.4 MB, then move the finals into `public/images/field-notes/`. Do not write into or stage the existing `output/` directory.

Map project covers exactly: 内容增长实验室 → `signal-desk.webp`; 品牌的第一次相遇 → `paper-systems.webp`; 有呼吸感的页面 → `night-interface.webp`. Reuse those assets through different `object-position` crops rather than generating duplicate covers.

- [ ] **Step 5: Run the manifest test and commit**

Run: `npm.cmd test -- tests/editorial-assets.test.ts tests/editorial-content.test.ts`  
Expected: PASS.

```powershell
git add -- public/images/field-notes tests/editorial-assets.test.ts
git commit -m "feat: add original field notes artwork"
```

### Task 6: Masonry visual notes and Tilted Card projects

**Files:**
- Create: `src/editorial/VisualNotes.tsx`
- Create: `src/editorial/visual-notes.css`
- Create: `src/editorial/TiltedCard.tsx`
- Create: `src/editorial/tilted-card.css`
- Create: `src/components/SelectedWork.tsx`
- Create: `tests/visual-notes.test.tsx`
- Create: `tests/tilted-card.test.tsx`

**Interfaces:**
- `VisualNotes({ items = visualNotes }: { items?: readonly VisualNote[] })` renders the masonry wall and owns one selected-note id.
- `TiltedCard({ href, label, children, className? }: TiltedCardProps)` is an anchor wrapper that sets `--tilt-x`, `--tilt-y`, `--glare-x`, `--glare-y` and resets them on leave/blur.
- `SelectedWork` consumes `projectSummaries` and renders exactly three project routes through `TiltedCard`.

- [ ] **Step 1: Write failing Visual Notes tests**

Assert six figures, native lazy images, every alt, opening a selected-note dialog, Esc close, Tab and Shift+Tab focus wrapping, focus restoration, background inert through `ModalSurface`, and an image-error class that preserves the figure/caption. Add a focused `tests/modal-surface.test.tsx` if keeping these lifecycle assertions out of the gallery test makes the fixtures clearer.

```tsx
await user.click(screen.getByRole('button', { name: '查看：雨夜工作室窗口' }))
expect(screen.getByRole('dialog', { name: '视觉随记：雨夜工作室窗口' })).toBeInTheDocument()
await user.keyboard('{Escape}')
expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
```

- [ ] **Step 2: Write failing Tilted Card tests**

Mock a 300×200 bounding rect. Pointer at the top-right must produce values within ±6 degrees; pointer leave and blur reset to `0deg`; reduced motion and non-fine hover never apply transforms. The anchor remains a normal focusable route with accessible name.

- [ ] **Step 3: Implement Visual Notes**

Use CSS columns (`column-count: 3`, then 2 and 1) with `break-inside: avoid`, stable DOM/source order and ratio-specific aspect ratios. Each thumbnail is a real button overlay inside a `<figure>`. The modal shows the same image, caption and date. On image error, hide the broken image and reveal a CSS-generated grid fallback with the original alt still present in accessible text.

- [ ] **Step 4: Implement the restrained Tilted Card**

Calculate normalized pointer offsets, clamp to ±1 and multiply by six degrees. Use CSS custom properties rather than React state per frame; reset on pointer leave, pointer cancel and blur. Disable all transforms for reduced motion, coarse pointer and `@media (hover: none)`. Add `data-target-cursor` and `data-cursor-label="查看案例"` to the anchor.

- [ ] **Step 5: Implement Selected Work**

Each card shows the generated cover, “个人实验”, role, period, title, summary and tags. Link to `#project/<slug>`. Do not invent numerical outcomes. At 900px collapse to one static card per row and let `TiltedCard` render without pointer transforms.

- [ ] **Step 6: Run tests, build and commit**

Run: `npm.cmd test -- tests/visual-notes.test.tsx tests/tilted-card.test.tsx tests/editorial-assets.test.ts`  
Expected: PASS.

```powershell
git add -- src/editorial/VisualNotes.tsx src/editorial/visual-notes.css src/editorial/TiltedCard.tsx src/editorial/tilted-card.css src/components/SelectedWork.tsx tests/visual-notes.test.tsx tests/tilted-card.test.tsx
git commit -m "feat: add visual notes and featured work interactions"
```

### Task 7: Recompose the homepage around reading and personal practice

**Files:**
- Create: `src/components/HomePage.tsx`
- Create: `src/components/FeaturedNotes.tsx`
- Create: `src/components/WritingPreview.tsx`
- Create: `src/components/AboutSection.tsx`
- Create: `src/components/SiteFooter.tsx`
- Create: `src/components/home-sections.css`
- Modify: `src/components/CommerceHomeSection.tsx`
- Modify: `src/App.tsx`
- Modify: `src/content/site.ts`
- Modify: `src/styles.css`
- Delete after replacement: `src/components/StudioMap.tsx`
- Delete after replacement: `src/components/ProjectArchive.tsx`
- Modify: `tests/homepage-content.test.tsx`
- Create: `tests/homepage-editorial.test.tsx`

**Interfaces:**
- `HomePage({ theme }: { theme: Theme })` owns the exact approved section order and passes theme only to StatusScene.
- `FeaturedNotes` renders one lead and two secondary articles from `articleSummaries.filter(featured)`.
- `WritingPreview` renders up to six article summaries in descending ISO date order.
- `CommerceHomeSection` keeps its export name but becomes a compact laboratory feature and retains only the real `#ai-commerce` entry.

- [ ] **Step 1: Write a failing homepage-order test based on rendered landmarks**

```tsx
render(<HomePage theme="dark" />)
const regions = screen.getAllByRole('region').map((region) => region.getAttribute('aria-labelledby'))
expect(regions).toEqual([
  'home-title',
  'featured-title',
  'selected-work-title',
  'commerce-home-title',
  'visual-notes-title',
  'writing-preview-title',
  'about-title',
])
```

Also assert real article/project routes, the AI commerce route, three articles in the initial recent list and removal of the former full demo copy from the homepage.

- [ ] **Step 2: Implement Featured Notes and Writing Preview**

Featured layout is asymmetric: lead article occupies the wide column, two secondary articles stack in the narrow column. Cards include `<time>`, reading minutes, tags and excerpts. Writing Preview is a dense date/title/tag index with `#writing` as its final link. Annotate only featured cards with Target Cursor.

- [ ] **Step 3: Compact the commerce homepage section**

Replace the four-row platform ledger, three-step block and large fake product demo with one editorial band: section statement, three workflow verbs (“理解产品 / 判断市场 / 组织画面”), four platform labels and one `进入 AI 电商实验室` link. Keep the detailed workflow inside the existing studio route; do not change `commerceHome` data used by that route unless a field is homepage-only and proven unused.

- [ ] **Step 4: Implement About, SiteFooter and HomePage composition**

Change the interface to `HomePage({ theme }: { theme: Theme })` and pass theme to StatusScene. It renders: StatusScene → FeaturedNotes → SelectedWork → CommerceHomeSection → VisualNotes → WritingPreview → AboutSection → SiteFooter. About uses `id="about"`, the existing honest role descriptions and current-status sentence, then links to guestbook and `mailto:${site.contacts.email}`. Move the existing App footer into SiteFooter, change its anchor to `id="site-footer"`, and remove the old footer from App so the DOM never contains duplicate `#about` ids.

- [ ] **Step 5: Replace obsolete homepage-only components and CSS**

Update App to render `HomePage`. Remove `StudioMap` and `ProjectArchive` only after all imports/tests have migrated. Delete their obsolete `.map-*`, `.archive-*`, `.artwork-*` and old notes-list selectors from `styles.css`; preserve root tokens, frame, footer and unrelated page styles. Put new section styles in `home-sections.css` rather than expanding the global file.

- [ ] **Step 6: Run homepage tests, full build and commit**

Run: `npm.cmd test -- tests/homepage-content.test.tsx tests/homepage-editorial.test.tsx tests/editorial-pages.test.tsx`  
Expected: PASS.

Run: `npm.cmd run build`  
Expected: PASS.

```powershell
git add -A -- src/components/HomePage.tsx src/components/FeaturedNotes.tsx src/components/WritingPreview.tsx src/components/AboutSection.tsx src/components/SiteFooter.tsx src/components/home-sections.css src/components/CommerceHomeSection.tsx src/components/StudioMap.tsx src/components/ProjectArchive.tsx src/App.tsx src/content/site.ts src/styles.css tests/homepage-content.test.tsx tests/homepage-editorial.test.tsx
git commit -m "feat: rebuild homepage as field notes"
```

### Task 8: Align tools, guestbook, commerce and music with the shared visual system

**Files:**
- Modify: `src/styles.css`
- Modify: `src/components/ToolNavigationPage.tsx`
- Modify: `src/components/tool-navigation.css`
- Modify: `src/components/GuestbookPage.tsx`
- Modify: `src/guestbook/guestbook.css`
- Modify: `src/commerce/CommerceStudioPage.tsx`
- Modify: `src/commerce/commerce.css`
- Modify: `src/commerce/styles/tokens.css`
- Modify: `src/commerce/styles/studio-layout.css`
- Modify: `src/music/music-experience.css`
- Modify: `tests/tool-navigation-page.test.tsx`
- Modify: `tests/music-dock.test.tsx`
- Create: `tests/cross-page-shell.test.tsx`

**Interfaces:**
- Existing page component exports and business props remain unchanged.
- Add shared non-business classes only: `editorial-page`, `editorial-page-intro`, `editorial-index`, `editorial-surface` and `editorial-action`.
- The music launcher remains a 48px collapsed control and reuses its existing open/close API.

- [ ] **Step 1: Write cross-page structural regression tests**

Render Tools, Guestbook and Commerce with existing mocks. Guestbook tests must mock `useAuth`, `guestbookRepository.list` and profile reads (or render an extracted injected view) so no test reaches Supabase or starts uncontrolled repository timers; Commerce keeps its existing AuthProvider/repository mocks. Assert Tools and Commerce have one visible H1 and an editorial intro label. Guestbook gets one screen-reader-only `<h1 className="sr-only">留言</h1>` but must retain the visible `OPEN CHANNEL`/留言板 presentation—the previously rejected oversized visible “留言” title must not return. Assert unchanged primary business controls and no missing accessible names. Extend music dock tests to assert the collapsed launcher is the only visible music control until activated and still avoids commerce primary actions.

- [ ] **Step 2: Consolidate shared tokens**

Keep root colors in `styles.css` and add named aliases for paper, ink, violet, signal green, hairline, surface and shadow. Define shared intro/surface/action primitives without targeting business-internal class names. Light is warm paper; dark is ink studio. Preserve current theme-storage behavior.

- [ ] **Step 3: Restyle the tool directory as an editorial index**

Keep search, categories, counts, review date, safe outgoing links and 3/2/1 responsiveness. Remove the uniform gray-card appearance: cards use numbered headers, asymmetric whitespace, bottom rule, icon mark and explicit external-link state. Do not change tool URLs or filters and do not turn it into masonry.

- [ ] **Step 4: Align guestbook and commerce shells without touching data flow**

Add the shared intro structure to CommerceStudioPage. For GuestbookPage, add only the screen-reader H1 and align its existing OPEN CHANNEL header to shared tokens without adding a visible giant title. Update `commerce/styles/tokens.css` and `commerce/styles/studio-layout.css` alongside `commerce.css` so current high-specificity `.commerce-page.commerce-page` rules cannot override the new shell. Change only spacing, type, surfaces, borders and responsive shell CSS. Do not edit repository, auth, upload, generation, quota or delete handlers. Preserve current error text, Enter-to-send behavior and admin controls.

- [ ] **Step 5: Keep music compact and collision-safe**

Set `.music-launcher` to an exact 48×48 collapsed circle/squircle, preserve the current popover and measured commerce placement, and verify mobile form-focus hiding still works. Do not alter track data, lyrics synchronization or playback state.

- [ ] **Step 6: Run focused and full tests, then commit**

Run: `npm.cmd test -- tests/tool-navigation-page.test.tsx tests/music-dock.test.tsx tests/cross-page-shell.test.tsx tests/commerce-form.test.tsx tests/commerce-admin.test.tsx tests/auth-provider.test.tsx`  
Expected: PASS.

```powershell
git add -- src/styles.css src/components/ToolNavigationPage.tsx src/components/tool-navigation.css src/components/GuestbookPage.tsx src/guestbook/guestbook.css src/commerce/CommerceStudioPage.tsx src/commerce/commerce.css src/commerce/styles/tokens.css src/commerce/styles/studio-layout.css src/music/music-experience.css tests/tool-navigation-page.test.tsx tests/music-dock.test.tsx tests/cross-page-shell.test.tsx
git commit -m "style: unify editorial site surfaces"
```

### Task 9: Full verification and local visual handoff

**Files:**
- Modify if verification finds defects: only the directly responsible source/test files from Tasks 1–8
- Modify: `docs/project-log.md`

**Interfaces:**
- No new product interface. This task proves the approved spec and records the local result.

- [ ] **Step 1: Run the complete automated suite**

Run: `npm.cmd test`  
Expected: all test files pass with no unhandled rejection or timer leak.

Run: `npm.cmd run build`  
Expected: TypeScript and Vite succeed. Record bundle warnings; a new avoidable large dependency is a failure.

Run: `npm.cmd run check:edge`  
Expected: all existing Supabase edge functions still type-check, proving the visual refactor did not disturb their contracts.

- [ ] **Step 2: Start or reuse the local Vite server**

Run: `npm.cmd run dev -- --host 127.0.0.1`  
Expected: a local URL at `http://127.0.0.1:5173/` or the next available reported port. Do not start a duplicate server if the existing session already serves the current worktree.

- [ ] **Step 3: Perform desktop visual QA in both themes**

At 1440×1000 and 1024×900 inspect: Hero waves and WENHAO identity, Card Nav closed/expanded, grouped search, Featured Notes, Tilted Cards, compact Commerce Lab, Masonry modal, Writing Preview, About/footer, Writing index/detail, Work index/detail, Tools, Guestbook, Commerce and Music. Confirm no overlap, clipping, unreadable contrast or unexpected horizontal scroll.

- [ ] **Step 4: Perform tablet/mobile and accessibility QA**

At 768×1024 and 390×844 inspect both themes. Emulate touch/coarse pointer and reduced motion. Confirm no Target Cursor, typing, particle or tilt animation; Card Nav becomes the mobile drawer; modal focus returns; all tap targets are at least 44px; music does not cover forms or primary actions. Keyboard-walk desktop navigation, search, cards and modals.

- [ ] **Step 5: Verify dynamic routes and fallbacks**

Open every initial article/project route plus `#article/missing` and `#project/missing`. Disable or mock failed images for one visual note. Confirm the in-site missing states and generated visual fallback work without console errors. Confirm guestbook auth-return still resolves to `#guestbook`.

- [ ] **Step 6: Run a final scope/security diff review**

Run: `git status --short` and `git diff --check`. Confirm `output/` remains untouched/untracked, no `.env*`, API key, Supabase secret, service-role key or generated temp file is staged, and no database/function/GitHub workflow file changed. Use the requesting-code-review skill for a final Critical/Important issue pass; fix and re-run the affected tests.

- [ ] **Step 7: Record verification and commit fixes/docs**

Append the exact test/build/browser matrix to `docs/project-log.md`. Commit only after all checks pass:

```powershell
git add -- docs/project-log.md src tests public/images/field-notes
git commit -m "docs: record field notes redesign verification"
```

- [ ] **Step 8: Open the local result for user review and stop**

Open the verified local homepage in the in-app browser and keep it user-visible. Report the local URL and the implemented sections. Do not push, create a PR, change DNS or deploy. Wait for explicit user acceptance before any GitHub/production action.

