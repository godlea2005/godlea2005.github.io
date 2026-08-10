import { projects, skills } from '../content/site'

export function StudioMap() {
  return (
    <section className="map-section frame" aria-labelledby="map-title">
      <div className="section-kicker"><span>01</span><p>CONTEXT MAP</p><i /></div>
      <div className="map-heading"><div><h2 id="map-title">这里，正在慢慢长出<br />一些有用的东西。</h2></div><p>作品是结果，过程同样重要。这里记录我如何把策略、视觉和代码放进同一个工作台。</p></div>
      <div className="map-grid">
        <article className="map-card archive-card"><p>ARCHIVE</p><h3>作品档案</h3><strong>{projects.length}<span>个持续整理的项目</span></strong><a href="#archive">打开档案 <i>↗</i></a></article>
        <article className="map-card practice-card"><p>PROCESS</p><h3>实践路径</h3><div className="path-line"><span>发现</span><i /><span>构建</span><i /><span>落地</span></div><small>让每个想法都走到可以被验证的位置。</small></article>
        <article className="map-card tags-card"><p>SIGNALS</p><h3>能力标签</h3><div>{skills.map((skill) => <span key={skill}>#{skill}</span>)}</div></article>
      </div>
    </section>
  )
}
