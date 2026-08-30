import { commerceHome } from '../content/site'

export function CommerceHomeSection() {
  return (
    <section className="commerce-home" aria-labelledby="commerce-home-title">
      <div className="commerce-home-capabilities frame">
        <div className="section-kicker"><span>01</span><p>AI COMMERCE WORKFLOW</p><i /></div>
        <div className="commerce-home-heading">
          <h2 id="commerce-home-title">不是先给一张图，<br />而是先确定为什么这样做。</h2>
          <p>同一个产品，在不同市场里需要不同的注意力顺序。工作台先梳理平台语境、用户顾虑与视觉重点，再把判断翻译成可执行画面。</p>
        </div>

        <div className="platform-ledger" aria-label="支持平台">
          {commerceHome.platforms.map((platform, index) => (
            <article key={platform.name}>
              <span>0{index + 1}</span>
              <div><small>{platform.market}</small><h3>{platform.name}</h3></div>
              <p>{platform.focus}</p>
            </article>
          ))}
        </div>

        <ol className="commerce-steps" aria-label="使用流程">
          {commerceHome.steps.map((step) => (
            <li key={step.number}>
              <span>{step.number}</span>
              <div><h3>{step.title}</h3><p>{step.detail}</p></div>
            </li>
          ))}
        </ol>
      </div>

      <div className="commerce-demo" id="commerce-examples">
        <div className="commerce-demo-inner frame">
          <header className="commerce-demo-header">
            <div><span>演示案例</span><small>DEMO OUTPUT / NOT CLIENT WORK</small></div>
            <p>{commerceHome.demo.product}</p>
          </header>

          <div className="commerce-demo-layout">
            <section className="demo-direction" aria-labelledby="demo-direction-title">
              <p>01 / HERO</p>
              <h3 id="demo-direction-title">主图方向</h3>
              <div className="demo-product-visual" aria-hidden="true"><i /><i /><b>TRAVEL<br />READY</b><span>20s</span></div>
              <p>{commerceHome.demo.direction}</p>
            </section>

            <section className="demo-storyboard" aria-labelledby="demo-storyboard-title">
              <p>02 / DETAIL</p>
              <h3 id="demo-storyboard-title">详情页分镜</h3>
              <ol>{commerceHome.demo.storyboard.map((shot, index) => <li key={shot}><span>0{index + 1}</span><p>{shot}</p></li>)}</ol>
            </section>

            <section className="demo-prompt" aria-labelledby="demo-prompt-title">
              <p>03 / PROMPT</p>
              <h3 id="demo-prompt-title">作图提示词</h3>
              <blockquote>{commerceHome.demo.prompt}</blockquote>
              <a href="#ai-commerce">进入 AI 电商工作台 <span aria-hidden="true">↗</span></a>
            </section>
          </div>
        </div>
      </div>
    </section>
  )
}
