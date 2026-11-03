import { describe, expect, it } from 'vitest'
import { articleSummaries, projectSummaries, visualNotes } from '../src/editorial/index'
import { findArticle } from '../src/editorial/articleDetails'
import { findProject } from '../src/editorial/projectDetails'

describe('editorial content', () => {
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

  it('keeps full article and project bodies out of the summary records', () => {
    for (const summary of articleSummaries) {
      expect(summary).not.toHaveProperty('body')
      expect(findArticle(summary.slug)).toMatchObject(summary)
    }
    for (const summary of projectSummaries) {
      expect(summary).not.toHaveProperty('challenge')
      expect(summary).not.toHaveProperty('process')
      expect(summary).not.toHaveProperty('outcome')
      expect(findProject(summary.slug)).toMatchObject(summary)
    }
  })

  it.each([
    ['ai-speeds-up-judgment', 'AI 不替代设计，它让判断更快抵达现场', ['先定义问题', '让模型扩大选择', '最后的判断仍属于人']],
    ['commerce-every-step-has-a-next-step', '电商内容的关键，是让每一步都有下一步', ['首图只负责第一步', '详情页建立连续理由', '平台语境决定顺序']],
    ['design-becomes-real-in-frontend', '把设计做进前端之后，细节才真正有了重量', ['静态稿没有最后一公里', '动效必须解释关系', '性能也是视觉的一部分']],
  ])('provides the approved title and complete sections for %s', (slug, title, headings) => {
    const article = findArticle(slug as string)
    expect(article?.title).toBe(title)
    expect(article?.featured).toBe(true)
    expect(article?.body.filter((block) => block.type === 'heading').map((block) => block.text)).toEqual(headings)
    expect(article?.body.filter((block) => block.type === 'paragraph').length).toBeGreaterThanOrEqual(3)
    for (const block of article?.body ?? []) {
      if (block.type === 'list') {
        expect(block.items.length).toBeGreaterThan(0)
        expect(block.items.every((item) => item.trim())).toBe(true)
      } else {
        expect(block.text.trim()).not.toBe('')
      }
    }
  })

  it('uses valid kebab-case slugs, dated notes and useful metadata', () => {
    for (const item of [...articleSummaries, ...projectSummaries]) {
      expect(item.slug).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
      expect(item.tags.length).toBeGreaterThan(0)
    }
    for (const item of [...articleSummaries, ...visualNotes]) {
      expect(item.date).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      expect(new Date(item.date).toISOString().slice(0, 10)).toBe(item.date)
    }
    expect(articleSummaries.every((item) => item.excerpt.trim() && item.readingMinutes > 0)).toBe(true)
    for (const summary of projectSummaries) {
      const project = findProject(summary.slug)
      expect(project?.role.trim()).toBeTruthy()
      expect(project?.period.trim()).toBeTruthy()
      expect(project?.challenge.trim()).toBeTruthy()
      expect(project?.process).toHaveLength(3)
      expect(project?.process.every((step) => step.trim())).toBe(true)
      expect(project?.outcome.trim()).toBeTruthy()
    }
  })

  it('declares the six agreed assets and reuses the first three as project covers', () => {
    expect(visualNotes.map((note) => note.image)).toEqual([
      '/images/field-notes/signal-desk.webp',
      '/images/field-notes/paper-systems.webp',
      '/images/field-notes/night-interface.webp',
      '/images/field-notes/prototype-hands.webp',
      '/images/field-notes/material-study.webp',
      '/images/field-notes/quiet-window.webp',
    ])
    expect(visualNotes.map((note) => note.ratio)).toEqual(['landscape', 'portrait', 'square', 'landscape', 'portrait', 'square'])
    expect(new Set(visualNotes.map((note) => note.id)).size).toBe(6)
    expect(visualNotes.every((note) => /[\u4e00-\u9fff]/.test(note.alt) && note.caption.trim())).toBe(true)
    expect(projectSummaries.map((project) => project.title)).toEqual(['内容增长实验室', '品牌的第一次相遇', '有呼吸感的页面'])
    expect(projectSummaries.map((project) => project.cover)).toEqual(visualNotes.slice(0, 3).map((note) => note.image))
    expect(projectSummaries.every((project) => project.coverAlt.trim())).toBe(true)
  })

  it('returns undefined for unknown and non-exact detail slugs', () => {
    for (const slug of ['missing', '', 'constructor', 'toString', 'AI-speeds-up-judgment', 'ai-speeds-up-judgment/']) {
      expect(findArticle(slug)).toBeUndefined()
      expect(findProject(slug)).toBeUndefined()
    }
  })
})
