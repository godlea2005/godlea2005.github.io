import { useEffect, useMemo, useState } from 'react'
import { articleSummaries } from './index'
import { guideCategories, guideTags } from '../components/home-guide/model'
import './editorial-pages.css'

export function WritingIndexPage() {
  const readFilter = () => {
    const params = new URLSearchParams(window.location.hash.split('?')[1])
    return params.get('category') ?? params.get('tag')
  }
  const [selectedTag, setSelectedTag] = useState<string | null>(readFilter)
  const tags = [...new Set([...guideCategories.map(category => category.name), ...guideTags])]
  useEffect(() => { const sync = () => setSelectedTag(readFilter()); window.addEventListener('hashchange', sync); return () => window.removeEventListener('hashchange', sync) }, [])
  const articles = useMemo(
    () => {
      const chronological = [...articleSummaries].sort((a, b) => b.date.localeCompare(a.date))
      return selectedTag === '设计实践'
        ? chronological.filter((article) => !article.tags.includes('电商内容'))
        : selectedTag ? chronological.filter((article) => article.tags.includes(selectedTag)) : chronological
    },
    [selectedTag],
  )

  return <main className="editorial-reading-page editorial-index" id="writing-index">
    <header className="editorial-heading">
      <p className="editorial-eyebrow">FIELD NOTES / WRITING</p>
      <h1>文章与笔记</h1>
      <p>记录设计、内容与技术实践里的观察、判断和可复用方法。</p>
    </header>
    <div className="editorial-filter" aria-label="按主题筛选文章">
      <button type="button" aria-pressed={selectedTag === null} onClick={() => setSelectedTag(null)}>全部文章</button>
      {tags.map((tag) => <button type="button" key={tag} aria-pressed={selectedTag === tag} onClick={() => setSelectedTag(tag)}>{tag}</button>)}
    </div>
    <ul className="writing-list" aria-label="文章列表">
      {articles.map((article) => <li key={article.slug}>
        <article className="writing-card">
          <div className="writing-card-meta">
            <time dateTime={article.date}>{article.date}</time>
            <span>{article.readingMinutes} 分钟阅读</span>
          </div>
          <h2><a href={`#article/${article.slug}`}>{article.title}</a></h2>
          <p>{article.excerpt}</p>
          <ul className="editorial-tags" aria-label="文章主题">
            {article.tags.map((tag) => <li key={tag}>{tag}</li>)}
          </ul>
        </article>
      </li>)}
    </ul>
  </main>
}
