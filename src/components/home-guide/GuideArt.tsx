import type { CSSProperties } from 'react'
import { guideCategories } from './model'

const sheetPath = 'M70 68 Q58 62 70 56 L188 8 Q200 2 212 8 L330 56 Q342 62 330 68 L212 116 Q200 122 188 116 Z'
const sheetLabels = ['01 · 文章', '02 · 分类', '03 · 标签', '04 · 工具']

export function ArchiveArt({ expanded, selected, onSelect }: { expanded: boolean; selected: number; onSelect: (index: number) => void }) {
  return <svg className="archive-art" viewBox="0 0 400 360" fill="none" aria-hidden="true" data-expanded={expanded}>
    {[3,2,1,0].map(index => <g key={index} className="archive-sheet" data-layer={index} data-selected={selected === index} style={{ '--sheet': index } as CSSProperties} onPointerEnter={() => onSelect(index)} onClick={event => { if (expanded) { event.stopPropagation(); onSelect(index) } }}>
      <g className="archive-sheet-body">
        <path className="archive-sheet-face" d={sheetPath} />
        <path className="archive-mark" transform="translate(0,-32)" d={index === 0 ? 'm180 92 15 8 28-16m-45 24 22 13 26-15' : index === 1 ? 'm181 96 19-10 20 10-20 10zm0 8 19 10 20-10' : index === 2 ? 'm183 85 34 20m-34 0 34-20m-17-1v24' : 'm178 97 22-12 23 12-23 13z'} />
        <text className="archive-sheet-label" x="200" y="105" textAnchor="middle">{sheetLabels[index]}</text>
      </g>
      <path className="archive-sheet-hit" d={sheetPath} />
    </g>)}
  </svg>
}

export function IndexArt({ expanded }: { expanded: boolean }) {
  return <div className="index-art" aria-hidden="true" data-expanded={expanded}><div className="index-query"><span key={String(expanded)}>把好奇，整理成线索</span><i>↗</i></div>
    <svg viewBox="0 0 400 160" fill="none"><path d="M200 0v35Q200 55 145 65L85 80v42M200 35Q200 55 255 65L315 80v42" /></svg>
    <div className="index-nodes">{guideCategories.map((category, index) => <div key={category.name} style={{ '--node': index } as CSSProperties}><span>{index === 0 ? '✳' : '◈'}</span><small>{category.name}<b>{category.articles.length}</b></small></div>)}</div>
  </div>
}

export function ContactArt() {
  return <div className="contact-art" aria-hidden="true"><div className="contact-orbit"><i><span>↗</span></i><i><span>⌘</span></i><i><span>♪</span></i></div><div className="contact-core"><svg viewBox="0 0 48 48" fill="none"><path d="M9 10h30v22H22L12 40v-8H9z" stroke="currentColor" strokeWidth="3" strokeLinejoin="round"/><path d="M17 19h14m-14 6h9" stroke="currentColor" strokeWidth="3" strokeLinecap="round"/></svg></div></div>
}
