import type { ToolEntry } from '../../content/tools'
import { ToolLogo } from './ToolLogo'

export type ToolCardProps = { tool: ToolEntry; interactive?: boolean }

export function ToolCard({ tool, interactive = true }: ToolCardProps) {
  return (
    <a className="tool-card editorial-surface" href={tool.href} target="_blank" rel="noopener noreferrer"
      tabIndex={interactive ? undefined : -1} data-target-cursor="" data-cursor-label="打开工具">
      <span className="tool-card-identity">
        <ToolLogo name={tool.name} logoHost={tool.logoHost} categoryId={tool.categoryId} />
        <strong>{tool.name}</strong>
      </span>
      <span className="tool-card-arrow" aria-hidden="true">↗</span>
      <span className="tool-card-description">{tool.description}</span>
      <span className="tool-card-host">{tool.host}</span>
    </a>
  )
}
