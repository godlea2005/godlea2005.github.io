import { profile, site } from '../content/site'

export function StatusScene() {
  return (
    <section className="status-scene frame" aria-labelledby="home-title">
      <div className="scene-copy">
        <p className="scene-index"><span>001</span> WENHAO'S DIGITAL SPACE <i>●</i></p>
        <p className="scene-roles">{profile.roles.join(' / ')}</p>
        <h1 id="home-title">你好，我是<br /><span>{site.name}。</span></h1>
        <p className="scene-statement">{profile.statement}</p>
        <a href="#archive" className="scene-link">进入作品档案 <span>↘</span></a>
      </div>
      <div className="scene-stage" aria-label="文昊的工作台抽象插画">
        <div className="stage-grid" />
        <div className="moon" />
        <div className="desk"><i /><i /><i /></div>
        <div className="person"><div className="person-head" /><div className="person-body" /><div className="person-arm" /></div>
        <div className="screen"><span>NOW<br />BUILDING</span><i /></div>
        <div className="stage-status"><span>STUDIO MODE</span><b>ONLINE</b></div>
        <div className="coordinates"><span>23° 08' N</span><span>113° 16' E</span></div>
      </div>
      <aside className="status-card"><p><span>✦</span>{profile.statusTitle}</p><div><i>“</i><span>{profile.status}</span></div><small>STATUS / {site.availability}</small></aside>
    </section>
  )
}
