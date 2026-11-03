import { articleSummaries, type ArticleSummary } from '../editorial'

const featuredArticles = articleSummaries.filter((article) => article.featured).slice(0, 3)

function FeaturedCard({ article, lead = false }: { article: ArticleSummary; lead?: boolean }) {
  return <article className={`featured-note${lead ? ' featured-note-lead' : ''}`}>
    <a
      className="featured-note-link"
      href={`#article/${article.slug}`}
      data-target-cursor=""
      data-cursor-label="阅读全文"
    >
      <div className="featured-note-topline">
        <time dateTime={article.date}>{article.date}</time>
        <span>{article.readingMinutes} 分钟阅读</span>
      </div>
      <h3>{article.title}</h3>
      <p className="featured-note-excerpt">{article.excerpt}</p>
      <div className="featured-note-bottomline">
        <ul aria-label="文章标签">{article.tags.map((tag) => <li key={tag}>{tag}</li>)}</ul>
        <span className="featured-note-arrow" aria-hidden="true">↗</span>
      </div>
    </a>
  </article>
}

export function FeaturedNotes() {
  const [lead, ...secondary] = featuredArticles

  return <section className="featured-notes-section frame" id="featured" aria-labelledby="featured-title">
    <div className="home-section-header">
      <div>
        <p className="home-section-eyebrow">FIELD NOTES / 01 — FEATURED</p>
        <h2 id="featured-title">本期精选<span aria-hidden="true">.</span></h2>
      </div>
      <p>从正在做的事出发，记录设计、商业与代码交汇时的判断。</p>
    </div>
    <div className="featured-notes-layout">
      {lead && <FeaturedCard article={lead} lead />}
      <div className="featured-notes-secondary">
        {secondary.map((article) => <FeaturedCard key={article.slug} article={article} />)}
      </div>
    </div>
  </section>
}
