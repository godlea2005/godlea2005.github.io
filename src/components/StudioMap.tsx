import { projects, skills } from '../content/site'

export function StudioMap() {
  return (
    <section className="map-section frame" id="studio-map" aria-labelledby="map-title">
      <div className="section-kicker"><span>02</span><p>AUTHOR / CAPABILITY EVIDENCE</p><i /></div>
      <div className="map-heading"><div><h2 id="map-title">从策略，到画面，<br />再到可运行的页面。</h2></div><p>我是文昊，身份横跨 AI 设计、电商运营与前端开发。工具背后的判断，也来自这三种工作视角的交叉。</p></div>
      <div className="map-grid">
        <article className="map-card archive-card"><p>SELECTED PRACTICE</p><h3>个人案例</h3><strong>{projects.length}<span>个持续整理的实践</span></strong><a href="#archive">查看能力证据 <i>↗</i></a></article>
        <article className="map-card practice-card"><p>WORKING METHOD</p><h3>策略不是装饰</h3><div className="path-line"><span>洞察</span><i /><span>视觉</span><i /><span>实现</span></div><small>让每一个画面都有信息任务，也让每一个想法走到可验证的位置。</small></article>
        <article className="map-card tags-card"><p>OPERATING RANGE</p><h3>复合能力</h3><div>{skills.map((skill) => <span key={skill}>#{skill}</span>)}</div></article>
      </div>
    </section>
  )
}
