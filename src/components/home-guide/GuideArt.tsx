import { guideCategories } from './model'

export function ArchiveArt() {
  return <svg className="archive-art" viewBox="0 0 400 250" fill="none" aria-hidden="true">
    {Array.from({ length: 7 }, (_, index) => <g key={index} className="archive-sheet" style={{ '--sheet': index } as React.CSSProperties}>
      <path d={`M96 ${117 + index * 12} Q84 ${110 + index * 12} 96 ${103 + index * 12} L187 ${56 + index * 12} Q200 ${49 + index * 12} 213 ${56 + index * 12} L304 ${103 + index * 12} Q316 ${110 + index * 12} 304 ${117 + index * 12} L213 ${164 + index * 12} Q200 ${171 + index * 12} 187 ${164 + index * 12} Z`} />
    </g>)}
    <path className="archive-top" d="M96 103 Q84 96 96 89 L187 42 Q200 35 213 42 L304 89 Q316 96 304 103 L213 150 Q200 157 187 150 Z" />
    <path className="archive-mark" d="m176 92 15 8 30-16m-47 24 26 13 29-15" />
    <circle cx="323" cy="63" r="4" className="archive-dot" />
    <path d="M322 79v24m-12-12h24" className="archive-mark" />
  </svg>
}

export function IndexArt() {
  return <div className="index-art" aria-hidden="true"><div className="index-query"><span>把好奇，整理成线索</span><i>↗</i></div>
    <svg viewBox="0 0 400 160" fill="none"><path d="M200 0v35Q200 55 145 65L85 80v42M200 35Q200 55 255 65L315 80v42" /></svg>
    <div className="index-nodes">{guideCategories.map((category, index) => <div key={category.name}><span>{index === 0 ? '✳' : '◈'}</span><small>{category.name}<b>{category.articles.length}</b></small></div>)}</div>
  </div>
}

export function ContactArt() {
  return <div className="contact-art" aria-hidden="true"><div className="contact-orbit"><i>↗</i><i>⌘</i><i>♪</i></div><div className="contact-core"><svg viewBox="0 0 48 48" fill="none"><path d="M9 10h30v22H22L12 40v-8H9z" stroke="currentColor" strokeWidth="3" strokeLinejoin="round"/><path d="M17 19h14m-14 6h9" stroke="currentColor" strokeWidth="3" strokeLinecap="round"/></svg></div></div>
}
