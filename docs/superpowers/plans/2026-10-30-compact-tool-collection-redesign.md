# Compact Tool Collection Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the oversized ten-link tools page with an original WENHAO-branded, logo-rich, searchable accordion containing all 59 verified reference tools plus the site's existing personal tools, deduplicated to 68 unique destinations.

**Architecture:** A unique flat tool catalog is the source of truth; primary category sections and the virtual “我的常用” section are derived from it. Small focused React components own the favicon fallback, external card, accordion, and directory toolbar, while `ToolNavigationPage` only coordinates query and expansion state. Plain CSS supplies the compact three/two/one-column presentation and motion safety without adding a dependency.

**Tech Stack:** React 19, TypeScript, Vite, Vitest, Testing Library, `user-event`, plain CSS, local browser QA.

**Spec:** `docs/superpowers/specs/2026-10-30-compact-tool-collection-redesign.md`

## Global Constraints

- Include every verified tool from `https://tblog.mmzhiku.xyz/collections/` (8 reference groups, 59 links) and retain the current personal catalog; normalize and deduplicate to 68 unique destinations.
- Keep ten display sections: virtual `featured`, plus `toolbox`, `ai-chat`, `ai-tools`, `bot-frameworks`, `frontend-dev`, `learning-inspiration`, `anime`, `api`, and `cross-border`.
- Do not copy the reference site's SVG title, teal rule, white/gray palette, exact proportions, copy, imagery, music UI, or navigation. Retain the site's purple-black, mist-violet, signal-green WENHAO language and both themes.
- Use `https://favicon.im/<logoHost>` only as an image source; load no third-party scripts. Every logo must have a deterministic initials fallback and fixed dimensions.
- Keep secure HTTPS destinations and render external links with `target="_blank" rel="noopener noreferrer"`.
- Keep all interactive hit areas at least 44px; preserve keyboard operation, visible focus, semantic accordion state, live search summary, and `prefers-reduced-motion` behavior.
- Preserve the existing `#tools` route, global CardNav, theme switcher, target cursor, heavy-route loader, and music dock. Do not modify unrelated pages or data flows.
- Complete and verify locally first. Do not push GitHub or publish without explicit user confirmation.
- Leave the user-owned untracked `output/` directory untouched and unstaged.

---

## File Structure

| Path | Responsibility |
| --- | --- |
| `src/content/tools.ts` | Unique typed catalog, category definitions, derived display sections, unique counts, and pure search helpers. |
| `src/components/tool-navigation/ToolLogo.tsx` | Lazy favicon loading, five-second timeout, and deterministic initials fallback. |
| `src/components/tool-navigation/ToolCard.tsx` | Compact safe external-link card and target-cursor opt-in. |
| `src/components/tool-navigation/ToolCategoryAccordion.tsx` | Accessible independent accordion header/panel with tab-order protection. |
| `src/components/tool-navigation/ToolDirectoryToolbar.tsx` | Search, result summary, expand-all, and collapse-all controls. |
| `src/components/ToolNavigationPage.tsx` | Page composition and search/expanded-state coordination. |
| `src/components/tool-navigation.css` | WENHAO visual treatment, density, accordion motion, breakpoints, themes, and motion reduction. |
| `src/content/navigation.ts` | Continues exporting searchable tool records after the catalog refactor. |
| `tests/tools-content.test.ts` | Inventory completeness, uniqueness, classification, metadata, and pure search behavior. |
| `tests/tool-logo.test.tsx` | Logo URL, lazy attributes, error/timeout fallback, and prop reset. |
| `tests/tool-card.test.tsx` | Compact card content and secure external-link contract. |
| `tests/tool-category-accordion.test.tsx` | Accordion linkage, inert closed state, tab order, and toggle callback. |
| `tests/tool-directory-toolbar.test.tsx` | Controlled search, bulk actions, and unique live result summary. |
| `tests/tool-navigation-page.test.tsx` | Defaults, independent accordions, bulk actions, search expansion/restoration, empty state, semantics, and hit areas. |
| `tests/cross-page-shell.test.tsx` | Updated shared-shell expectation for the new directory toolbar/accordion structure. |
| `tests/target-cursor.test.tsx` | Moves the production tool-card opt-in assertion to the extracted card file. |
| `docs/project-log.md` | Dated local verification record after implementation and browser QA. |

### Task 1: Replace the catalog with a unique, verified 68-tool source of truth

**Files:**
- Modify: `src/content/tools.ts`
- Modify: `tests/tools-content.test.ts`

**Interfaces:**
- Produces `ToolCategoryId`, `ToolSectionId`, `ToolEntry`, `ToolCategory`, `ToolSection`, `toolEntries`, `toolCategories`, `toolSections`, `toolCatalogMetadata`, `normalizeToolHref(href)`, `filterToolSections(sections, query)`, and `countUniqueTools(sections)`.
- `ToolEntry` is `{ id, name, href, host, description, note?, tags, logoHost, categoryId, featured }`.
- `toolCategories` contains nine primary sections and each unique tool once; `toolSections` prepends a derived virtual `featured` section without copying records.
- `filterToolSections` searches tool name, host, description, category title, category description, note, and tags; it removes empty sections while preserving section metadata.

- [ ] **Step 1: Replace the old content tests with failing catalog-contract tests**

