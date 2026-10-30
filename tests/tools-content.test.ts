import { expect, it } from 'vitest'
import {
  countUniqueTools,
  filterToolCategories,
  toolCategoryOptions,
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

it('uses unique stable IDs and source-derived primary and featured records', () => {
  expect(new Set(toolEntries.map(({ id }) => id)).size).toBe(68)
  expect(toolEntries.find(({ name }) => name === 'Are.na')?.id).toBe('are-na')
  expect(toolEntries.find(({ id }) => id === 'ai-arena')?.name).toBe('能力排行榜 | AI Arena')
  expect(toolCategories.flatMap(({ tools }) => tools)).toHaveLength(68)
  for (const section of toolSections) {
    for (const tool of section.tools) {
      const source = toolEntries.find(({ id }) => id === tool.id)!
      expect(tool).toMatchObject(source)
      if (section.id === 'featured') expect(tool).toBe(source)
    }
  }
  expect(toolSections[0].tools.map(({ name }) => name)).toEqual([
    'ChatGPT', 'Midjourney', 'Ozon', 'Wildberries', 'Photopea',
    'Unsplash', 'GitHub', 'Vercel', 'Are.na', 'Readwise Reader',
  ])
  expect(toolEntries.every(({ href, host, logoHost, id }) =>
    host === new URL(href).hostname && logoHost === (id === 'stardots' ? 'stardots.io' : host),
  )).toBe(true)
})

it('normalizes destination identity without losing query or path distinctions', () => {
  expect(normalizeToolHref('https://EXAMPLE.com/path/#fragment')).toBe('https://example.com/path')
  expect(normalizeToolHref('https://EXAMPLE.com/#fragment')).toBe('https://example.com/')
  expect(normalizeToolHref('https://example.com/path/?lang=zh#fragment')).toBe('https://example.com/path?lang=zh')
  expect(normalizeToolHref('https://example.com/a')).not.toBe(normalizeToolHref('https://example.com/b'))
})

it('searches every supported field, preserves metadata, and removes empty sections', () => {
  expect(filterToolSections(toolSections, '   ')).toBe(toolSections)
  for (const query of ['ChatGPT', 'CHATGPT.COM', '头脑风暴', '梳理方向', '写作']) {
    expect(filterToolSections(toolSections, query).flatMap(({ tools }) => tools).some(({ id }) => id === 'chatgpt')).toBe(true)
  }
  const result = filterToolSections(toolSections, '网络测试、图片处理与日常实用工具。')
  expect(result).toHaveLength(1)
  expect(result[0]).toMatchObject({ id: 'toolbox', number: '01', title: '工具箱' })
  expect(result[0].tools).toHaveLength(11)
  expect(filterToolSections(toolSections, 'no-such-tool-123')).toEqual([])
  expect(toolEntries).toHaveLength(68)
})

it('temporarily derives the old page view from the personal entries', () => {
  const view = filterToolCategories(toolCategories, { query: '', category: 'all' })
  expect(view.flatMap(({ tools }) => tools).map(({ id }) => id))
    .toEqual(toolSections[0].tools.map(({ id }) => id))
  expect(view.flatMap(({ tools }) => tools).every(({ mark, note }) => mark.trim() && note.trim())).toBe(true)
  expect(toolCategoryOptions.map(({ label }) => label)).toContain('AI 创作')
  expect(filterToolCategories(toolCategories, { query: 'Ozon', category: 'cross-border' })[0].tools[0].href)
    .toBe('https://seller.ozon.ru/')
})
