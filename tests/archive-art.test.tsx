import { cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { ArchiveArt } from '../src/components/home-guide/GuideArt'

afterEach(cleanup)

it('draws exactly four single-contour sheets with distinct labels', () => {
  const { container } = render(<ArchiveArt expanded={false} selected={0} onSelect={vi.fn()} />)
  expect(container.querySelectorAll('.archive-sheet')).toHaveLength(4)
  expect(container.querySelectorAll('.archive-sheet-face')).toHaveLength(4)
  expect(container.querySelectorAll('.archive-sheet-edge')).toHaveLength(0)
  expect(Array.from(container.querySelectorAll('.archive-sheet-label'), node => node.textContent)).toEqual(['04 · 工具', '03 · 标签', '02 · 分类', '01 · 文章'])
  expect(container.querySelectorAll('.archive-sheet-hit')).toHaveLength(4)
})

it('keeps selection linked to the correct sheet without toggling its parent when expanded', () => {
  const onSelect = vi.fn(), onParent = vi.fn()
  const { container, rerender } = render(<div onClick={onParent}><ArchiveArt expanded selected={1} onSelect={onSelect} /></div>)
  const sheet = container.querySelector('[data-layer="2"]')!
  fireEvent.pointerEnter(sheet)
  expect(onSelect).toHaveBeenLastCalledWith(2)
  fireEvent.click(sheet)
  expect(onSelect).toHaveBeenLastCalledWith(2)
  expect(onParent).not.toHaveBeenCalled()
  rerender(<div onClick={onParent}><ArchiveArt expanded={false} selected={2} onSelect={onSelect} /></div>)
  expect(container.querySelector('.archive-sheet[data-selected="true"]')).toHaveAttribute('data-layer', '2')
  fireEvent.click(sheet)
  expect(onParent).toHaveBeenCalledOnce()
})
