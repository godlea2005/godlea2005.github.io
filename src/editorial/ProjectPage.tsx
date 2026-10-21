import { findProject } from './projectDetails'
import './editorial-pages.css'

export function ProjectPage({ slug }: { slug: string }) {
  const project = findProject(slug)
  if (!project) return <main className="editorial-page editorial-missing">
    <p className="editorial-eyebrow">FIELD NOTES / NOT FOUND</p>
    <h1>这个项目还不存在</h1>
    <p>链接可能已经变化，或者这个项目还没有公开。</p>
    <a className="editorial-return" href="#work">返回作品索引</a>
  </main>

  return <main className="editorial-page editorial-project">
    <a className="editorial-back" href="#work">← 返回项目索引</a>
    <header className="project-heading">
      <p className="editorial-eyebrow">FIELD NOTES / PROJECT</p>
      <p className="project-disclosure">个人实验 <span>非客户委托项目</span></p>
      <h1>{project.title}</h1>
      <p className="project-summary">{project.summary}</p>
      <div className="project-meta"><span>{project.role}</span><span>{project.period}</span></div>
      <ul className="editorial-tags" aria-label="项目主题">{project.tags.map((tag) => <li key={tag}>{tag}</li>)}</ul>
    </header>
    <figure className="project-cover"><img src={project.cover} alt={project.coverAlt} /></figure>
    <div className="project-body">
      <section aria-labelledby="project-challenge"><p className="editorial-eyebrow">01 / CONTEXT</p><h2 id="project-challenge">挑战</h2><p>{project.challenge}</p></section>
      <section aria-labelledby="project-process"><p className="editorial-eyebrow">02 / PROCESS</p><h2 id="project-process">过程</h2><ol>{project.process.map((step, index) => <li key={step}><span aria-hidden="true">0{index + 1}</span>{step}</li>)}</ol></section>
      <section aria-labelledby="project-outcome"><p className="editorial-eyebrow">03 / OUTCOME</p><h2 id="project-outcome">结果</h2><p>{project.outcome}</p></section>
    </div>
    <footer className="article-end"><a href="#work">继续浏览其他项目 <span aria-hidden="true">↗</span></a></footer>
  </main>
}
