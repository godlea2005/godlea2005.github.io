import { useState } from 'react'
import type { ToolSection, ToolSectionId } from '../../content/tools'
import { ToolCard } from './ToolCard'

export type ToolCategoryAccordionProps = {
  section: ToolSection
  open: boolean
  onToggle: (id: ToolSectionId) => void
}

export function ToolCategoryAccordion({ section, open, onToggle }: ToolCategoryAccordionProps) {
  const [hasOpened, setHasOpened] = useState(open)
  // Remember only whether content has mounted; the parent controls expansion.
  if (open && !hasOpened) setHasOpened(true)
  const panelId = `tool-section-${section.id}`
  const buttonId = `tool-section-trigger-${section.id}`
  return (
    <section className="tool-category-accordion" data-category={section.id}>
      <h2>
        <button id={buttonId} type="button" aria-expanded={open} aria-controls={panelId}
          onClick={() => onToggle(section.id)}>
          <span className="tool-category-number">{section.number}</span>
          <span className="tool-category-copy"><strong>{section.title}</strong><small>{section.description}</small></span>
          <span className="tool-category-count">{section.tools.length} 个工具</span>
          <span className="tool-category-chevron" aria-hidden="true">⌄</span>
        </button>
      </h2>
      <div id={panelId} role="region" aria-labelledby={buttonId} aria-hidden={!open}
        inert={!open} className="tool-category-panel" data-open={open ? 'true' : 'false'}>
        {(open || hasOpened) && <div className="tool-category-panel-inner"><div className="tool-card-grid">
          {section.tools.map((tool) => <ToolCard key={tool.id} tool={tool} interactive={open} />)}
        </div></div>}
      </div>
    </section>
  )
}
