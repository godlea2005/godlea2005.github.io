import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { TargetCursor } from '../src/components/TargetCursor'

const setMedia = (fine: boolean, reduced = false, hover = fine) => {
  const mediaQuery = (matches: boolean) => {
    const events = new EventTarget()
    return {
      matches,
      addEventListener: vi.fn(events.addEventListener.bind(events)),
      removeEventListener: vi.fn(events.removeEventListener.bind(events)),
      change(matches: boolean) {
        this.matches = matches
        act(() => events.dispatchEvent(new Event('change')))
      },
    }
  }
  const pointer = mediaQuery(fine)
  const motion = mediaQuery(reduced)
  const hoverPointer = mediaQuery(hover && fine)
  window.matchMedia = vi.fn().mockImplementation((query: string) =>
    query === '(hover: hover) and (pointer: fine)' ? hoverPointer : motion,
  )
  return { pointer, motion, hoverPointer }
}

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('TargetCursor', () => {
  it('clears the active frame when a modal is inserted and resumes only after it closes', async () => {
    setMedia(true)
    const content = (modal: boolean) => <>
      <a href="#tools" data-target-cursor="">Tool</a>
      {modal && <div role="dialog" aria-modal="true"><a href="#modal" data-target-cursor="">Modal link</a></div>}
      <TargetCursor />
    </>
    const view = render(content(false))
    const target = screen.getByRole('link', { name: 'Tool' })
    fireEvent.pointerOver(target)
    expect(target).toHaveClass('target-cursor-active')

    await act(async () => { view.rerender(content(true)) })
    expect(screen.getByTestId('target-cursor')).toHaveAttribute('data-visible', 'false')
    expect(target).not.toHaveClass('target-cursor-active')
    fireEvent.pointerOver(target)
    fireEvent.pointerOver(screen.getByRole('link', { name: 'Modal link' }))
    expect(screen.getByTestId('target-cursor')).toHaveAttribute('data-visible', 'false')

    await act(async () => { view.rerender(content(false)) })
    expect(screen.getByTestId('target-cursor')).toHaveAttribute('data-visible', 'false')
    fireEvent.pointerOver(target)
    expect(screen.getByTestId('target-cursor')).toHaveAttribute('data-visible', 'true')
  })

  it('removes the overlay and active class on media changes and safely re-enables', () => {
    const { hoverPointer: pointer, motion } = setMedia(true)
    render(<><a href="#tools" data-target-cursor="">Tool</a><TargetCursor /></>)
    const target = screen.getByRole('link', { name: 'Tool' })

    for (const [media, disabled, enabled] of [[pointer, false, true], [motion, true, false]] as const) {
      fireEvent.pointerOver(target)
      expect(target).toHaveClass('target-cursor-active')
      media.change(disabled)
      expect(screen.queryByTestId('target-cursor')).not.toBeInTheDocument()
      expect(target).not.toHaveClass('target-cursor-active')
      fireEvent.pointerOver(target)
      expect(target).not.toHaveClass('target-cursor-active')
      media.change(enabled)
      expect(screen.getByTestId('target-cursor')).toHaveAttribute('data-visible', 'false')
      fireEvent.pointerOver(target)
      expect(screen.getByTestId('target-cursor')).toHaveAttribute('data-visible', 'true')
    }
  })

  it('clears the frame and native-cursor override when focus moves out', () => {
    setMedia(true)
    render(<><a href="#tools" data-target-cursor="">Tool</a><button>Other</button><TargetCursor /></>)
    const target = screen.getByRole('link', { name: 'Tool' })
    fireEvent.focusIn(target)
    expect(target).toHaveClass('target-cursor-active')
    fireEvent.focusOut(target, { relatedTarget: screen.getByRole('button', { name: 'Other' }) })
    expect(screen.getByTestId('target-cursor')).toHaveAttribute('data-visible', 'false')
    expect(target).not.toHaveClass('target-cursor-active')
  })

  it('refreshes frame geometry on nested scrolling and window resize', () => {
    setMedia(true)
    render(<><div data-testid="scroller"><a href="#tools" data-target-cursor="">Tool</a></div><TargetCursor /></>)
    const target = screen.getByRole('link', { name: 'Tool' })
    const measure = vi.spyOn(target, 'getBoundingClientRect').mockReturnValue(new DOMRect(12, 20, 80, 44))
    fireEvent.pointerOver(target)
    measure.mockReturnValue(new DOMRect(12, 5, 80, 44))
    fireEvent.scroll(screen.getByTestId('scroller'))
    expect(screen.getByTestId('target-cursor')).toHaveStyle({ left: '12px', top: '5px', width: '80px', height: '44px' })
    measure.mockReturnValue(new DOMRect(24, 10, 160, 60))
    fireEvent.resize(window)
    expect(screen.getByTestId('target-cursor')).toHaveStyle({ left: '24px', top: '10px', width: '160px', height: '60px' })
  })

  it('releases active styling, observers, and registered listeners on teardown', () => {
    const { hoverPointer: pointer, motion } = setMedia(true)
    render(<a href="#tools" data-target-cursor="">Tool</a>)
    const target = screen.getByRole('link', { name: 'Tool' })
    const measure = vi.spyOn(target, 'getBoundingClientRect')
    const documentAdd = vi.spyOn(document, 'addEventListener')
    const documentRemove = vi.spyOn(document, 'removeEventListener')
    const windowAdd = vi.spyOn(window, 'addEventListener')
    const windowRemove = vi.spyOn(window, 'removeEventListener')
    const observe = vi.spyOn(MutationObserver.prototype, 'observe')
    const disconnect = vi.spyOn(MutationObserver.prototype, 'disconnect')
    const view = render(<TargetCursor />)
    fireEvent.pointerOver(target)
    expect(target).toHaveClass('target-cursor-active')
    expect(observe).toHaveBeenCalledWith(document.body, { childList: true, subtree: true })
    view.unmount()
    expect(target).not.toHaveClass('target-cursor-active')
    expect(disconnect).toHaveBeenCalled()

    for (const type of ['pointerover', 'pointerout', 'focusin', 'focusout']) {
      const registered = documentAdd.mock.calls.find(([event]) => event === type)
      expect(registered).toBeDefined()
      expect(documentRemove.mock.calls).toContainEqual(registered)
    }
    for (const type of ['scroll', 'resize']) {
      const registered = windowAdd.mock.calls.find(([event]) => event === type)
      expect(registered).toBeDefined()
      expect(windowRemove.mock.calls).toContainEqual(registered)
    }
    for (const media of [pointer, motion]) {
      expect(media.addEventListener).toHaveBeenCalled()
      expect(media.removeEventListener.mock.calls).toEqual(media.addEventListener.mock.calls)
    }
    measure.mockClear()
    fireEvent.pointerOver(target)
    fireEvent.focusIn(target)
    fireEvent.scroll(window)
    fireEvent.resize(window)
    expect(target).not.toHaveClass('target-cursor-active')
    expect(measure).not.toHaveBeenCalled()
  })

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

  it('requires the opt-in attribute even when a custom selector matches links', () => {
    setMedia(true)
    render(<><a href="#plain">Plain</a><a href="#opted-in" data-target-cursor="">Opted in</a><TargetCursor selector="a" /></>)
    const cursor = screen.getByTestId('target-cursor')
    const plain = screen.getByRole('link', { name: 'Plain' })
    const optedIn = screen.getByRole('link', { name: 'Opted in' })

    fireEvent.pointerOver(plain)
    expect(cursor).toHaveAttribute('data-visible', 'false')
    expect(plain).not.toHaveClass('target-cursor-active')

    fireEvent.pointerOver(optedIn)
    expect(cursor).toHaveAttribute('data-visible', 'true')
    expect(optedIn).toHaveClass('target-cursor-active')
  })

  it('is absent for reduced motion and non-fine pointers', () => {
    setMedia(true, true)
    const view = render(<><a href="#tools" data-target-cursor="">Tool</a><TargetCursor /></>)
    fireEvent.pointerOver(screen.getByRole('link', { name: 'Tool' }))
    expect(screen.queryByTestId('target-cursor')).not.toBeInTheDocument()

    view.unmount()
    setMedia(false)
    const coarseView = render(<><a href="#tools" data-target-cursor="">Tool</a><TargetCursor /></>)
    fireEvent.pointerOver(screen.getByRole('link', { name: 'Tool' }))
    expect(screen.queryByTestId('target-cursor')).not.toBeInTheDocument()

    coarseView.unmount()
    setMedia(true, false, false)
    render(<><a href="#tools" data-target-cursor="">Tool</a><TargetCursor /></>)
    expect(screen.queryByTestId('target-cursor')).not.toBeInTheDocument()
  })

  it('limits production opt-ins to navigation, featured and tool cards', () => {
    const header = readFileSync(resolve(process.cwd(), 'src/components/FloatingHeader.tsx'), 'utf8')
    const hero = readFileSync(resolve(process.cwd(), 'src/components/StatusScene.tsx'), 'utf8')
    const writing = readFileSync(resolve(process.cwd(), 'src/editorial/WritingIndexPage.tsx'), 'utf8')
    const work = readFileSync(resolve(process.cwd(), 'src/editorial/WorkIndexPage.tsx'), 'utf8')
    expect(header).not.toContain('data-target-cursor')
    expect(hero).not.toContain('data-target-cursor')
    expect(writing).not.toContain('data-target-cursor')
    expect(work).not.toContain('data-target-cursor')
    for (const file of ['components/CardNav.tsx', 'components/FeaturedNotes.tsx', 'editorial/TiltedCard.tsx', 'components/ToolNavigationPage.tsx']) {
      expect(readFileSync(resolve(process.cwd(), 'src', file), 'utf8')).toContain('data-target-cursor')
    }
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
