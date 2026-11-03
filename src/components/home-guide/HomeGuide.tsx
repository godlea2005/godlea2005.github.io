import { useEffect, useRef, useState } from 'react'
import { articleSummaries, visualNotes } from '../../editorial'
import { toolEntries } from '../../content/tools'
import { useMotionProfile } from '../../lib/useMotionProfile'
import { ArchiveArt, ContactArt, IndexArt } from './GuideArt'
import { GuideIndex } from './GuideIndex'
import { useGuideLayout } from './useGuideLayout'
import { guideCategories, guideTags, recentArticles } from './model'
import './home-guide.css'

type GuideId = 'stats' | 'posts' | 'index' | 'contact'
const cards = [
  { id: 'stats', title: '站点数据', detail: '这里的积累，都有迹可循。', number: '01' },
  { id: 'posts', title: '博客文章', detail: '最近的记录，与正在发生的思考。', number: '02' },
  { id: 'index', title: '内容索引', detail: '沿着一个主题，发现更多线索。', number: '03' },
  { id: 'contact', title: '订阅与联系', detail: '不必匆忙，留句话再走。', number: '04' },
] as const
const metrics = [{ label: '文章', value: `${articleSummaries.length} 篇` }, { label: '分类', value: `${guideCategories.length} 类` }, { label: '标签', value: `${guideTags.length} 个` }, { label: '收藏工具', value: `${toolEntries.length} 个` }]

