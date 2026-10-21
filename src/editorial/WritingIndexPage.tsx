import { useMemo, useState } from 'react'
import { articleSummaries } from './index'
import './editorial-pages.css'

export function WritingIndexPage() {
  const [selectedTag, setSelectedTag] = useState<string | null>(null)
  const tags = ['设计实践', '电商内容']
  const articles = useMemo(
    () => selectedTag === '设计实践'
      ? articleSummaries.filter((article) => !article.tags.includes('电商内容'))
      : selectedTag ? articleSummaries.filter((article) => article.tags.includes(selectedTag)) : articleSummaries,
    [selectedTag],
  )

  return <main className="editorial-page editorial-index" id="writing-index">
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