```ts
import {
  countUniqueTools,
  filterToolSections,
  toolCatalogMetadata,
  toolCategories,
  toolEntries,
  toolSections,
  normalizeToolHref,
} from '../src/content/tools'

const referenceNames = [
  '网络工具 | 中科大测速', '网络工具 | ITDOG', '图片处理 | 在线图像工具箱', '图片处理 | OneImage',
  '图片查找 | SauceNAO', '图床 | StarDots', '抠图 | 抠抠图', 'GIF 背景移除 | AdWorker', 'PatorJK',
  '豆包', 'ChatGPT', 'Claude', 'Gemini', 'Grok', '能力排行榜 | Artificial Analysis', '能力排行榜 | AI Arena',
  'ModelScope 魔搭社区', 'skill市场 | Skills Marketplace', '提示词优化 | PromptPilot', '资源站 | ACGN AI 资源站',
  '图像生成 | Oblivion Image Gallery', '设计工具 | Figma', '设计工具 | Google AI Studio',
  '设计工具 | Google Stitch', '模型部署 | Ollama', 'NapCat', 'AstrBot', 'Mai-bot', 'NoneBot', 'LLBot', 'One Page Love', 'Mobbin',
  'Awwwards', 'shadcn/ui', 'HeroUI', 'Uiverse', 'CodePen', 'React Bits', 'Magic UI', 'Aceternity UI',
  'Canvas UI', 'Animation Svelte', 'Hover.dev', 'Inspira UI', 'Cult UI', 'Iconify', 'Sketchfab',
  'Java 全栈知识体系', 'JavaGuide', '异常教程', '力扣 LeetCode', '牛客网', 'AGE 动漫', 'ManhwaTop',
  '小小API', '高德地图API', '聚合数据', '有道翻译API', 'Tavily',
] as const

it('contains every verified reference tool and every existing personal destination exactly once', () => {
  expect(referenceNames).toHaveLength(59)
  expect(toolEntries).toHaveLength(68)
  expect(referenceNames.every((name) => toolEntries.some((tool) => tool.name === name))).toBe(true)
  expect(['Midjourney', 'Ozon', 'Wildberries', 'Photopea', 'Unsplash', 'GitHub', 'Vercel', 'Are.na', 'Readwise Reader']
    .every((name) => toolEntries.some((tool) => tool.name === name))).toBe(true)
  const normalizedUrls = toolEntries.map((tool) => normalizeToolHref(tool.href))
  expect(new Set(normalizedUrls).size).toBe(68)
})

it('derives ten display sections without double-counting featured tools', () => {
  expect(toolCategories).toHaveLength(9)
  expect(toolSections.map(({ id }) => id)).toEqual([
    'featured', 'toolbox', 'ai-chat', 'ai-tools', 'bot-frameworks',
    'frontend-dev', 'learning-inspiration', 'anime', 'api', 'cross-border',
  ])
  expect(Object.fromEntries(toolCategories.map(({ id, tools }) => [id, tools.length]))).toEqual({
    toolbox: 11, 'ai-chat': 5, 'ai-tools': 12, 'bot-frameworks': 5,
    'frontend-dev': 19, 'learning-inspiration': 7, anime: 2, api: 5, 'cross-border': 2,
  })
  expect(countUniqueTools(toolSections)).toBe(68)
  expect(toolSections[0].tools).toHaveLength(10)
  expect(toolSections[0].tools.every((tool) => tool.featured)).toBe(true)
})

it('keeps complete safe records and searches category metadata', () => {
  expect(toolEntries.every((tool) => tool.href.startsWith('https://'))).toBe(true)
  expect(toolEntries.every((tool) => tool.description.trim() && tool.tags.length && tool.logoHost.trim())).toBe(true)
  expect(filterToolSections(toolSections, '跨境电商').some(({ id }) => id === 'cross-border')).toBe(true)
  expect(filterToolSections(toolSections, '图片').flatMap(({ tools }) => tools).some(({ name }) => name === 'Photopea')).toBe(true)
  expect(toolCatalogMetadata).toEqual({ totalTools: 68, lastReviewed: '2026-10-30' })
})
```

- [ ] **Step 2: Run the focused test and verify the old model fails**

Run: `npm.cmd test -- tests/tools-content.test.ts`  
Expected: FAIL because the old module has ten tools, five category IDs, and none of the new exports.

- [ ] **Step 3: Define the exact model and pure derivation helpers**

```ts
export type ToolCategoryId =
  | 'toolbox' | 'ai-chat' | 'ai-tools' | 'bot-frameworks'
  | 'frontend-dev' | 'learning-inspiration' | 'anime' | 'api' | 'cross-border'
export type ToolSectionId = 'featured' | ToolCategoryId

export type ToolEntry = {
  id: string
  name: string
  href: string
  host: string
  description: string
  note?: string
  tags: readonly string[]
  logoHost: string
  categoryId: ToolCategoryId
  featured: boolean
}

export type ToolCategory = {
  id: ToolCategoryId
  number: string
  title: string
  description: string
  tools: readonly ToolEntry[]
}

export type ToolSection = Omit<ToolCategory, 'id'> & { id: ToolSectionId }

export const toolCategories = categoryDefinitions.map((category) => ({
  ...category,
  tools: toolEntries.filter((tool) => tool.categoryId === category.id),
}))

export const toolSections: readonly ToolSection[] = [
  {
    id: 'featured', number: '00', title: '我的常用',
    description: '真正会反复打开的工具与工作入口。',
    tools: toolEntries.filter((tool) => tool.featured),
  },
  ...toolCategories,
]

export const filterToolSections = (sections: readonly ToolSection[], query: string) => {
  const normalized = query.trim().toLocaleLowerCase('zh-CN')
  if (!normalized) return sections
  return sections
    .map((section) => ({
      ...section,
      tools: section.tools.filter((tool) =>
        [tool.name, tool.host, tool.description, tool.note ?? '', section.title, section.description, ...tool.tags]
          .join(' ').toLocaleLowerCase('zh-CN').includes(normalized),
      ),
    }))
    .filter((section) => section.tools.length > 0)
}

export const countUniqueTools = (sections: readonly ToolSection[]) =>
  new Set(sections.flatMap((section) => section.tools.map((tool) => tool.id))).size

export const normalizeToolHref = (href: string) => {
  const url = new URL(href)
  url.hostname = url.hostname.toLocaleLowerCase('en-US')
  url.hash = ''
  if (url.pathname !== '/') url.pathname = url.pathname.replace(/\/$/, '')
  return url.toString()
}
```

Use category numbers `01` through `09` in the same order as `toolSections` after `featured`. Set `toolCatalogMetadata.lastReviewed` to `2026-10-30` and derive `totalTools` from `toolEntries.length`.

- [ ] **Step 4: Populate the 59 verified reference records and retain the nine non-duplicate personal records**

Create one explicit `ToolEntry` object for every row below. Use the hostname from the destination as `host` and `logoHost`, except `StarDots` uses `logoHost: 'stardots.io'`. Use the shown sentence as `description`; use the group name plus the leading qualifier as tags. Preserve the current `note`, description, tags, and official URL for the nine non-duplicate personal records, and retain the existing ChatGPT record for the one duplicate. Mark all ten original personal tools as `featured: true`; mark all reference-only additions false initially. Rename the existing Are.na ID to `are-na` so it cannot collide with `ai-arena`.

**`toolbox`**

| id / name | URL | Exact description |
| --- | --- | --- |
| `ustc-speed` / 网络工具 \| 中科大测速 | `https://test.ustc.edu.cn/` | 检测本地网络的下载、上传与延迟表现。 |
| `itdog` / 网络工具 \| ITDOG | `https://www.itdog.cn/` | 提供 Ping、TCPing、HTTP 与路由追踪等网络测试。 |
| `phototool` / 图片处理 \| 在线图像工具箱 | `https://phototool.cn/` | 在线完成图片格式转换、压缩、裁剪与批量处理。 |
| `oneimage` / 图片处理 \| OneImage | `https://oneimage.co/` | 注重隐私的在线图片压缩、裁剪、模糊与格式转换工具。 |
| `saucenao` / 图片查找 \| SauceNAO | `https://saucenao.com/` | 通过图片反向查找插画、动漫与其他图像来源。 |
| `stardots` / 图床 \| StarDots | `https://dashboard.stardots.io/?lang=zh` | 提供图片托管、管理、转换与 CDN 分发。 |
| `koukoutu` / 抠图 \| 抠抠图 | `https://www.koukoutu.com/removebgtool/all` | 在浏览器中自动移除图片背景并导出透明素材。 |
| `adworker-gif` / GIF 背景移除 \| AdWorker | `https://adworker.ai/zh/tools/gif-background-remover/` | 自动移除 GIF 动图背景并保留动画。 |
| `patorjk` / PatorJK | `https://patorjk.com/` | 收录 ASCII 字体、文本生成和多种视觉小工具。 |

