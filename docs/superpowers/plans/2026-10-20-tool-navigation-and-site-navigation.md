# Tool Navigation and Site Navigation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (- [ ]) syntax for tracking.

**Goal:** Build an original, searchable tools directory at #tools, make it a first-class site destination, and add an accessible target-frame cursor response for desktop clickable elements.

**Architecture:** Static curated tool data lives in a focused content module, while ToolNavigationPage owns only local search and category-filter state. App owns the #tools route and FloatingHeader owns site-wide navigation/search; the cursor is a self-contained overlay that listens only for explicitly annotated targets and never alters form controls.

**Tech Stack:** React 19, TypeScript, Vite, Vitest, Testing Library, plain CSS, browser QA through Playwright CLI.

**Spec:** docs/superpowers/specs/2026-10-20-tool-navigation-and-site-navigation-design.md

## Global Constraints

- Keep #studio-map as the homepage capability section; create a separate exact hash route #tools.
- Do not reuse reference-site text, images, visual assets, background textures, card proportions, or title treatment.
- Tool data must use official URLs, render every external link with target="_blank" rel="noreferrer", and include a personal usage note.
- Reuse existing theme tokens and floating-header accessibility behavior; tool-page CSS belongs in its own file.
- Target cursor binds only to explicit [data-target-cursor] elements, is absent for touch/reduced-motion users, and must not affect fields, uploads, sliders, editable areas, modal content, commerce forms, guestbook editing, or music controls.
- Maintain 44px minimum interactive hit areas; at max-width: 1080px the header becomes the existing mobile directory; ensure 1440px, 1024px, and 390px layouts have no horizontal overflow.
- Leave the user-owned untracked output/ directory untouched and unstaged.

---

## File Structure

| Path | Responsibility |
| --- | --- |
| src/content/tools.ts | Typed, curated category/tool data and pure search/filter helpers. |
| src/components/ToolNavigationPage.tsx | Tool-directory page markup, search/filter state, empty state and safe outgoing links. |
| src/components/tool-navigation.css | Isolated editorial-directory layout, cards, theme behavior and responsive rules. |
| src/components/TargetCursor.tsx | Pointer/focus-aware target-frame overlay for explicitly marked elements. |
| src/components/target-cursor.css | Overlay geometry, animated corners and reduced-motion safety. |
| src/App.tsx | Lazy #tools route and global cursor mounting. |
| src/components/FloatingHeader.tsx | Tool destination, compact navigation groups, active state and search index. |
| src/components/floating-header.css | 1080px header collapse. |
| tests/tools-content.test.ts | Data and pure filter behavior. |
| tests/tool-navigation-page.test.tsx | Search, category filter, empty state, card semantics and safe link behavior. |
| tests/tool-navigation-route.test.tsx | Hash route helper, header current state and site-search destination. |
| tests/target-cursor.test.tsx | Fine-pointer activation, target capture, keyboard focus and opt-out behavior. |

### Task 1: Curated tool data and deterministic filters

**Files:**
- Create: src/content/tools.ts
- Create: tests/tools-content.test.ts

**Interfaces:**
- Produces ToolCategoryId, ToolLink, ToolCategory, ToolFilter, toolCategories, toolCategoryOptions, and filterToolCategories(categories, filter).
- ToolFilter is { query: string; category: ToolCategoryId | 'all' }.
- filterToolCategories returns categories with only matching tools and omits empty categories.

- [ ] **Step 1: Write the failing content/filter tests**

    import { filterToolCategories, toolCategories } from '../src/content/tools'

    it('keeps only matching tools while preserving category metadata', () => {
      const result = filterToolCategories(toolCategories, { query: '图片', category: 'all' })
      expect(result.flatMap((category) => category.tools).map((tool) => tool.name)).toContain('Photopea')
      expect(result.every((category) => category.tools.length > 0)).toBe(true)
    })

    it('filters a named category and keeps official HTTPS destinations', () => {
      const result = filterToolCategories(toolCategories, { query: '', category: 'cross-border' })
      expect(result).toHaveLength(1)
      expect(result[0].id).toBe('cross-border')
      expect(result[0].tools.every((tool) => tool.href.startsWith('https://'))).toBe(true)
      expect(result[0].tools.every((tool) => tool.note.trim().length > 0)).toBe(true)
    })

