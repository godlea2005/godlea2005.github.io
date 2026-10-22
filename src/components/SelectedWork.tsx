import { projectSummaries } from '../editorial'
import { TiltedCard } from '../editorial/TiltedCard'

export function SelectedWork() {
  return <section className="selected-work-section" aria-labelledby="selected-work-heading">
    <header className="selected-work-heading">
      <p className="selected-work-eyebrow">FIELD NOTES / SELECTED WORK</p>
      <h2 id="selected-work-heading">精选实践</h2>
      <p>三个仍在迭代中的个人实验，记录问题、方法与正在形成的答案。</p>
    </header>
    <ul className="selected-work-grid" aria-label="精选个人实验">
      {projectSummaries.map((project) => <li key={project.slug}>
        <TiltedCard className="selected-work-link" href={`#project/${project.slug}`} label={project.title}>
          <article className="selected-work-card">
            <img src={project.cover} alt={project.coverAlt} loading="lazy" decoding="async" />
            <div className="selected-work-copy">
              <p className="selected-work-meta"><span>{project.period}</span><span>个人实验</span></p>
              <h3>{project.title}</h3>
              <p className="selected-work-role">{project.role}</p>
              <p className="selected-work-summary">{project.summary}</p>
              <ul className="selected-work-tags" aria-label={`${project.title}主题`}>
                {project.tags.map((tag) => <li key={tag}>{tag}</li>)}
              </ul>
              <span className="selected-work-open">查看案例 <span aria-hidden="true">↗</span></span>
            </div>
          </article>
        </TiltedCard>
      </li>)}
    </ul>
  </section>
}
