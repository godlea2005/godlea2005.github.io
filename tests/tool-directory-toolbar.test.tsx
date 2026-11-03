import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, it, vi } from 'vitest'
import { ToolDirectoryToolbar } from '../src/components/tool-navigation/ToolDirectoryToolbar'

afterEach(cleanup)

it('announces the trimmed query even when replacement results have identical counts', () => {
  const props = { query: '  Ollama  ', matchCount: 1, sectionCount: 1,
    onQueryChange: vi.fn(), onExpandAll: vi.fn(), onCollapseAll: vi.fn() }
  const view = render(<ToolDirectoryToolbar {...props} />)
  const summary = view.container.querySelector('[aria-live="polite"]')!
  expect(summary).toHaveTextContent('“Ollama”')
  view.rerender(<ToolDirectoryToolbar {...props} query=" Tavily " />)
  expect(summary).toHaveTextContent('“Tavily”')
  expect(summary).not.toHaveTextContent('Ollama')
})

it('forwards search and bulk actions while announcing supplied unique counts', async () => {
  const user = userEvent.setup()
  const props = { query: '', matchCount: 68, sectionCount: 10,
    onQueryChange: vi.fn(), onExpandAll: vi.fn(), onCollapseAll: vi.fn() }
  const view = render(<ToolDirectoryToolbar {...props} />)
  const search = screen.getByRole('searchbox', { name: '搜索工具' })
  await user.type(search, '图')
  expect(props.onQueryChange).toHaveBeenLastCalledWith('图')
  expect(search).toHaveValue('')
  await user.click(screen.getByRole('button', { name: '全部展开' }))
  await user.click(screen.getByRole('button', { name: '全部收起' }))
  expect(props.onExpandAll).toHaveBeenCalledOnce()
  expect(props.onCollapseAll).toHaveBeenCalledOnce()
  expect(view.container.querySelector('[aria-live="polite"]')).toHaveTextContent('匹配 68 个工具 / 10 个分类')
  view.rerender(<ToolDirectoryToolbar {...props} query="图" matchCount={0} sectionCount={0} />)
  expect(search).toHaveValue('图')
  expect(view.container.querySelector('[aria-live="polite"]')).toHaveTextContent('匹配 0 个工具 / 0 个分类')
})
