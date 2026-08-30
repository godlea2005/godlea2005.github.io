import { useEffect, useState } from 'react'
import { commerceHome, profile, site } from '../content/site'
import GradientWaves from './GradientWaves/GradientWaves'
import { ParticleText } from './ParticleText/ParticleText'

export function StatusScene() {
  const [reducedMotion, setReducedMotion] = useState(false)

  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)')
    const syncPreference = () => setReducedMotion(media.matches)
    syncPreference()
    media.addEventListener('change', syncPreference)
    return () => media.removeEventListener('change', syncPreference)
  }, [])

  return (
    <section className="status-scene" aria-labelledby="home-title">
      <div className="status-scene-background" aria-hidden="true">
        <GradientWaves
          horizonColor="#7656f6"
          waveColor="#ee4be9"
          crestColor="#ffffff"
          speed={reducedMotion ? 0 : 0.55}
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
          mouseInteraction={!reducedMotion}
          parallaxStrength={0.5}
          grain={true}
          grainIntensity={0.05}
        />
      </div>
      <div className="status-scene-scrim" aria-hidden="true" />
      <div className="status-scene-inner frame">
        <div className="scene-copy">
          <p className="scene-index"><span>001</span> AI COMMERCE DESIGN STUDIO <i>●</i></p>
          <h1 id="home-title"><span>AI 电商视觉，</span><span>先把策略想清楚。</span></h1>
          <p className="scene-statement">{commerceHome.description}</p>
          <div className="scene-actions">
            <a href="#ai-commerce" className="scene-primary">免费分析一个产品 <span aria-hidden="true">↘</span></a>
            <a href="#commerce-examples" className="scene-secondary">查看示例方案 <span aria-hidden="true">↓</span></a>
          </div>
          <div className="scene-author">
            <span>DESIGNED &amp; OPERATED BY</span>
            <strong>{site.name}</strong>
            <p>{profile.roles.join(' / ')}</p>
          </div>
        </div>
        <div className="scene-stage" aria-label="AI 电商视觉策略工作台示意">
          <div className="stage-grid" />
          <div className="stage-status"><span>MARKET VISUAL SYSTEM / 01</span><b>READY</b></div>
          <div className="stage-platforms" aria-hidden="true"><span>OZON</span><span>WB</span><span>DY</span><span>TMALL</span></div>
          <div className="stage-product" aria-hidden="true"><i /><i /><i /><b>PRODUCT<br />SIGNAL</b></div>
          <ol className="stage-output">
            <li><span>01</span><b>HERO DIRECTION</b><i>主图策略</i></li>
            <li><span>02</span><b>DETAIL STORYBOARD</b><i>详情分镜</i></li>
            <li><span>03</span><b>IMAGE PROMPT</b><i>作图提示词</i></li>
          </ol>
          <div className="scene-signature"><small>AUTHOR SIGNAL</small><ParticleText text={site.englishName} /></div>
          <div className="coordinates"><span>STRATEGY → VISUAL</span><span>CN / RU</span></div>
        </div>
        <aside className="status-card"><p><span>✦</span>{profile.statusTitle}</p><div><i>“</i><span>{profile.status}</span></div><small>STATUS / {site.availability}</small></aside>
      </div>
    </section>
  )
}
