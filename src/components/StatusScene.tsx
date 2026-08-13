import { profile, site } from '../content/site'
import GradientWaves from './GradientWaves/GradientWaves'
import { ParticleText } from './ParticleText/ParticleText'

export function StatusScene() {
  return (
    <section className="status-scene" aria-labelledby="home-title">
      <div className="status-scene-background" aria-hidden="true">
        <GradientWaves
          horizonColor="#7656f6"
          waveColor="#ee4be9"
          crestColor="#ffffff"
          speed={0.55}
          amplitude={2.05}
          waveScale={0.6}
          waveRatio={0.9}
          swell={35}
          turbulence={20}
          tilt={1}
          zoom={1.0}
          height={6}
          fogDepth={18}
          detail="medium"
          brightness={1.0}
          opacity={1.0}
          mouseInteraction={true}
          parallaxStrength={0.5}
          grain={true}
          grainIntensity={0.05}
        />
      </div>
      <div className="status-scene-scrim" aria-hidden="true" />
      <div className="status-scene-inner frame">
        <div className="scene-copy">
          <p className="scene-index"><span>001</span> WENHAO'S DIGITAL SPACE <i>●</i></p>
          <p className="scene-roles">{profile.roles.join(' / ')}</p>
          <h1 id="home-title">
            <span className="scene-greeting">你好，我是{site.name}。</span>
            <ParticleText text={site.englishName} />
          </h1>
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
      </div>
    </section>
  )
}