- [ ] **Step 2: Run test to verify it fails**

Run: npm.cmd test -- tests/tools-content.test.ts  
Expected: FAIL because src/content/tools.ts does not exist.

- [ ] **Step 3: Create the typed data module and exact pure matcher**

    export type ToolCategoryId = 'ai-create' | 'cross-border' | 'image-assets' | 'workflow-dev' | 'inspiration'

    export type ToolLink = {
      id: string
      name: string
      href: string
      host: string
      description: string
      note: string
      tags: string[]
      mark: string
    }

    export type ToolCategory = {
      id: ToolCategoryId
      number: string
      title: string
      description: string
      tools: ToolLink[]
    }

    export const filterToolCategories = (categories: ToolCategory[], { query, category }: ToolFilter) => {
      const normalized = query.trim().toLocaleLowerCase('zh-CN')
      return categories
        .filter((item) => category === 'all' || item.id === category)
        .map((item) => ({
          ...item,
          tools: item.tools.filter((tool) =>
            [tool.name, tool.host, tool.description, tool.note, ...tool.tags]
              .join(' ')
              .toLocaleLowerCase('zh-CN')
              .includes(normalized),
          ),
        }))
        .filter((item) => item.tools.length > 0)
    }

Populate five categories with checked official HTTPS entries relevant to the site: AI creation, cross-border work, image/assets, workflow/development, and inspiration/reading. Each category has its own number, description and at least two tools; each tool has a Chinese use-case and first-person collection note.

- [ ] **Step 4: Run focused tests and typecheck**

Run: npm.cmd test -- tests/tools-content.test.ts  
Expected: PASS.

Run: npm.cmd run build  
Expected: TypeScript completes and Vite emits a production bundle.

- [ ] **Step 5: Commit**

    git add -- src/content/tools.ts tests/tools-content.test.ts
    git commit -m "feat: add curated tool directory data"

### Task 2: Tool directory page with search, filters and safe cards

**Files:**
- Create: src/components/ToolNavigationPage.tsx
- Create: src/components/tool-navigation.css
- Create: tests/tool-navigation-page.test.tsx

**Interfaces:**
- Consumes toolCategories, toolCategoryOptions, filterToolCategories and ToolCategoryId from src/content/tools.ts.
- Produces ToolNavigationPage, a named component with no props.
- Every tool-card anchor carries data-target-cursor and data-cursor-label="打开工具" while retaining safe external-link attributes.

- [ ] **Step 1: Write the failing page tests**

    import userEvent from '@testing-library/user-event'
    import { render, screen } from '@testing-library/react'
    import { ToolNavigationPage } from '../src/components/ToolNavigationPage'

    it('searches tool names and shows a recoverable empty state', async () => {
      const user = userEvent.setup()
      render(<ToolNavigationPage />)
      await user.type(screen.getByRole('searchbox', { name: '搜索工具' }), 'Photopea')
      expect(screen.getByRole('link', { name: /Photopea/ })).toBeInTheDocument()
      await user.clear(screen.getByRole('searchbox', { name: '搜索工具' }))
      await user.type(screen.getByRole('searchbox', { name: '搜索工具' }), '不存在的工具')
      expect(screen.getByText(/没有找到/)).toBeInTheDocument()
      await user.click(screen.getByRole('button', { name: '清除筛选' }))
      expect(screen.getByRole('link', { name: /Photopea/ })).toBeInTheDocument()
    })

    it('uses a pressed category button and secure external links', async () => {
      const user = userEvent.setup()
      render(<ToolNavigationPage />)
      await user.click(screen.getByRole('button', { name: /跨境电商/ }))
      expect(screen.getByRole('button', { name: /跨境电商/ })).toHaveAttribute('aria-pressed', 'true')
      const link = screen.getByRole('link', { name: /Ozon/ })
      expect(link).toHaveAttribute('target', '_blank')
      expect(link).toHaveAttribute('rel', 'noreferrer')
    })

