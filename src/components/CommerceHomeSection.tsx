import { commerceHome } from '../content/site'

const workflow = ['理解产品', '判断市场', '组织画面']

export function CommerceHomeSection() {
  return <section className="commerce-home" aria-labelledby="commerce-home-title">
    <div className="commerce-home-inner frame">
      <div className="commerce-home-intro">
        <p className="home-section-eyebrow">FIELD NOTES / 03 — COMMERCE LAB</p>
        <h2 id="commerce-home-title">AI 电商实验室<span aria-hidden="true">.</span></h2>
        <p>把产品事实和平台语境放在画面之前。这里记录一套仍在实践中的电商视觉工作流。</p>
        <a href="#ai-commerce">进入 AI 电商实验室 <span aria-hidden="true">↗</span></a>
      </div>
      <div className="commerce-home-system">
        <p className="commerce-home-label">从资料到表达</p>
        <ol className="commerce-home-workflow">
          {workflow.map((verb, index) => <li key={verb}><span>0{index + 1}</span>{verb}</li>)}
        </ol>
        <p className="commerce-home-label">平台语境</p>
        <ul className="commerce-home-platforms">
          {commerceHome.platforms.map((platform) => <li key={platform.name}>{platform.name}</li>)}
        </ul>
      </div>
    </div>
  </section>
}
