import { useMemo, useRef, useState } from 'react'
import {
  countUniqueTools,
  filterToolSections,
  toolCatalogMetadata,
  toolSections,
  type ToolSectionId,
} from '../content/tools'
import { ToolCategoryAccordion } from './tool-navigation/ToolCategoryAccordion'
import { ToolDirectoryToolbar } from './tool-navigation/ToolDirectoryToolbar'
import './tool-navigation.css'

const DEFAULT_OPEN_IDS = new Set<ToolSectionId>(['featured', 'toolbox'])

export function ToolNavigationPage() {
  const [query, setQuery] = useState('')
  const [expandedIds, setExpandedIds] = useState(() => new Set(DEFAULT_OPEN_IDS))
  const preSearchExpandedIds = useRef(new Set(DEFAULT_OPEN_IDS))
  const visibleSections = useMemo(() => filterToolSections(toolSections, query), [query])
  const matchCount = useMemo(() => countUniqueTools(visibleSections), [visibleSections])

  const handleQueryChange = (nextQuery: string) => {
    const wasSearching = Boolean(query.trim())
    const willSearch = Boolean(nextQuery.trim())
    if (!wasSearching && willSearch) preSearchExpandedIds.current = new Set(expandedIds)
    setQuery(nextQuery)
    if (willSearch) {
      setExpandedIds(new Set(filterToolSections(toolSections, nextQuery).map(({ id }) => id)))
    } else if (wasSearching) {
      setExpandedIds(new Set(preSearchExpandedIds.current))
    }
  }

  const toggleSection = (id: ToolSectionId) => {
    setExpandedIds((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const setVisibleExpanded = (open: boolean) => {
    setExpandedIds((current) => {
      const next = new Set(current)
      for (const { id } of visibleSections) {
        if (open) next.add(id)
        else next.delete(id)
      }
      return next
    })
  }

  return (
    <main className="tool-navigation-page editorial-page" id="tools" aria-labelledby="tools-title">
      <section className="tool-navigation-intro editorial-page-intro frame">
        <div className="tool-navigation-heading">
          <div>
            <p className="tool-navigation-index editorial-index">WENHAO / TOOL COLLECTION</p>
            <h1 id="tools-title">工具导航</h1>
          </div>
          <div>
            <p className="tool-navigation-intro-copy">把真正好用的工具，放在离想法更近的地方。</p>
            <p className="tool-catalog-hint">
              已收录 {toolCatalogMetadata.totalTools} 个工具 · 最近核对 <time dateTime={toolCatalogMetadata.lastReviewed}>{toolCatalogMetadata.lastReviewed}</time>
            </p>
          </div>
        </div>
        <ToolDirectoryToolbar query={query} matchCount={matchCount} sectionCount={visibleSections.length}
          onQueryChange={handleQueryChange} onExpandAll={() => setVisibleExpanded(true)}
          onCollapseAll={() => setVisibleExpanded(false)} />
      </section>
      <section className="tool-navigation-results frame" aria-label="工具结果">
        {visibleSections.length === 0 ? (
          <div className="tool-empty-state editorial-surface">
            <span aria-hidden="true">∅</span>
            <h2>没有找到匹配的工具</h2>
            <p>试试其他关键词，或者回到完整目录。</p>
            <button className="editorial-action" type="button" onClick={() => handleQueryChange('')}>清除搜索</button>
          </div>
        ) : visibleSections.map((section) => (
          <ToolCategoryAccordion key={section.id} section={section}
            open={expandedIds.has(section.id)} onToggle={toggleSection} />
        ))}
      </section>
    </main>
  )
}