Also move existing `Photopea` and `Unsplash` into `toolbox` without altering their current URLs or copy.

**`ai-chat`**

| id / name | URL | Exact description |
| --- | --- | --- |
| `doubao` / 豆包 | `https://www.doubao.com/` | 字节跳动推出的对话式 AI 助手，支持写作、问答与创作。 |
| `chatgpt` / ChatGPT | `https://chatgpt.com/` | 用于头脑风暴、写作、学习、规划与代码协作的 AI 助手。 |
| `claude` / Claude | `https://claude.ai/` | 适合长文本理解、写作、分析与代码协作的 AI 助手。 |
| `gemini` / Gemini | `https://gemini.google.com/` | Google 的多模态 AI 助手，支持文字、图片与资料分析。 |
| `grok` / Grok | `https://grok.com/` | xAI 推出的对话式助手，用于问答、推理与内容创作。 |

**`ai-tools`**

| id / name | URL | Exact description |
| --- | --- | --- |
| `artificial-analysis` / 能力排行榜 \| Artificial Analysis | `https://artificialanalysis.ai/?intelligence-category=reasoning-vs-non-reasoning` | 对比主流 AI 模型的能力、速度、价格与评测结果。 |
| `ai-arena` / 能力排行榜 \| AI Arena | `https://arena.ai/leaderboard` | 通过匿名对战与用户投票查看模型能力排行。 |
| `modelscope` / ModelScope 魔搭社区 | `https://www.modelscope.cn/` | 提供模型、数据集、创空间与 AI 开发资源。 |
| `skills-marketplace` / skill市场 \| Skills Marketplace | `https://skillsmp.com/` | 浏览和发现面向智能体与开发工作流的技能资源。 |
| `promptpilot` / 提示词优化 \| PromptPilot | `https://promptpilot.volcengine.com/` | 分析并优化提示词，辅助生成更稳定的模型结果。 |
| `acgn-ai` / 资源站 \| ACGN AI 资源站 | `https://res.acgnai.top/` | 聚合 ACGN 创作相关的 AI 模型、教程与资源。 |
| `oblivion-image` / 图像生成 \| Oblivion Image Gallery | `https://image.oblivionis.net/gallery` | 浏览和生成 AI 图像，并查看可复用的视觉灵感。 |
| `figma` / 设计工具 \| Figma | `https://www.figma.com/` | 用于界面设计、原型制作与团队协作的在线设计平台。 |
| `google-ai-studio` / 设计工具 \| Google AI Studio | `https://aistudio.google.com/` | 试用 Gemini 模型并构建、测试多模态提示。 |
| `google-stitch` / 设计工具 \| Google Stitch | `https://stitch.withgoogle.com/` | 使用 AI 生成和迭代界面设计与前端原型。 |
| `ollama` / 模型部署 \| Ollama | `https://ollama.com/` | 在本地下载、运行和管理开源大语言模型。 |

Move existing `Midjourney` into `ai-tools` and preserve its current record.

**`bot-frameworks`**

| id / name | URL | Exact description |
| --- | --- | --- |
| `napcat` / NapCat | `https://napneko.github.io/` | 面向 QQ 生态的现代化机器人协议实现与开发入口。 |
| `astrbot` / AstrBot | `https://astrbot.app/` | 支持多平台与多模型接入的开源聊天机器人框架。 |
| `mai-bot` / Mai-bot | `https://docs.mai-mai.org/` | 提供聊天机器人部署、配置与扩展开发文档。 |
| `nonebot` / NoneBot | `https://nonebot.dev/docs/` | Python 异步跨平台机器人框架与插件生态。 |
| `llbot` / LLBot | `https://github.com/LLOneBot/LuckyLilliaBot` | 基于开源代码构建的聊天机器人项目与扩展入口。 |

**`frontend-dev`**

| id / name | URL | Exact description |
| --- | --- | --- |
| `one-page-love` / One Page Love | `https://onepagelove.com/` | 收集优秀单页网站、落地页模板与设计灵感。 |
| `mobbin` / Mobbin | `https://mobbin.com/` | 检索真实产品的移动端与网页界面设计模式。 |
| `awwwards` / Awwwards | `https://www.awwwards.com/` | 展示全球优秀网站、交互设计与创意开发案例。 |
| `shadcn-ui` / shadcn/ui | `https://ui.shadcn.com/` | 可复制、可组合并自由定制的 React 组件集合。 |
| `heroui` / HeroUI | `https://heroui.com/` | 面向 React 应用的现代化可访问组件库。 |
| `uiverse` / Uiverse | `https://uiverse.io/` | 社区驱动的 HTML、CSS 与交互动效组件集合。 |
| `codepen` / CodePen | `https://codepen.io/` | 在线编写、预览和分享前端代码与交互实验。 |
| `react-bits` / React Bits | `https://www.reactbits.dev/` | 收录可配置的 React 动效、文本与背景组件。 |
| `magic-ui` / Magic UI | `https://magicui.design/` | 提供面向产品页面的动效与视觉 React 组件。 |
| `aceternity-ui` / Aceternity UI | `https://ui.aceternity.com/` | 提供现代网页动效、背景和交互组件源码。 |
| `canvas-ui` / Canvas UI | `https://canvasui.dev/` | 面向网页创作的视觉组件与界面素材集合。 |
| `animation-svelte` / Animation Svelte | `https://animation-svelte.vercel.app/` | 展示可用于 Svelte 项目的动画组件与交互范例。 |
| `hover-dev` / Hover.dev | `https://www.hover.dev/` | 提供可直接使用的 React 与 Tailwind 交互组件。 |
| `inspira-ui` / Inspira UI | `https://inspira-ui.com/` | 提供可复制的 Vue、Nuxt 动效和界面组件。 |
| `cult-ui` / Cult UI | `https://www.cult-ui.com/` | 收录强调视觉表现的现代 React 组件与动效。 |
| `iconify` / Iconify | `https://iconify.design/` | 统一检索和使用多个开源图标集。 |
| `sketchfab` / Sketchfab | `https://sketchfab.com/` | 浏览、发布和嵌入可交互的 3D 模型。 |

Move existing `GitHub` and `Vercel` into `frontend-dev` and preserve their current records.

**`learning-inspiration`**

| id / name | URL | Exact description |
| --- | --- | --- |
| `pdai` / Java 全栈知识体系 | `https://pdai.tech/` | 系统整理 Java、架构、中间件与全栈开发知识。 |
| `javaguide` / JavaGuide | `https://javaguide.cn/` | 面向 Java 学习与求职准备的开源知识库。 |
| `exception-site` / 异常教程 | `https://www.exception.site/` | 提供编程、后端开发与工程实践教程。 |
| `leetcode` / 力扣 LeetCode | `https://leetcode.cn/` | 通过算法题库练习编程、数据结构与面试能力。 |
| `nowcoder` / 牛客网 | `https://www.nowcoder.com/` | 提供编程练习、面试题库、笔试与求职社区。 |

