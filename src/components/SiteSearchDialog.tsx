import { useEffect, useMemo, useState } from 'react'
import { buildSiteSearchEntries, searchSite } from '../editorial/search'
import { ModalSurface } from './ModalSurface'
import './site-search-dialog.css'

export type SiteSearchDialogProps = {
  open: boolean
  onClose: () => void
  includeAdmin: boolean
}

const groupLabels = { page: '站点入口', article: '文章', project: '作品', tool: '工具' } as const

export function SiteSearchDialog({ open, onClose, includeAdmin }: SiteSearchDialogProps) {
  const [query, setQuery] = useState('')
  const entries = useMemo(() => buildSiteSearchEntries({ includeAdmin }), [includeAdmin])
  const groups = searchSite(entries, query)
  useEffect(() => { if (open) setQuery('') }, [open])
  if (!open) return null
  return <ModalSurface className="site-search-layer" label="搜索本站" onClose={onClose}>
    <header className="site-search-heading">
      <div><p>FIELD NOTES / INDEX</p><h2>去哪里看看？</h2></div>
      <button type="button" onClick={onClose} aria-label="关闭搜索">×</button>
    </header>
    <div className="site-search-input-wrap">
      <label className="site-search-input-label" htmlFor="site-search-input">
        <span aria-hidden="true">⌕</span>
        <input
          id="site-search-input"
          data-modal-focus
          aria-label="搜索作品、笔记或标签"
          placeholder="搜索文章、作品、工具或主题…"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </label>
      {query && <button type="button" className="site-search-clear" onClick={() => setQuery('')}>清除</button>}
    </div>
    <p className="site-search-count" role="status">
      {groups.length ? `${groups.reduce((count, group) => count + group.items.length, 0)} 个相关入口` : '暂时没有找到相关内容。'}
    </p>
    {groups.length ? <div className="site-search-results">
      {groups.map((group) => <section key={group.type} aria-labelledby={`search-group-${group.type}`}>
        <h3 id={`search-group-${group.type}`}>{groupLabels[group.type]}</h3>
        <ul>{group.items.map((item) => <li key={item.href}>
          <a href={item.href} onClick={onClose} target={item.external ? '_blank' : undefined} rel={item.external ? 'noreferrer' : undefined}>
            <strong>{item.title}</strong><span>{item.detail}</span><i aria-hidden="true">{item.external ? '↗︎' : '→'}</i>
          </a>
        </li>)}</ul>
      </section>)}
    </div> : <div className="site-search-recovery">
      <a href="#writing" onClick={onClose}>浏览文章</a>
      <a href="#work" onClick={onClose}>查看作品</a>
      <a href="#tools" onClick={onClose}>打开工具导航</a>
    </div>}
    <small className="site-search-hint">Esc 关闭 · Tab 切换 · Enter 前往</small>
  </ModalSurface>
}
