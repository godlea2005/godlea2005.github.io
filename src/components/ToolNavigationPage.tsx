import { useMemo, useState } from 'react'
import {
  filterToolCategories,
  toolCategories,
  toolCategoryOptions,
  type ToolCategoryId,
} from '../content/tools'
import './tool-navigation.css'

export function ToolNavigationPage() {
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState<ToolCategoryId | 'all'>('all')
  const visibleCategories = useMemo(
    () => filterToolCategories(toolCategories, { query, category }),
    [query, category],
  )
  const matchCount = visibleCategories.reduce((count, item) => count + item.tools.length, 0)

  const clearFilters = () => {
    setQuery('')
    setCategory('all')
  }

  return (
    <main className="tool-navigation-page" id="tools" aria-labelledby="tools-title">
      <section className="tool-navigation-intro frame">
        <div className="tool-navigation-heading">
          <div>
            <p className="tool-navigation-index">FIELD NOTES / TOOL INDEX</p>
            <h1 id="tools-title">工具导航</h1>
          </div>
          <p className="tool-navigation-intro-copy">从真实工作流里留下的工具，不追新，只留会反复打开的。</p>
        </div>
        <label className="tool-search-label">
          <span>搜索工具</span>
          <div className="tool-search-field">
            <span aria-hidden="true">⌕</span>
            <input
              type="search"
              role="searchbox"
              aria-label="搜索工具"
              placeholder="名称、用途、标签或网站"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
            <kbd>/ INDEX</kbd>
          </div>
        </label>
      </section>

      <nav className="tool-category-rail frame" aria-label="工具分类">
        {toolCategoryOptions.map((option) => (
          <button
            key={option.id}
            type="button"
            aria-pressed={category === option.id}
            onClick={() => setCategory(option.id)}
          >
            {option.label}
          </button>
        ))}
      </nav>

      <section className="tool-navigation-results frame" aria-live="polite" aria-label="工具结果">
        <p className="tool-results-summary">当前收录 <strong>{matchCount}</strong> 个工具<span aria-hidden="true"> / </span>{visibleCategories.length} 个分类</p>
        {visibleCategories.length === 0 ? (
          <div className="tool-empty-state">
            <span aria-hidden="true">∅</span>
            <h2>没有找到匹配的工具</h2>
            <p>试试其他关键词，或者回到完整目录。</p>
            <button type="button" onClick={clearFilters}>清除筛选</button>
          </div>
        ) : visibleCategories.map((item) => (
          <section className="tool-category-section" key={item.id} aria-labelledby={`${item.id}-title`}>
            <header className="tool-category-header">
              <span className="tool-category-number">{item.number}</span>
              <div>
                <h2 id={`${item.id}-title`}>{item.title}</h2>
                <p>{item.description}</p>
              </div>
              <span className="tool-category-count">{item.tools.length} 个工具</span>
            </header>
            <div className="tool-card-grid">
              {item.tools.map((tool) => (
                <a
                  className="tool-card"
                  key={tool.id}
                  href={tool.href}
                  target="_blank"
                  rel="noreferrer"
                  data-target-cursor=""
                  data-cursor-label="打开工具"
                >
                  <div className="tool-card-top">
                    <span className="tool-card-mark" aria-hidden="true">{tool.mark}</span>
                    <span className="tool-card-arrow" aria-hidden="true">↗</span>
                  </div>
                  <h3>{tool.name}</h3>
                  <p className="tool-card-description">{tool.description}</p>
                  <ul className="tool-card-tags" aria-label={`${tool.name} 标签`}>
                    {tool.tags.map((tag) => <li key={tag}>{tag}</li>)}
                  </ul>
                  <div className="tool-card-bottom">
                    <span className="tool-card-host">{tool.host}</span>
                    <p>{tool.note}</p>
                  </div>
                </a>
              ))}
            </div>
          </section>
        ))}
      </section>
    </main>
  )
}