Move existing `Are.na` and `Readwise Reader` into `learning-inspiration` and preserve their current records.

**`anime`**

| id / name | URL | Exact description |
| --- | --- | --- |
| `age-anime` / AGE 动漫 | `https://www.agedm.io/update` | 查看动漫更新与作品索引的聚合入口。 |
| `manhwatop` / ManhwaTop | `https://manhwatop.com/` | 浏览和阅读漫画作品与最新章节。 |

**`api`**

| id / name | URL | Exact description |
| --- | --- | --- |
| `xxapi` / 小小API | `https://xxapi.cn/` | 提供可直接调用的免费与开放数据接口。 |
| `amap-api` / 高德地图API | `https://lbs.amap.com/` | 提供地图、定位、路线与地理编码开发服务。 |
| `juhe-api` / 聚合数据 | `https://www.juhe.cn/` | 聚合生活、企业、交通等多领域数据接口。 |
| `youdao-api` / 有道翻译API | `https://ai.youdao.com/` | 提供文本翻译、语言识别与自然语言服务。 |
| `tavily` / Tavily | `https://app.tavily.com/home` | 为 AI 应用和智能体提供面向检索的搜索 API。 |

**`cross-border`**

Preserve the current exact Ozon and Wildberries entries and their seller URLs; both remain featured.

- [ ] **Step 5: Run content tests and commit the independently usable catalog**

Run: `npm.cmd test -- tests/tools-content.test.ts`  
Expected: PASS with 68 unique entries, 59 reference names, ten display sections, and review date `2026-10-30`.

```powershell
git add -- src/content/tools.ts tests/tools-content.test.ts
git commit -m "feat: expand verified tool catalog"
```

### Task 2: Add resilient lazy LOGOs and compact external cards

**Files:**
- Create: `src/components/tool-navigation/ToolLogo.tsx`
- Create: `src/components/tool-navigation/ToolCard.tsx`
- Create: `tests/tool-logo.test.tsx`
- Create: `tests/tool-card.test.tsx`

**Interfaces:**
- `ToolLogo({ name, logoHost, categoryId }: ToolLogoProps)` renders either a decorative lazy image or a deterministic initials fallback.
- `ToolCard({ tool, interactive = true }: ToolCardProps)` renders one compact anchor; `interactive: false` sets `tabIndex={-1}` for a collapsed accordion.
- `ToolCard` consumes `ToolEntry`; later accordions depend only on this public prop contract.

- [ ] **Step 1: Write failing LOGO behavior tests**

```tsx
import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ToolLogo } from '../src/components/tool-navigation/ToolLogo'

afterEach(() => vi.useRealTimers())

it('loads the requested favicon lazily without repeating the visible tool name', () => {
  const { container } = render(<ToolLogo name="StarDots" logoHost="stardots.io" categoryId="toolbox" />)
  const image = container.querySelector('img')!
  expect(image).toHaveAttribute('src', 'https://favicon.im/stardots.io')
  expect(image).toHaveAttribute('loading', 'lazy')
  expect(image).toHaveAttribute('decoding', 'async')
  expect(image).toHaveAttribute('alt', '')
})

it('replaces an error or timeout with deterministic initials and resets for a new host', () => {
  vi.useFakeTimers()
  const view = render(<ToolLogo name="StarDots" logoHost="broken.example" categoryId="toolbox" />)
  fireEvent.error(view.container.querySelector('img')!)
  expect(screen.getByText('ST')).toBeVisible()
  view.rerender(<ToolLogo name="GitHub" logoHost="github.com" categoryId="frontend-dev" />)
  expect(view.container.querySelector('img')).toHaveAttribute('src', 'https://favicon.im/github.com')
  act(() => vi.advanceTimersByTime(5000))
  expect(screen.getByText('GI')).toBeVisible()
})

it('does not replace a successfully loaded image when the timeout expires', () => {
  vi.useFakeTimers()
  const view = render(<ToolLogo name="GitHub" logoHost="github.com" categoryId="frontend-dev" />)
  fireEvent.load(view.container.querySelector('img')!)
  act(() => vi.advanceTimersByTime(5000))
  expect(view.container.querySelector('img')).toHaveAttribute('src', 'https://favicon.im/github.com')
  expect(screen.queryByText('GI')).not.toBeInTheDocument()
})
```

- [ ] **Step 2: Write failing compact-card contract tests**

```tsx
import { render, screen } from '@testing-library/react'
import { ToolCard } from '../src/components/tool-navigation/ToolCard'

const tool = {
  id: 'react-bits', name: 'React Bits', href: 'https://www.reactbits.dev/', host: 'reactbits.dev',
  description: '收录可配置的 React 动效、文本与背景组件。', note: '不应显示的长注记',
  tags: ['前端组件'], logoHost: 'reactbits.dev', categoryId: 'frontend-dev', featured: false,
} as const

it('renders only the compact visible hierarchy and a safe target-cursor link', () => {
  render(<ToolCard tool={tool} />)
  const link = screen.getByRole('link', { name: /React Bits/ })
  expect(link).toHaveAttribute('target', '_blank')
  expect(link).toHaveAttribute('rel', 'noopener noreferrer')
  expect(link).toHaveAttribute('data-target-cursor')
  expect(link).toHaveAttribute('data-cursor-label', '打开工具')
  expect(link).toHaveTextContent('收录可配置的 React 动效、文本与背景组件。')
  expect(link).toHaveTextContent('reactbits.dev')
  expect(link).not.toHaveTextContent('不应显示的长注记')
  expect(link).not.toHaveTextContent('EXTERNAL LINK')
})
```

- [ ] **Step 3: Run both new test files and verify they fail**

Run: `npm.cmd test -- tests/tool-logo.test.tsx tests/tool-card.test.tsx`  
Expected: FAIL because neither component exists.

- [ ] **Step 4: Implement `ToolLogo` with a five-second timeout and reset-safe cleanup**

