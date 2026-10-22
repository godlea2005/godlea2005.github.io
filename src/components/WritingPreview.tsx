import { articleSummaries } from '../editorial'

export function WritingPreview() {
  const recentArticles = [...articleSummaries]
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 6)

  return <section className="writing-preview-section frame" id="writing-preview" aria-labelledby="writing-preview-title">
    <div className="home-section-header">
      <div>
        <p className="home-section-eyebrow">FIELD NOTES / 05 — WRITING</p>
        <h2 id="writing-preview-title">最近写下的<span aria-hidden="true">.</span></h2>
      </div>
      <p>给那些还在形成中的思考，一个可以继续回看的位置。</p>
    </div>
    <ol className="writing-preview-list">
      {recentArticles.map((article, index) => <li key={article.slug} data-article-date={article.date}>
        <span className="writing-preview-number">{String(index + 1).padStart(2, '0')}</span>
        <time dateTime={article.date}>{article.date}</time>
        <h3><a href={`#article/${article.slug}`}>{article.title}</a></h3>
        <span className="writing-preview-tag">{article.tags[0]}</span>
        <span className="writing-preview-arrow" aria-hidden="true">↗</span>
      </li>)}
    </ol>
    <a className="writing-preview-more" href="#writing">查看全部文章 <span aria-hidden="true">↗</span></a>
  </section>
}