export function HomeGuide() {
  const [active, setActive] = useState<GuideId | null>(() => window.location.hash === '#about' ? 'contact' : null)
  const [deck, setDeck] = useState({ slide: 0, from: null as number | null, direction: 1 })
  const { slide } = deck
  const [metric, setMetric] = useState(0)
  const [hovered, setHovered] = useState(false)
  const [focusWithin, setFocusWithin] = useState(false)
  const paused = hovered || focusWithin
  const [visible, setVisible] = useState(false)
  const root = useRef<HTMLElement>(null)
  const swipe = useRef<{ x: number; y: number } | null>(null)
  const swiped = useRef(false)
  const { reducedMotion, pageVisible } = useMotionProfile()
  const { grid, capture } = useGuideLayout(active, !reducedMotion && pageVisible)
  const selectCard = (id: GuideId | null) => { capture(); setActive(id) }
  const nextSlide = (direction: number) => setDeck(current => ({ slide: (current.slide + direction + recentArticles.length) % Math.max(1, recentArticles.length), from: reducedMotion ? null : current.slide, direction }))
  useEffect(() => {
    if (reducedMotion) setDeck(current => current.from === null ? current : { ...current, from: null })
  }, [reducedMotion])
  useEffect(() => {
    const sync = () => { if (window.location.hash === '#about') selectCard('contact') }
    window.addEventListener('hashchange', sync)
    return () => window.removeEventListener('hashchange', sync)
  }, [])
  useEffect(() => {
    if (!root.current || typeof IntersectionObserver !== 'function') { setVisible(true); return }
    const observer = new IntersectionObserver(entries => setVisible(entries.some(entry => entry.isIntersecting)))
    observer.observe(root.current)
    return () => observer.disconnect()
  }, [])
  useEffect(() => {
    if (reducedMotion || !pageVisible || !visible || paused || active || recentArticles.length < 2) return
    const timer = window.setInterval(() => { nextSlide(1); setMetric(current => (current + 1) % metrics.length) }, 4300)
    return () => window.clearInterval(timer)
  }, [reducedMotion, pageVisible, visible, paused, active])

  return <section id="home-guide" className="home-guide-section frame" aria-labelledby="home-guide-title" ref={root} data-running={visible && pageVisible}>
    <div className="home-guide-heading"><p>THE SHORT WAY IN</p><h2 id="home-guide-title">随处看看<span>，</span></h2><span>一些记录，一点好奇。</span></div>
    <div className={`home-guide-grid${active ? ' has-active' : ''}`} ref={grid} onClick={event => { if (event.target === event.currentTarget) selectCard(null) }}>
      {cards.map(card => {
        const open = active === card.id
        return <article id={card.id === 'contact' ? 'about' : `guide-${card.id}`} key={card.id} className={`home-guide-card guide-${card.id}${open ? ' is-open' : ''}`} onClick={event => { if (!(event.target as Element).closest('button,a,.guide-card-detail,.guide-post-stage')) selectCard(open ? null : card.id) }}>
          <div className="guide-art-stage" aria-hidden={card.id !== 'posts'}>
            {card.id === 'stats' && <><ArchiveArt expanded={open} selected={metric} onSelect={setMetric} /><span className="guide-art-readout" key={metric}><small>{metrics[metric].label}</small><b>{metrics[metric].value}</b></span></>}
            {card.id === 'index' && <IndexArt expanded={open} />}
            {card.id === 'contact' && <ContactArt />}
            {card.id === 'posts' && <div className="guide-post-stage" onPointerEnter={() => setHovered(true)} onPointerLeave={() => { setHovered(false); swipe.current = null }} onFocus={() => setFocusWithin(true)} onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setFocusWithin(false) }}
              onPointerDown={event => { swiped.current = false; if (event.button === 0) swipe.current = { x: event.clientX, y: event.clientY } }}
              onPointerCancel={() => { swipe.current = null }}
              onPointerUp={event => { const start = swipe.current; swipe.current = null; if (start && Math.abs(event.clientX - start.x) > 50 && Math.abs(event.clientX - start.x) > Math.abs(event.clientY - start.y)) { swiped.current = true; nextSlide(event.clientX < start.x ? 1 : -1) } }}
              onClick={event => { if (!(event.target as Element).closest('button') && !swiped.current) selectCard(open ? null : 'posts'); swiped.current = false }} data-direction={deck.direction}>
              {recentArticles.map((article, index) => <div className={`guide-post-cover${index === slide ? ' is-front' : ''}${!reducedMotion && index === deck.from ? ' is-leaving' : ''}`} key={article.slug} data-depth={(index - slide + recentArticles.length) % recentArticles.length} aria-hidden={index !== slide} onAnimationEnd={() => setDeck(current => current.from === index ? { ...current, from: null } : current)}>
                <img src={visualNotes[index % visualNotes.length]?.image} alt="" loading="lazy" onError={event => { event.currentTarget.style.visibility = 'hidden' }} />
                <div><small>{article.tags[0]} · {article.date}</small><strong>{article.title}</strong></div>
              </div>)}
              {!recentArticles.length && <p>新的记录正在酝酿。</p>}
              <div className="guide-post-controls"><button type="button" aria-label="上一篇预览" onClick={() => nextSlide(-1)}>←</button><span>{recentArticles.length ? slide + 1 : 0} / {recentArticles.length}</span><button type="button" aria-label="下一篇预览" onClick={() => nextSlide(1)}>→</button></div>
            </div>}
          </div>
          <button className="guide-card-trigger" type="button" aria-label={`${open ? '收起' : '展开'}${card.title}`} aria-expanded={open} aria-controls={`guide-panel-${card.id}`} onClick={() => selectCard(open ? null : card.id)}>
            <span><small>{card.number} / EXPLORE</small><strong>{card.title}</strong><span>{card.detail}</span></span><i aria-hidden="true">{open ? '−' : '↗'}</i>
          </button>
          <div className="guide-card-detail" id={`guide-panel-${card.id}`} inert={!open} aria-hidden={!open}>
            {card.id === 'stats' && <><p className="guide-detail-intro">慢慢积累，认真记录。</p><dl className="guide-metrics">{metrics.map((item, index) => <div key={item.label} data-selected={metric === index}><dt>{item.label}</dt><dd>{item.value}</dd><button type="button" aria-label={`突出${item.label}：${item.value}`} aria-pressed={metric === index} onPointerEnter={() => setMetric(index)} onFocus={() => setMetric(index)} onClick={() => setMetric(index)} /></div>)}</dl><p className="guide-footnote">内容统计来自本站实际收录，不含访客追踪。</p></>}
            {card.id === 'posts' && <><div className="guide-article-list">{recentArticles.map(article => <a href={`#article/${article.slug}`} key={article.slug}><time>{article.date}</time><strong>{article.title}</strong><span>{article.readingMinutes} 分钟阅读 ↗</span></a>)}</div><a className="guide-text-link" href="#writing">全部文章 ↗</a></>}
            {card.id === 'index' && <GuideIndex />}
            {card.id === 'contact' && <><p className="guide-detail-intro">关于 AI、设计，或者今天发生的小事。</p><div className="guide-contact-links"><a href="#guestbook"><span>↗</span><strong>站内留言</strong><small>聊想法，交流近况</small></a><a href="#writing"><span>⌘</span><strong>文章更新</strong><small>回来看看最近的记录</small></a></div><p className="guide-footnote">更多联系与订阅方式，确认后再放进这里。</p></>}
            <button className="guide-close" type="button" onClick={() => { selectCard(null); document.querySelector<HTMLButtonElement>(`#${card.id === 'contact' ? 'about' : `guide-${card.id}`} .guide-card-trigger`)?.focus({ preventScroll: true }) }}>收起内容 ↑</button>
          </div>
        </article>
      })}
    </div>
  </section>
}