```tsx
import { useEffect, useMemo, useRef, useState } from 'react'
import type { ToolCategoryId } from '../../content/tools'

export type ToolLogoProps = { name: string; logoHost: string; categoryId: ToolCategoryId }

const initialsFor = (name: string) => Array.from(name.trim().replace(/[^\p{L}\p{N}]+/gu, ''))
  .slice(0, 2).join('').toLocaleUpperCase('en-US') || 'WH'

export function ToolLogo({ name, logoHost, categoryId }: ToolLogoProps) {
  const [failed, setFailed] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const timeoutRef = useRef<number | null>(null)
  const initials = useMemo(() => initialsFor(name), [name])
  const clearFallbackTimeout = () => {
    if (timeoutRef.current !== null) window.clearTimeout(timeoutRef.current)
    timeoutRef.current = null
  }

  useEffect(() => {
    setFailed(false)
    setLoaded(false)
    clearFallbackTimeout()
    timeoutRef.current = window.setTimeout(() => {
      timeoutRef.current = null
      setFailed(true)
    }, 5000)
    return clearFallbackTimeout
  }, [logoHost])

  if (failed) return <span className="tool-logo-fallback" data-category={categoryId} aria-hidden="true">{initials}</span>
  return <img className="tool-logo-image" src={`https://favicon.im/${logoHost}`} alt="" width="28" height="28"
    loading="lazy" decoding="async" data-loaded={loaded ? 'true' : 'false'}
    onLoad={() => { clearFallbackTimeout(); setLoaded(true) }}
    onError={() => { clearFallbackTimeout(); setFailed(true) }} />
}
```

- [ ] **Step 5: Implement `ToolCard` with no old metadata clutter**

```tsx
export function ToolCard({ tool, interactive = true }: { tool: ToolEntry; interactive?: boolean }) {
  return (
    <a className="tool-card editorial-surface" href={tool.href} target="_blank" rel="noopener noreferrer"
      tabIndex={interactive ? undefined : -1} data-target-cursor="" data-cursor-label="打开工具">
      <span className="tool-card-identity">
        <ToolLogo name={tool.name} logoHost={tool.logoHost} categoryId={tool.categoryId} />
        <strong>{tool.name}</strong>
      </span>
      <span className="tool-card-arrow" aria-hidden="true">↗</span>
      <span className="tool-card-description">{tool.description}</span>
      <span className="tool-card-host">{tool.host}</span>
    </a>
  )
}
```

- [ ] **Step 6: Run focused tests and commit**

Run: `npm.cmd test -- tests/tool-logo.test.tsx tests/tool-card.test.tsx`  
Expected: PASS, including error, timeout, successful-load, prop-reset, compact-copy, and external-link assertions.

```powershell
git add -- src/components/tool-navigation/ToolLogo.tsx src/components/tool-navigation/ToolCard.tsx tests/tool-logo.test.tsx tests/tool-card.test.tsx
git commit -m "feat: add resilient tool logos and cards"
```

### Task 3: Build the accessible accordion and directory toolbar

**Files:**
- Create: `src/components/tool-navigation/ToolCategoryAccordion.tsx`
- Create: `src/components/tool-navigation/ToolDirectoryToolbar.tsx`
- Create: `tests/tool-category-accordion.test.tsx`
- Create: `tests/tool-directory-toolbar.test.tsx`

**Interfaces:**
- `ToolCategoryAccordion({ section, open, onToggle })` consumes `ToolSection` and calls `onToggle(section.id)`.
- `ToolDirectoryToolbar({ query, matchCount, sectionCount, onQueryChange, onExpandAll, onCollapseAll })` owns no state.
- Accordion panels retain their DOM for CSS closing animation, expose `aria-hidden`, become `inert` while closed, and pass `interactive={false}` to their cards.

- [ ] **Step 1: Write failing isolated accordion and toolbar tests**

```tsx
it('connects the category button to an inert closed panel and reports its ID on toggle', async () => {
  const user = userEvent.setup()
  const onToggle = vi.fn()
  const section = toolSections.find(({ id }) => id === 'ai-chat')!
  const view = render(<ToolCategoryAccordion section={section} open={false} onToggle={onToggle} />)
  const trigger = screen.getByRole('button', { name: /AI 聊天网站.*5 个工具/ })
  const panel = screen.getByRole('region', { hidden: true })
  expect(trigger).toHaveAttribute('aria-expanded', 'false')
  expect(trigger).toHaveAttribute('aria-controls', panel.id)
  expect(panel).toHaveAttribute('aria-hidden', 'true')
  expect(panel).toHaveAttribute('inert')
  expect(view.container.querySelector('a')).toHaveAttribute('tabindex', '-1')
  await user.click(trigger)
  expect(onToggle).toHaveBeenCalledWith('ai-chat')
})

it('forwards search and bulk actions while announcing unique results', async () => {
  const user = userEvent.setup()
  const onQueryChange = vi.fn()
  const onExpandAll = vi.fn()
  const onCollapseAll = vi.fn()
  render(<ToolDirectoryToolbar query="" matchCount={68} sectionCount={10}
    onQueryChange={onQueryChange} onExpandAll={onExpandAll} onCollapseAll={onCollapseAll} />)
  await user.type(screen.getByRole('searchbox', { name: '搜索工具' }), '图')
  expect(onQueryChange).toHaveBeenLastCalledWith('图')
  await user.click(screen.getByRole('button', { name: '全部展开' }))
  await user.click(screen.getByRole('button', { name: '全部收起' }))
  expect(onExpandAll).toHaveBeenCalledOnce()
  expect(onCollapseAll).toHaveBeenCalledOnce()
  expect(document.querySelector('[aria-live="polite"]')).toHaveTextContent('匹配 68 个工具 / 10 个分类')
})
```

- [ ] **Step 2: Run the isolated component tests and verify they fail**

Run: `npm.cmd test -- tests/tool-category-accordion.test.tsx tests/tool-directory-toolbar.test.tsx`  
Expected: FAIL because the new components do not exist.

- [ ] **Step 3: Implement the stateless toolbar**

```tsx
export type ToolDirectoryToolbarProps = {
  query: string
  matchCount: number
  sectionCount: number
  onQueryChange: (value: string) => void
  onExpandAll: () => void
  onCollapseAll: () => void
}