- [ ] **Step 2: Run test to verify it fails**

Run: npm.cmd test -- tests/tool-navigation-page.test.tsx  
Expected: FAIL because ToolNavigationPage does not exist.

- [ ] **Step 3: Implement the page with local state only**

    <main className="tool-navigation-page" id="tools" aria-labelledby="tools-title">
      <section className="tool-navigation-intro frame">
        <p className="tool-navigation-index">FIELD NOTES / TOOL INDEX</p>
        <h1 id="tools-title">工具导航</h1>
        <p>从真实工作流里留下的工具，不追新，只留会反复打开的。</p>
        <label className="tool-search-label">
          <span>搜索工具</span>
          <input type="search" role="searchbox" aria-label="搜索工具" />
        </label>
      </section>
      <nav aria-label="工具分类">
        {toolCategoryOptions.map((option) => <button key={option.id} type="button" aria-pressed={category === option.id}>{option.label}</button>)}
      </nav>
      <section aria-live="polite">
        {visibleCategories.map((category) => <section key={category.id} aria-labelledby={category.id + '-title'} />)}
      </section>
    </main>

Use useMemo to derive results from { query, category }; do not encode filters into hashes or URLs. Each category heading includes number, title, description and matched count. Each card uses the tool mark, name, description, tags, host and note. The clear action resets query and category to defaults.

- [ ] **Step 4: Implement isolated responsive styles**

Use width: min(1280px, calc(100% - 64px)), three desktop columns, two columns below 1080px, one below 640px, a horizontally scrollable category rail on small screens, and padding-bottom: 116px. Define colors through existing theme variables and local --tool-* aliases. Do not modify existing .map- or .archive- selectors.

- [ ] **Step 5: Run focused tests and build**

Run: npm.cmd test -- tests/tool-navigation-page.test.tsx  
Expected: PASS.

Run: npm.cmd run build  
Expected: TypeScript completes and Vite emits a production bundle.

- [ ] **Step 6: Commit**

    git add -- src/components/ToolNavigationPage.tsx src/components/tool-navigation.css tests/tool-navigation-page.test.tsx
    git commit -m "feat: add searchable tools navigation page"

### Task 3: Route #tools and consolidate header information architecture

**Files:**
- Create: src/lib/siteRoutes.ts
- Modify: src/App.tsx
- Modify: src/components/FloatingHeader.tsx
- Modify: src/components/floating-header.css
- Create: tests/tool-navigation-route.test.tsx

**Interfaces:**
- src/lib/siteRoutes.ts exports siteSubpageHashes and isSiteSubpageHash(hash: string): boolean.
- App lazy-loads ToolNavigationPage and renders it only when pageHash === '#tools'.
- FloatingHeader keeps existing props and exposes #tools as a primary current-aware destination.

- [ ] **Step 1: Write the failing routing/header tests**

    import { isSiteSubpageHash } from '../src/lib/siteRoutes'
    import { FloatingHeader } from '../src/components/FloatingHeader'

    it('recognizes the standalone tools hash without treating homepage anchors as subpages', () => {
      expect(isSiteSubpageHash('#tools')).toBe(true)
      expect(isSiteSubpageHash('#studio-map')).toBe(false)
    })

    it('marks the tools destination current and sends global search to that route', async () => {
      render(<FloatingHeader theme="dark" pageHash="#tools" onToggleTheme={vi.fn()} />)
      expect(screen.getByRole('link', { name: '工具导航' })).toHaveAttribute('aria-current', 'page')
      await userEvent.click(screen.getByRole('button', { name: '打开搜索' }))
      expect(screen.getByRole('link', { name: '工具导航' })).toHaveAttribute('href', '#tools')
    })

Mock useAuth with the existing test pattern so header rendering does not depend on a live Supabase session.

- [ ] **Step 2: Run test to verify it fails**

