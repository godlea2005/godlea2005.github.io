import { projects } from '../content/site'

function ProjectArtwork({ visual }: { visual: string }) {
  if (visual === 'orbit') return <div className="artwork orbit-art"><i /><i /><i /><b>IDEA<br />TO<br />SYSTEM</b><span>01</span></div>
  if (visual === 'poster') return <div className="artwork poster-art"><i>01</i><b>MAKE<br />IT<br />CLEAR.</b><span /></div>
  return <div className="artwork terminal-art"><p>&gt; build experience<br />&gt; keep it human<br /><em>ready_</em></p><i /><span>03 / 03</span></div>
}

export function ProjectArchive() {
  return (
    <section className="archive-section frame" id="archive" aria-labelledby="archive-title">
      <div className="section-kicker"><span>03</span><p>PERSONAL CASES / ONGOING</p><i /></div>
      <div className="archive-title-row"><h2 id="archive-title">个人案例</h2><p>不是虚构的业绩数字，而是我如何处理内容、视觉与体验问题的实践切片。</p></div>
      <div className="archive-grid">{projects.map((project) => <article className="archive-item" key={project.number}><ProjectArtwork visual={project.visual} /><div className="archive-copy"><div><p>{project.type}</p><span>{project.number} / {project.state}</span></div><h3>{project.title}</h3><p>{project.summary}</p><ul>{project.tags.map((tag) => <li key={tag}>{tag}</li>)}</ul></div></article>)}</div>
    </section>
  )
}
