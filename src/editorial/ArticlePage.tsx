import { findArticle } from './articleDetails'
import type { ArticleBlock } from './types'
import './editorial-pages.css'

const renderBlock = (block: ArticleBlock, index: number) => {
  switch (block.type) {
    case 'heading': return <h2 key={index}>{block.text}</h2>
    case 'paragraph': return <p key={index}>{block.text}</p>
    case 'quote': return <blockquote key={index}>{block.text}</blockquote>
    case 'list': return <ul key={index}>{block.items.map((item) => <li key={item}>{item}</li>)}</ul>
    default: {
      const exhaustive: never = block
      return exhaustive
    }
  }
}

export function ArticlePage({ slug }: { slug: string }) {
  const article = findArticle(slug)
  if (!article) return <main className="editorial-page editorial-missing">
    <p className="editorial-eyebrow">FIELD NOTES / NOT FOUND</p>
    <h1>这篇文章还不存在</h1>
    <p>链接可能已经变化，或者这篇文章还没有发布。</p>
    <a className="editorial-return" href="#writing">返回文章索引</a>
  </main>

  return <main className="editorial-page editorial-article">
    <a className="editorial-back" href="#writing">← 返回文章索引</a>
    <header className="article-heading">
      <p className="editorial-eyebrow">FIELD NOTES / ESSAY</p>
      <h1>{article.title}</h1>
      <p className="article-excerpt">{article.excerpt}</p>
      <div className="article-meta"><time dateTime={article.date}>{article.date}</time><span>{article.readingMinutes} 分钟阅读</span></div>
      <ul className="editorial-tags" aria-label="文章主题">{article.tags.map((tag) => <li key={tag}>{tag}</li>)}</ul>
    </header>
    <article className="article-body">{article.body.map(renderBlock)}</article>
    <footer className="article-end"><a href="#writing">继续阅读其他文章 <span aria-hidden="true">↗</span></a></footer>
  </main>
}
