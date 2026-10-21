import { projectSummaries } from './index'
import './editorial-pages.css'

export function WorkIndexPage() {
  return <main className="editorial-page editorial-index work-index">
    <header className="editorial-heading">
      <p className="editorial-eyebrow">FIELD NOTES / SELECTED WORK</p>
      <h1>项目与实验</h1>
      <p>把问题、过程与结果放在一起，呈现仍在迭代中的实践。</p>
    </header>
    <ul className="project-grid" aria-label="项目列表">
      {projectSummaries.map((project) => <li key={project.slug}>
        <article className="project-card">
          <a href={`#project/${project.slug}`} aria-label={`查看项目：${project.title}`}>
            <img src={project.cover} alt={project.coverAlt} loading="lazy" />
            <div className="project-card-copy">
              <p className="project-card-meta"><span>{project.period}</span><span>个人实验</span></p>
              <h2>{project.title}</h2>
              <p>{project.summary}</p>
              <ul className="editorial-tags" aria-label="项目主题">{project.tags.map((tag) => <li key={tag}>{tag}</li>)}</ul>
              <span className="project-open">查看项目 <span aria-hidden="true">↗</span></span>
            </div>
          </a>
        </article>
      </li>)}
    </ul>
  </main>
}