Run: npm.cmd test -- tests/tool-navigation-route.test.tsx  
Expected: FAIL because siteRoutes and the header destination do not exist.

- [ ] **Step 3: Add route boundary**

    export const siteSubpageHashes = ['#music', '#guestbook', '#ai-commerce', '#commerce-admin', '#tools'] as const
    export const isSiteSubpageHash = (hash: string) => siteSubpageHashes.some((item) => item === hash)

In App.tsx lazy-load ToolNavigationPage, derive toolsPage, include it in subpage, and add the same Suspense fallback behavior used by the other page boundaries. Mount it before the homepage fallback. Keep GlobalMusicDock visible for tools mode without commerce mode.

- [ ] **Step 4: Update header data and responsive breakpoint**

Primary desktop links become 主页 → #top, AI 电商 → #ai-commerce, 工具导航 → #tools. Dropdowns become 文章 (实验记录, 作品归档), 联系 (留言, 合作联系), and 更多 (音乐, 关于此站, 管理后台 only when isAdmin is true). Update search destinations so 工具导航 targets #tools. Only links whose own href equals pageHash receive aria-current="page"; group triggers receive current visual state if a child page is active. Change header desktop/mobile media boundary from 900px to 1080px, preserving focus return, outside dismiss and Escape behavior.

- [ ] **Step 5: Run focused tests and existing header tests**

Run: npm.cmd test -- tests/tool-navigation-route.test.tsx tests/commerce-form.test.tsx tests/commerce-admin.test.tsx  
Expected: PASS with existing header menu and admin visibility behavior intact.

- [ ] **Step 6: Commit**

    git add -- src/lib/siteRoutes.ts src/App.tsx src/components/FloatingHeader.tsx src/components/floating-header.css tests/tool-navigation-route.test.tsx
    git commit -m "feat: route tools directory from site navigation"

### Task 4: Add constrained target-frame cursor feedback

**Files:**
- Create: src/components/TargetCursor.tsx
- Create: src/components/target-cursor.css
- Modify: src/App.tsx
- Modify: src/components/FloatingHeader.tsx
- Modify: src/components/ToolNavigationPage.tsx
- Create: tests/target-cursor.test.tsx

**Interfaces:**
- TargetCursor is a named component with optional selector?: string, defaulting to [data-target-cursor].
- Targets opt in with data-target-cursor and may provide data-cursor-label.
- Overlay exposes data-testid="target-cursor", has aria-hidden="true", and never receives pointer events.

- [ ] **Step 1: Write the failing interaction tests**

    it('frames an opted-in link on pointer entry and clears it on pointer leave', () => {
      window.matchMedia = vi.fn().mockImplementation((query) => ({
        matches: query === '(pointer: fine)', addEventListener: vi.fn(), removeEventListener: vi.fn(),
      }))
      render(<><a data-target-cursor data-cursor-label="打开工具">Tool</a><TargetCursor /></>)
      const target = screen.getByRole('link', { name: 'Tool' })
      vi.spyOn(target, 'getBoundingClientRect').mockReturnValue(new DOMRect(12, 20, 80, 44))
      fireEvent.pointerOver(target)
      expect(screen.getByTestId('target-cursor')).toHaveAttribute('data-visible', 'true')
      fireEvent.pointerOut(target)
      expect(screen.getByTestId('target-cursor')).toHaveAttribute('data-visible', 'false')
    })

    it('does not activate for reduced motion or an unannotated text input', () => {
      window.matchMedia = vi.fn().mockImplementation((query) => ({
        matches: query === '(pointer: fine)' || query === '(prefers-reduced-motion: reduce)',
        addEventListener: vi.fn(), removeEventListener: vi.fn(),
      }))
      render(<><input aria-label="产品名称" /><TargetCursor /></>)
      fireEvent.pointerOver(screen.getByRole('textbox', { name: '产品名称' }))
      expect(screen.getByTestId('target-cursor')).toHaveAttribute('data-visible', 'false')
    })

- [ ] **Step 2: Run test to verify it fails**

Run: npm.cmd test -- tests/target-cursor.test.tsx  
Expected: FAIL because TargetCursor does not exist.

