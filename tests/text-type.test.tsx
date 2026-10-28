import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { TextType } from '../src/components/TextType'

const initialMatchMedia = window.matchMedia
const initialHidden = Object.getOwnPropertyDescriptor(document, 'hidden')

function setMotion(reduced: boolean, fine = true) {
  window.matchMedia = vi.fn((query: string) => ({
    matches: query === '(prefers-reduced-motion: reduce)' ? reduced : fine,
    addEventListener: vi.fn(), removeEventListener: vi.fn(),
  })) as typeof window.matchMedia
}

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  window.matchMedia = initialMatchMedia
  if (initialHidden) Object.defineProperty(document, 'hidden', initialHidden)
  else Reflect.deleteProperty(document, 'hidden')
})

describe('TextType', () => {
  const glyphs = (container: HTMLElement) => container.querySelector<HTMLElement>('.text-type-glyphs')!
  const runNextStep = () => act(() => { vi.runOnlyPendingTimers() })

  it('deletes the final phrase before restarting the first phrase', () => {
    vi.useFakeTimers(); setMotion(false)
    const view = render(<TextType texts={['第一句', '第二句']} typingMs={10} deletingMs={5} pauseMs={20} loop />)
    for (let step = 0; step < 40 && glyphs(view.container).textContent !== '第二句'; step += 1) runNextStep()
    expect(glyphs(view.container)).toHaveTextContent('第二句')
    runNextStep(); runNextStep(); runNextStep()
    expect(glyphs(view.container)).toHaveTextContent('第二')
    runNextStep(); expect(glyphs(view.container)).toHaveTextContent('第')
    runNextStep(); expect(glyphs(view.container).textContent).toBe('')
    runNextStep(); expect(glyphs(view.container).textContent).toBe('')
    runNextStep(); expect(glyphs(view.container)).toHaveTextContent('第')
    view.unmount(); expect(vi.getTimerCount()).toBe(0)
  })

  it('continues through two complete loops without accumulating timers', () => {
    vi.useFakeTimers(); setMotion(false)
    const view = render(<TextType texts={['一', '二']} typingMs={1} deletingMs={1} pauseMs={1} loop />)
    const changes: string[] = []; let previous = ''
    for (let step = 0; step < 21; step += 1) {
      runNextStep()
      const current = glyphs(view.container).textContent ?? ''
      if (current !== previous) changes.push(current)
      previous = current
    }
    expect(changes).toEqual(['一', '', '二', '', '一', '', '二', '', '一'])
    expect(vi.getTimerCount()).toBe(1)
    view.unmount(); expect(vi.getTimerCount()).toBe(0)
  })

  it('does not restart when equivalent arrays are passed on rerender', () => {
    vi.useFakeTimers(); setMotion(false)
    const view = render(<TextType texts={['第一句', '第二句']} typingMs={10} loop />)
    act(() => { vi.advanceTimersByTime(5) })
    view.rerender(<TextType texts={['第一句', '第二句']} typingMs={10} loop />)
    act(() => { vi.advanceTimersByTime(5) })
    expect(glyphs(view.container)).toHaveTextContent('第')
    view.unmount(); expect(vi.getTimerCount()).toBe(0)
  })
  it('types each phrase once and settles on the first phrase', async () => {
    vi.useFakeTimers()
    setMotion(false)
    render(<TextType texts={['记录设计与技术的现场', '把想法做成看得见的作品']} typingMs={1} deletingMs={1} pauseMs={1} />)
    await act(async () => vi.runAllTimers())
    const accessible = screen.getByText('记录设计与技术的现场', { selector: '.text-type-accessible' })
    expect(accessible).not.toHaveAttribute('aria-hidden')
    expect(accessible).toBeInTheDocument()
    expect(screen.getByText('记录设计与技术的现场', { selector: '.text-type-glyphs' })).toHaveAttribute('aria-hidden', 'true')
    expect(document.querySelector('.text-type-caret')).not.toBeInTheDocument()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('renders the settled phrase immediately with no timers for reduced motion', () => {
    vi.useFakeTimers()
    setMotion(true)
    const view = render(<TextType texts={['记录设计与技术的现场', '第二句']} loop />)
    expect(screen.getByText('记录设计与技术的现场', { selector: '.text-type-accessible' })).not.toHaveAttribute('aria-hidden')
    expect(screen.getByText('记录设计与技术的现场', { selector: '.text-type-glyphs' })).toHaveAttribute('aria-hidden', 'true')
    expect(document.querySelector('.text-type-caret')).not.toBeInTheDocument()
    expect(vi.getTimerCount()).toBe(0)
    view.unmount()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('types on coarse pointers', () => {
    vi.useFakeTimers()
    setMotion(false, false)
    const view = render(<TextType texts={['第一句', '第二句']} typingMs={1} loop />)
    expect(glyphs(view.container).textContent).toBe('')
    runNextStep(); expect(glyphs(view.container)).toHaveTextContent('第')
    view.unmount(); expect(vi.getTimerCount()).toBe(0)
  })

  it('pauses while hidden and clears pending timers on teardown', () => {
    vi.useFakeTimers()
    setMotion(false)
    Object.defineProperty(document, 'hidden', { configurable: true, value: true })
    const view = render(<TextType texts={['第一句', '第二句']} typingMs={1} deletingMs={1} pauseMs={1} loop />)
    expect(screen.getByText('第一句', { selector: '.text-type-accessible' })).toBeInTheDocument()
    expect(vi.getTimerCount()).toBe(0)
    Object.defineProperty(document, 'hidden', { configurable: true, value: false })
    act(() => document.dispatchEvent(new Event('visibilitychange')))
    expect(vi.getTimerCount()).toBeGreaterThan(0)
    view.unmount()
    expect(vi.getTimerCount()).toBe(0)
    expect(() => vi.runAllTimers()).not.toThrow()
  })
})
