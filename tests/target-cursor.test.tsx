import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { TargetCursor } from '../src/components/TargetCursor'

const setMedia = (fine: boolean, reduced = false) => {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: query === '(pointer: fine)' ? fine : query === '(prefers-reduced-motion: reduce)' && reduced,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }))
}

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('TargetCursor', () => {
  it('frames an opted-in link on pointer entry and clears it on pointer leave', () => {
    setMedia(true)
    render(<><a href="#tools" data-target-cursor="" data-cursor-label="打开工具">Tool</a><TargetCursor /></>)
    const target = screen.getByRole('link', { name: 'Tool' })
    vi.spyOn(target, 'getBoundingClientRect').mockReturnValue(new DOMRect(12, 20, 80, 44))

    fireEvent.pointerOver(target)
    expect(screen.getByTestId('target-cursor')).toHaveAttribute('data-visible', 'true')
    expect(screen.getByTestId('target-cursor')).toHaveStyle({ left: '12px', top: '20px', width: '80px', height: '44px' })
    expect(screen.getByText('打开工具')).toBeInTheDocument()
    fireEvent.pointerOut(target)
    expect(screen.getByTestId('target-cursor')).toHaveAttribute('data-visible', 'false')
  })

  it('is absent for reduced motion and non-fine pointers', () => {
    setMedia(true, true)
    const view = render(<><a href="#tools" data-target-cursor="">Tool</a><TargetCursor /></>)
    fireEvent.pointerOver(screen.getByRole('link', { name: 'Tool' }))
    expect(screen.queryByTestId('target-cursor')).not.toBeInTheDocument()

    view.unmount()
    setMedia(false)
    render(<><a href="#tools" data-target-cursor="">Tool</a><TargetCursor /></>)
    fireEvent.pointerOver(screen.getByRole('link', { name: 'Tool' }))
    expect(screen.queryByTestId('target-cursor')).not.toBeInTheDocument()
  })

  it('ignores unannotated inputs and protected descendants', () => {
    setMedia(true)
    render(<><a href="#tools" data-target-cursor=""><span data-no-target-cursor>Protected</span></a><form><a href="#form" data-target-cursor="">Form link</a><input aria-label="产品名称" /></form><TargetCursor /></>)
    const cursor = screen.getByTestId('target-cursor')
    fireEvent.pointerOver(screen.getByRole('textbox', { name: '产品名称' }))
    expect(cursor).toHaveAttribute('data-visible', 'false')
    fireEvent.pointerOver(screen.getByText('Protected'))
    expect(cursor).toHaveAttribute('data-visible', 'false')
    fireEvent.pointerOver(screen.getByRole('link', { name: 'Form link' }))
    expect(cursor).toHaveAttribute('data-visible', 'false')
  })

  it('reframes on focus and clears when an active target is removed', () => {
    setMedia(true)
    const view = render(<><a data-target-cursor="" href="#tools">Tools</a><TargetCursor /></>)
    const target = screen.getByRole('link', { name: 'Tools' })
    vi.spyOn(target, 'getBoundingClientRect').mockReturnValue(new DOMRect(4, 8, 60, 30))
    fireEvent.focusIn(target)
    expect(screen.getByTestId('target-cursor')).toHaveAttribute('data-visible', 'true')
    view.rerender(<TargetCursor />)
    fireEvent.scroll(window)
    expect(screen.getByTestId('target-cursor')).toHaveAttribute('data-visible', 'false')
  })
})
