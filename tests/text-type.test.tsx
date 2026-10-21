import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { TextType } from '../src/components/TextType'

const initialMatchMedia = window.matchMedia
const initialHidden = Object.getOwnPropertyDescriptor(document, 'hidden')

function setMotion(reduced: boolean) {
  window.matchMedia = vi.fn((query: string) => ({
    matches: query === '(prefers-reduced-motion: reduce)' ? reduced : true,
    addEventListener: vi.fn(), removeEventListener: vi.fn(),
  })) as typeof window.matchMedia
}

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  window.matchMedia = initialMatchMedia
  if (initialHidden) Object.defineProperty(document, 'hidden', initialHidden)
})

describe('TextType', () => {
  it('types each phrase once and settles on the first phrase', async () => {
    vi.useFakeTimers()
    setMotion(false)
    render(<TextType texts={['记录设计与技术的现场', '把想法做成看得见的作品']} typingMs={1} deletingMs={1} pauseMs={1} />)
    await act(async () => vi.runAllTimers())
    expect(screen.getByLabelText('记录设计与技术的现场')).toHaveTextContent('记录设计与技术的现场')
    expect(vi.getTimerCount()).toBe(0)
  })

  it('renders the settled phrase immediately with no timers for reduced motion', () => {
    vi.useFakeTimers()
    setMotion(true)
    render(<TextType texts={['记录设计与技术的现场', '第二句']} />)
    expect(screen.getByLabelText('记录设计与技术的现场')).toHaveTextContent('记录设计与技术的现场')
    expect(vi.getTimerCount()).toBe(0)
  })

  it('pauses while hidden and clears pending timers on teardown', () => {
    vi.useFakeTimers()
    setMotion(false)
    Object.defineProperty(document, 'hidden', { configurable: true, value: true })
    const view = render(<TextType texts={['第一句', '第二句']} typingMs={1} deletingMs={1} pauseMs={1} />)
    expect(vi.getTimerCount()).toBe(0)
    Object.defineProperty(document, 'hidden', { configurable: true, value: false })
    act(() => document.dispatchEvent(new Event('visibilitychange')))
    expect(vi.getTimerCount()).toBeGreaterThan(0)
    view.unmount()
    expect(vi.getTimerCount()).toBe(0)
    expect(() => vi.runAllTimers()).not.toThrow()
  })
})
