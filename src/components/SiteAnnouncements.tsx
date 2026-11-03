import { announcements } from '../content/announcements'
import { ModalSurface } from './ModalSurface'
import { SiteIcon } from './SiteIcon'
import './site-settings.css'

export function SiteAnnouncements({ onClose }: { onClose: () => void }) {
  return <ModalSurface className="announcement-layer" panelClassName="announcement-panel" label="公告" onClose={onClose}>
    <header><h2><SiteIcon name="bell" />公告</h2><button type="button" data-modal-focus onClick={onClose} aria-label="关闭公告">×</button></header>
    <div className="announcement-list">{announcements.map(item => <article key={item.id}><div><span>{item.label}</span><h3>{item.title}</h3><time dateTime={item.date}>{item.date}</time></div><p>{item.body}</p>{'href' in item && <a href={item.href} onClick={onClose}>{item.link} ↗</a>}</article>)}</div>
    <footer><button type="button" onClick={onClose}>我知道了</button></footer>
  </ModalSurface>
}