- [ ] **Step 3: Implement target detection and geometry**

Use an effect to listen for pointerover, pointerout, focusin, focusout, scroll and resize. For an event target, resolve closest(selector) and reject any result inside input, textarea, select, [contenteditable="true"], [data-no-target-cursor]. Gate rendering on both (pointer: fine) and (prefers-reduced-motion: reduce). Measure getBoundingClientRect only for an opted-in target, update left, top, width, height, borderRadius and label; clear state when its target leaves, blurs or is removed. Use position: fixed so scroll does not require document offsets.

Render four CSS corner spans and a small label; use no third-party cursor dependency and do not globally hide the native cursor. Annotate only the header’s primary/drawer navigation links and tool-card anchors. Leave all other site controls unchanged.

- [ ] **Step 4: Implement overlay styles and motion safety**

Set pointer-events: none, z-index: 500, and a 140–180ms geometry transition. On active targets, the element gets cursor: none; default cursor remains everywhere else. Use @media (prefers-reduced-motion: reduce) to remove transition and hide the overlay. Keep label text below 11px and only display it when target has a label.

- [ ] **Step 5: Run focused tests and build**

Run: npm.cmd test -- tests/target-cursor.test.tsx tests/tool-navigation-page.test.tsx tests/tool-navigation-route.test.tsx  
Expected: PASS.

Run: npm.cmd run build  
Expected: TypeScript completes and Vite emits a production bundle.

- [ ] **Step 6: Commit**

    git add -- src/components/TargetCursor.tsx src/components/target-cursor.css src/App.tsx src/components/FloatingHeader.tsx src/components/ToolNavigationPage.tsx tests/target-cursor.test.tsx
    git commit -m "feat: add accessible target cursor feedback"

### Task 5: Full verification, browser QA and release record

**Files:**
- Modify: docs/project-log.md

**Interfaces:**
- Consumes completed Tasks 1–4.
- Produces a passing test/build result and a concise dated project-log entry stating verified viewports and known limits.

- [ ] **Step 1: Run the complete automated suite**

Run: npm.cmd test  
Expected: all test files pass with no unhandled React warnings.

Run: npm.cmd run build  
Expected: production output succeeds; record any pre-existing Vite size warnings without treating them as a task failure.

- [ ] **Step 2: Run local browser QA**

Start Vite with npm.cmd run dev -- --host 127.0.0.1. Use Playwright CLI to inspect /#tools at 1440×1000, 1024×900 and 390×844 in both saved themes. At each viewport verify title, search result, category filter, empty-state reset, safe external-card link, header current state, no horizontal overflow and the last card remains above the music launcher. On desktop verify tool cards and nav receive target-frame feedback; on mobile verify it is absent. Verify Escape closes the mobile menu and search modal with focus returned to the trigger.

- [ ] **Step 3: Record the evidence**

Append a dated entry naming the #tools route, independent data module, responsive breakpoints, target-cursor safety boundaries, full test/build result and browser sizes tested. Do not copy screenshots, external reference assets or provider keys into the repository.

- [ ] **Step 4: Commit**

    git add -- docs/project-log.md
    git commit -m "docs: record tools directory verification"

## Plan Self-Review

- Spec coverage: Task 1 covers curated official data and personal notes; Task 2 covers page layout, search, category controls, empty state, cards, safe external links and responsive styling; Task 3 covers exact hash routing, navigation and search index; Task 4 covers cursor scope, pointer/reduced-motion safety and form exclusions; Task 5 covers full verification and the project record.
- Placeholder scan: no TBD/TODO/future-work placeholders remain; every task defines files, interfaces, failing test, targeted command, implementation boundary and commit.
- Type consistency: ToolCategoryId, ToolLink, ToolCategory, ToolFilter and filterToolCategories originate in Task 1 and are consumed by Task 2. TargetCursor only depends on DOM opt-in attributes created by Tasks 2 and 3. siteSubpageHashes and isSiteSubpageHash originate in Task 3 and stay independent of the UI.

