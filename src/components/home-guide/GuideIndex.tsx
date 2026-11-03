import { useState } from 'react'
import { guideCategories, guideTags, writingFilterHref } from './model'

export function GuideIndex() {
  const [tab, setTab] = useState<'category' | 'tag'>('category')
  return <div className="guide-index-details">
    {(['category', 'tag'] as const).map(kind => <div className="guide-index-section" key={kind} data-open={tab === kind}>
      <button type="button" aria-expanded={tab === kind} aria-controls={`guide-index-${kind}`} onClick={() => setTab(kind)}>{kind === 'category' ? '分类索引' : '标签索引'}<span>{kind === 'category' ? guideCategories.length : guideTags.length}<i aria-hidden="true">{tab === kind ? '−' : '+'}</i></span></button>
      <div className="guide-index-reveal" id={`guide-index-${kind}`} inert={tab !== kind} aria-hidden={tab !== kind}><div><div className="guide-index-links">
        {kind === 'category' ? guideCategories.map(category => <a key={category.name} href={writingFilterHref('category', category.name)}>{category.name}<b>{category.articles.length}</b></a>) : guideTags.map(tag => <a key={tag} href={writingFilterHref('tag', tag)}># {tag}</a>)}
      </div></div></div>
    </div>)}
  </div>
}