export function ToolDirectoryToolbar(props: ToolDirectoryToolbarProps) {
  return (
    <section className="tool-directory-toolbar" aria-label="工具目录控制">
      <label className="tool-search-label">
        <span>搜索工具</span>
        <span className="tool-search-field">
          <span aria-hidden="true">⌕</span>
          <input type="search" aria-label="搜索工具" placeholder="名称、用途、分类、标签或网站"
            value={props.query} onChange={(event) => props.onQueryChange(event.target.value)} />
        </span>
      </label>
      <div className="tool-directory-actions">
        <button type="button" onClick={props.onExpandAll}>全部展开</button>
        <button type="button" onClick={props.onCollapseAll}>全部收起</button>
      </div>
      <p className="tool-results-summary" aria-live="polite">
        匹配 <strong>{props.matchCount}</strong> 个工具 / {props.sectionCount} 个分类
      </p>
    </section>
  )
}
```

- [ ] **Step 4: Implement the stateless accordion with tab-order protection**

```tsx
export function ToolCategoryAccordion({ section, open, onToggle }: ToolCategoryAccordionProps) {
  const panelId = `tool-section-${section.id}`
  const buttonId = `tool-section-trigger-${section.id}`
  return (
    <section className="tool-category-accordion" data-category={section.id}>
      <h2>
        <button id={buttonId} type="button" aria-expanded={open} aria-controls={panelId}
          onClick={() => onToggle(section.id)}>
          <span className="tool-category-number">{section.number}</span>
          <span className="tool-category-copy"><strong>{section.title}</strong><small>{section.description}</small></span>
          <span className="tool-category-count">{section.tools.length} 个工具</span>
          <span className="tool-category-chevron" aria-hidden="true">⌄</span>
        </button>
      </h2>
      <div id={panelId} role="region" aria-labelledby={buttonId} aria-hidden={!open}
        inert={!open} className="tool-category-panel" data-open={open ? 'true' : 'false'}>
        <div className="tool-category-panel-inner"><div className="tool-card-grid">
          {section.tools.map((tool) => <ToolCard key={tool.id} tool={tool} interactive={open} />)}
        </div></div>
      </div>
    </section>
  )
}
```

If the installed React type definition rejects boolean `inert`, use `inert={open ? undefined : ''}` with a local typed spread; do not remove the attribute or leave collapsed anchors keyboard-focusable.

- [ ] **Step 5: Run the isolated tests and verify the public component contracts pass**

Run: `npm.cmd test -- tests/tool-category-accordion.test.tsx tests/tool-directory-toolbar.test.tsx`  
Expected: PASS with correct button/panel linkage, inert closed content, tab-order protection, search forwarding, bulk callbacks, and live summary.

- [ ] **Step 6: Commit the independently passing components**

```powershell
git add -- src/components/tool-navigation/ToolCategoryAccordion.tsx src/components/tool-navigation/ToolDirectoryToolbar.tsx tests/tool-category-accordion.test.tsx tests/tool-directory-toolbar.test.tsx
git commit -m "feat: add tool directory accordions"
```

### Task 4: Recompose `ToolNavigationPage` and preserve expansion state across search

**Files:**
- Modify: `src/components/ToolNavigationPage.tsx`
- Modify: `src/content/navigation.ts`
- Modify: `tests/tool-navigation-page.test.tsx`

**Interfaces:**
- `ToolNavigationPage()` remains a named, prop-free component used by the existing lazy route.
- `DEFAULT_OPEN_IDS` is `new Set<ToolSectionId>(['featured', 'toolbox'])`.
- `navigation.ts` continues exporting `toolSearchContent`; point it at primary `toolCategories`, not the virtual featured section, to avoid duplicate global search records.

- [ ] **Step 1: Add the remaining failing page assertions**

```tsx
it('shows compact catalog metadata and a recoverable empty state', async () => {
  const user = userEvent.setup()
  render(<ToolNavigationPage />)
  expect(screen.getByText('已收录 68 个工具', { exact: false })).toHaveTextContent('最近核对 2026-10-30')
  const search = screen.getByRole('searchbox', { name: '搜索工具' })
  await user.type(search, '不存在的工具')
  expect(screen.getByText('没有找到匹配的工具')).toBeVisible()
  await user.click(screen.getByRole('button', { name: '清除搜索' }))
  expect(search).toHaveValue('')
  expect(screen.getByRole('button', { name: /工具箱/ })).toHaveAttribute('aria-expanded', 'true')
})

it('keeps every rendered card secure and target-cursor enabled', () => {
  render(<ToolNavigationPage />)
  for (const link of screen.getAllByRole('link')) {
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', 'noopener noreferrer')
    expect(link).toHaveAttribute('data-target-cursor')
  }
})

it('starts with only 我的常用 and 工具箱 expanded and toggles categories independently', async () => {
  const user = userEvent.setup()
  render(<ToolNavigationPage />)
  expect(screen.getByRole('button', { name: /我的常用/ })).toHaveAttribute('aria-expanded', 'true')
  expect(screen.getByRole('button', { name: /工具箱/ })).toHaveAttribute('aria-expanded', 'true')
  const aiChat = screen.getByRole('button', { name: /AI 聊天网站/ })
  expect(aiChat).toHaveAttribute('aria-expanded', 'false')
  await user.click(aiChat)
  expect(aiChat).toHaveAttribute('aria-expanded', 'true')
  expect(screen.getByRole('button', { name: /工具箱/ })).toHaveAttribute('aria-expanded', 'true')
})

it('expands and collapses all without changing the search query', async () => {
  const user = userEvent.setup()
  render(<ToolNavigationPage />)
  const search = screen.getByRole('searchbox', { name: '搜索工具' })
  await user.type(search, '图片')
  await user.click(screen.getByRole('button', { name: '全部收起' }))
  expect(search).toHaveValue('图片')
  expect(screen.getAllByRole('button', { name: /个工具/ })
    .every((button) => button.getAttribute('aria-expanded') === 'false')).toBe(true)
  await user.click(screen.getByRole('button', { name: '全部展开' }))
  expect(screen.getAllByRole('button', { name: /个工具/ })
    .every((button) => button.getAttribute('aria-expanded') === 'true')).toBe(true)
})

it('auto-expands matches and restores the pre-search expansion set when cleared', async () => {
  const user = userEvent.setup()
  render(<ToolNavigationPage />)
  const aiChat = screen.getByRole('button', { name: /AI 聊天网站/ })
  await user.click(aiChat)
  const search = screen.getByRole('searchbox', { name: '搜索工具' })
  await user.type(search, 'Ollama')
  expect(screen.getByRole('button', { name: /AI 工具网站/ })).toHaveAttribute('aria-expanded', 'true')
  await user.clear(search)
  expect(aiChat).toHaveAttribute('aria-expanded', 'true')
  expect(screen.getByRole('button', { name: /AI 工具网站/ })).toHaveAttribute('aria-expanded', 'false')
})
```

Also assert every category trigger has `aria-controls`, the matching closed panel has `aria-hidden="true"` and `inert`, the summary counts unique IDs, and all visible toolbar/category/card controls compute to `min-height >= 44px` when the stylesheet is loaded into the test document.

- [ ] **Step 2: Implement query, expansion, and pre-search restoration state**

```tsx
const DEFAULT_OPEN_IDS = new Set<ToolSectionId>(['featured', 'toolbox'])

