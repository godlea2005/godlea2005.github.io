export type ToolDirectoryToolbarProps = {
  query: string
  matchCount: number
  sectionCount: number
  onQueryChange: (value: string) => void
  onExpandAll: () => void
  onCollapseAll: () => void
}

export function ToolDirectoryToolbar(props: ToolDirectoryToolbarProps) {
  return (
    <section className="tool-directory-toolbar" aria-label="工具目录控制">
      <label className="tool-search-label">
        <span>搜索工具</span>
        <span className="tool-search-field">
          <span aria-hidden="true">⌕</span>
          <input type="search" aria-label="搜索工具" placeholder="名称、用途、分类、标签或网站"
            value={props.query} onChange={(event) => props.onQueryChange(event.target.value)} />
        </span>
      </label>
      <div className="tool-directory-actions">
        <button type="button" onClick={props.onExpandAll}>全部展开</button>
        <button type="button" onClick={props.onCollapseAll}>全部收起</button>
      </div>
      <p className="tool-results-summary" aria-live="polite">
        匹配 <strong>{props.matchCount}</strong> 个工具 / {props.sectionCount} 个分类
        {props.query.trim() && <> · 搜索“{props.query.trim()}”</>}
      </p>
    </section>
  )
}