export function ToolNavigationPage() {
  const [query, setQuery] = useState('')
  const [expandedIds, setExpandedIds] = useState(() => new Set(DEFAULT_OPEN_IDS))
  const preSearchExpandedIds = useRef(new Set(DEFAULT_OPEN_IDS))
  const visibleSections = useMemo(() => filterToolSections(toolSections, query), [query])
  const matchCount = useMemo(() => countUniqueTools(visibleSections), [visibleSections])

  const handleQueryChange = (nextQuery: string) => {
    const wasSearching = Boolean(query.trim())
    const willSearch = Boolean(nextQuery.trim())
    if (!wasSearching && willSearch) preSearchExpandedIds.current = new Set(expandedIds)
    setQuery(nextQuery)
    if (willSearch) setExpandedIds(new Set(filterToolSections(toolSections, nextQuery).map(({ id }) => id)))
    else if (wasSearching) setExpandedIds(new Set(preSearchExpandedIds.current))
  }
```

Complete the handlers as follows: category toggle adds/removes exactly one ID; expand all uses the IDs in `visibleSections`; collapse all uses an empty set; clear search calls `handleQueryChange('')`. Never mutate an existing `Set` in place.

- [ ] **Step 3: Replace the oversized page markup with the compact composition**

Keep `<main className="tool-navigation-page editorial-page" id="tools" aria-labelledby="tools-title">`, one visible H1, the `editorial-page-intro` hook, and the metadata `<time>`. Use eyebrow `WENHAO / TOOL COLLECTION`, title `工具导航`, and sentence `把真正好用的工具，放在离想法更近的地方。`. Render `ToolDirectoryToolbar`, an empty state with button `清除搜索`, and one `ToolCategoryAccordion` for every visible section. Remove category pills, numbered cards, card tags, long notes, and the `EXTERNAL LINK` footer.

- [ ] **Step 4: Keep global search data unique after the model refactor**

```ts
// src/content/navigation.ts
import { toolCategories } from './tools'
export const toolSearchContent = toolCategories
```

The existing global search flattens each primary category once. Do not export `toolSections` here because featured tools would be indexed twice.

- [ ] **Step 5: Run page, content, and cross-page search tests and commit**

Run: `npm.cmd test -- tests/tools-content.test.ts tests/tool-logo.test.tsx tests/tool-card.test.tsx tests/tool-navigation-page.test.tsx tests/search-dialog.test.tsx`  
Expected: PASS; search auto-opens matches, clearing restores the saved set, unique match count remains 68 at rest, and global search has no featured duplicates.

```powershell
git add -- src/components/ToolNavigationPage.tsx src/content/navigation.ts src/components/tool-navigation/ToolCategoryAccordion.tsx src/components/tool-navigation/ToolDirectoryToolbar.tsx tests/tool-navigation-page.test.tsx
git commit -m "feat: rebuild compact tool directory interactions"
```

### Task 5: Replace the oversized styles with a compact, original WENHAO system

**Files:**
- Modify: `src/components/tool-navigation.css`
- Modify: `tests/tool-navigation-page.test.tsx`

**Interfaces:**
- Keeps local `--tool-*` aliases backed by shared site tokens.
- Desktop grid is three columns, `<=1080px` is two, and `<=640px` is one.
- Accordion opening uses `grid-template-rows`; cards are `145–160px`, not the old `292/322px` panels.

- [ ] **Step 1: Add failing static density and motion-safety assertions**

```ts
it('defines compact cards, three responsive grid states, and reduced-motion overrides', () => {
  const css = readFileSync('src/components/tool-navigation.css', 'utf8')
  expect(css).not.toMatch(/min-height:\s*(?:292|322)px/)
  expect(css).toMatch(/\.tool-navigation-heading h1\s*\{[^}]*font-size:\s*clamp\(48px,\s*5vw,\s*64px\)/s)
  expect(css).toMatch(/\.tool-card-grid\s*\{[^}]*grid-template-columns:\s*repeat\(3,/s)
  expect(css).toMatch(/@media \(max-width:\s*1080px\)[\s\S]*repeat\(2,/s)
  expect(css).toMatch(/@media \(max-width:\s*640px\)[\s\S]*grid-template-columns:\s*1fr/s)
  expect(css).toMatch(/\.tool-card\s*\{[^}]*min-height:\s*148px/s)
  expect(css).not.toMatch(/\.tool-card:hover\s*\{[^}]*scale\(/s)
  expect(css).toMatch(/@media \(prefers-reduced-motion:\s*reduce\)/)
})
```

- [ ] **Step 2: Run the page test and verify the old stylesheet fails**

Run: `npm.cmd test -- tests/tool-navigation-page.test.tsx`  
Expected: FAIL on the 104px heading, 322/292px cards, missing accordion selectors, and missing reduced-motion block.

- [ ] **Step 3: Rewrite the page and toolbar density**

Use these fixed decisions:

```css
.tool-navigation-page { min-height: 100svh; padding: 44px 0 116px; background: var(--paper); }
.tool-navigation-page .frame { width: min(1180px, calc(100% - 64px)); }
.tool-navigation-heading { display: grid; grid-template-columns: minmax(0, 1fr) minmax(240px, 360px); gap: 48px; padding: 26px 0 30px; }
.tool-navigation-heading h1 { font-size: clamp(48px, 5vw, 64px); line-height: .98; letter-spacing: -.075em; }
.tool-directory-toolbar { display: grid; grid-template-columns: minmax(280px, 620px) auto; align-items: end; gap: 12px 24px; }
.tool-search-field, .tool-directory-actions button, .tool-category-accordion h2 button { min-height: 44px; }
```

Keep the search surface low-contrast purple-black in dark mode and warm paper in light mode. The title must not use the reference SVG treatment or teal rule.

- [ ] **Step 4: Implement accordion and card visuals**

```css
.tool-category-accordion { border-top: 1px solid var(--tool-line); }
.tool-category-accordion h2 { margin: 0; }
.tool-category-accordion h2 button { width: 100%; display: grid; grid-template-columns: 42px minmax(0, 1fr) auto 24px; align-items: center; gap: 14px; padding: 18px 0; border: 0; background: transparent; color: inherit; text-align: left; }
.tool-category-panel { display: grid; grid-template-rows: 0fr; transition: grid-template-rows .35s cubic-bezier(.22, 1, .36, 1); }
.tool-category-panel[data-open="true"] { grid-template-rows: 1fr; }
.tool-category-panel-inner { min-height: 0; overflow: hidden; }
.tool-card-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 16px; padding: 4px 0 22px 56px; }
.tool-card { position: relative; display: grid; grid-template-rows: auto 1fr auto; min-height: 148px; padding: 18px; border: 1px solid var(--tool-line); border-radius: 14px; background: color-mix(in srgb, var(--tool-surface) 88%, transparent); transition: transform .2s, border-color .2s, box-shadow .2s, background .2s; }
.tool-card:hover { transform: translateY(-2px); border-color: color-mix(in srgb, var(--tool-accent) 55%, var(--tool-line)); }
.tool-logo-image, .tool-logo-fallback { width: 28px; height: 28px; border-radius: 6px; }
```

Clamp descriptions to two lines with `display: -webkit-box`, `-webkit-line-clamp: 2`, and `overflow: hidden`. Keep the host at 11–12px. Fade/translate the arrow on hover/focus, but keep it visible enough on coarse pointers to communicate the external action.

- [ ] **Step 5: Add responsive and motion rules**

At `max-width: 1080px`, change `.tool-card-grid` to two columns. At `max-width: 640px`, use `width: calc(100% - 32px)`, a one-column heading and toolbar, `clamp(36px, 10vw, 44px)` H1, one card column, `padding-left: 0`, and compact category copy. Add:

```css
@media (prefers-reduced-motion: reduce) {
  .tool-category-panel, .tool-category-chevron, .tool-card, .tool-card-arrow { transition: none; }
  .tool-card:hover { transform: none; }
}
```

- [ ] **Step 6: Run focused tests and commit**

Run: `npm.cmd test -- tests/tool-navigation-page.test.tsx tests/cross-page-shell.test.tsx`  
Expected: PASS, including 44px controls, compact-source assertions, one visible H1, and no shared editorial selector leakage.

```powershell
git add -- src/components/tool-navigation.css tests/tool-navigation-page.test.tsx
git commit -m "style: compact the tool collection layout"
```

### Task 6: Repair extracted-component regressions and preserve route/cursor contracts

**Files:**
- Modify: `tests/cross-page-shell.test.tsx`
- Modify: `tests/target-cursor.test.tsx`
- Verify: `tests/tool-navigation-route.test.tsx`
- Verify: `src/App.tsx`
- Verify: `src/components/FloatingHeader.tsx`

**Interfaces:**
- The existing route and loader behavior must remain unchanged.
- `ToolCard.tsx`, not `ToolNavigationPage.tsx`, becomes the production file that owns `data-target-cursor` for tools.

- [ ] **Step 1: Run the related regression tests to expose stale structural assertions**

Run: `npm.cmd test -- tests/cross-page-shell.test.tsx tests/target-cursor.test.tsx tests/tool-navigation-route.test.tsx`  
Expected: cross-page shell and target-cursor source-file assertions fail after component extraction; route tests should already pass.

- [ ] **Step 2: Update the shared-shell assertion to the new structure**

Replace the expectation for `role="navigation" name="工具分类"` with these checks:

```ts
expect(screen.getByRole('region', { name: '工具目录控制' })).toBeInTheDocument()
expect(screen.getByRole('button', { name: /我的常用/ })).toHaveAttribute('aria-expanded', 'true')
expect(main.querySelectorAll('.tool-card.editorial-surface').length).toBeGreaterThan(0)
```

Keep the existing `editorial-page`, `editorial-page-intro`, one-H1, and searchbox expectations.

- [ ] **Step 3: Point the target-cursor source contract at the extracted card**

```ts
for (const file of [
  'components/CardNav.tsx',
  'components/FeaturedNotes.tsx',
  'editorial/TiltedCard.tsx',
  'components/tool-navigation/ToolCard.tsx',
]) {
  expect(readFileSync(resolve(process.cwd(), 'src', file), 'utf8')).toContain('data-target-cursor')
}
```

Keep the negative checks for the header, hero, writing index, and work index unchanged.

- [ ] **Step 4: Run the full relevant regression slice and build**

Run: `npm.cmd test -- tests/tools-content.test.ts tests/tool-logo.test.tsx tests/tool-card.test.tsx tests/tool-category-accordion.test.tsx tests/tool-directory-toolbar.test.tsx tests/tool-navigation-page.test.tsx tests/cross-page-shell.test.tsx tests/target-cursor.test.tsx tests/tool-navigation-route.test.tsx tests/search-dialog.test.tsx`  
Expected: PASS with no React state-update, invalid `inert`, or duplicate-key warnings.

Run: `npm.cmd run build`  
Expected: TypeScript and Vite succeed; the existing heavy `#tools` route still lazy-loads.

- [ ] **Step 5: Commit regression repairs**

```powershell
git add -- tests/cross-page-shell.test.tsx tests/target-cursor.test.tsx
git commit -m "test: preserve tools route and cursor contracts"
```

### Task 7: Full local verification and handoff for user review

**Files:**
- Modify: `docs/project-log.md`

**Interfaces:**
- Produces a passing full suite/build and a dated local verification record.
- Does not push, publish, or write screenshots into the user-owned `output/` directory.

- [ ] **Step 1: Run complete automated verification**

Run: `npm.cmd test`  
Expected: all tests pass with no unhandled warnings.

Run: `npm.cmd run build`  
Expected: production build succeeds; record pre-existing bundle-size warnings without treating them as a functional failure.

- [ ] **Step 2: Start the local site and inspect all required viewports**

Run: `npm.cmd run dev -- --host 127.0.0.1`  
Expected: Vite prints a local URL. Use browser automation against `/#tools` at `1440×1000`, `1024×900`, and `390×844`, in dark and light themes.

At every viewport verify: the compact title stays above the fold; initial sections are exactly 我的常用 and 工具箱; independent and bulk accordion controls work; category counts are correct; all 59 reference names can be found through search; searching Ollama auto-opens AI 工具网站; clearing restores prior expansion state; an intentionally failed logo shows initials; no card exceeds the intended compact density; there is no horizontal overflow; and the last card clears the music dock.

On desktop verify tool-card hover/focus, external arrow, visible focus, and target cursor. On mobile verify one column, 44px controls, no hover-only information, and no target cursor. Confirm reduced-motion mode removes accordion/card transitions.

- [ ] **Step 3: Record exact local evidence**

Append a `2026-10-30` entry to `docs/project-log.md` listing: 68 unique destinations, 59 reference destinations, ten display sections, favicon fallback behavior, responsive viewports/themes, test count, build result, and the explicit note “本地待用户确认，未推送、未发布”. Do not include provider keys, copied reference assets, or temporary screenshot paths.

- [ ] **Step 4: Commit the verification record and show the local page**

```powershell
git add -- docs/project-log.md
git commit -m "docs: verify compact tool collection"
```

Leave the local development server available long enough for the user to review `/#tools`. Stop before any `git push` or deployment command.

## Plan Self-Review

- **Spec coverage:** Task 1 covers all 59 reference destinations, nine retained non-duplicate personal tools, ten display sections, deduplication, category mapping, search fields, metadata, and favorites derivation. Tasks 2–4 cover logo loading/fallback, compact cards, independent accordion behavior, bulk controls, search auto-open/restoration, empty state, safe links, and component boundaries. Task 5 covers WENHAO differentiation, deep/light themes, density, responsive states, bottom safety, and reduced motion. Tasks 6–7 cover existing route/navigation/cursor compatibility, automated regression, browser QA, and local-only handoff.
- **Placeholder scan:** No `TBD`, `TODO`, “implement later”, unspecified edge handling, or unnamed tests remain. All 59 reference names, destinations, categories, and exact short descriptions are included; every non-duplicate current tool has an explicit target category and preserves its existing record.
- **Type consistency:** `ToolCategoryId`, `ToolSectionId`, `ToolEntry`, `ToolCategory`, `ToolSection`, `toolEntries`, `toolCategories`, and `toolSections` originate in Task 1. `ToolLogo` and `ToolCard` consume the same category/entry types in Task 2. Accordion and page state use `ToolSectionId`; global search consumes primary `toolCategories`; featured duplicates never affect `countUniqueTools` or global search.
- **Scope:** The plan changes only the tools content/page/components/styles plus directly affected tests and the verification log. It does not alter routing, loader timing, CardNav, music, auth, commerce, guestbook, or publishing behavior.
