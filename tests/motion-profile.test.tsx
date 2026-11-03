import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useMotionProfile } from '../src/lib/useMotionProfile'

function media(initial: boolean) {
  const target = new EventTarget()
  return {
    matches: initial,
    addEventListener: vi.fn(target.addEventListener.bind(target)),
    removeEventListener: vi.fn(target.removeEventListener.bind(target)),
    change(next: boolean) {
      this.matches = next
      act(() => target.dispatchEvent(new Event('change')))
    },
  }
}

function Probe() {
  const profile = useMotionProfile()
  return <output>{JSON.stringify(profile)}</output>
}

const originalMatchMedia = window.matchMedia
const originalHidden = Object.getOwnPropertyDescriptor(document, 'hidden')

afterEach(() => {
  cleanup()
  window.matchMedia = originalMatchMedia
  if (originalHidden) Object.defineProperty(document, 'hidden', originalHidden)
  else Reflect.deleteProperty(document, 'hidden')
  vi.restoreAllMocks()
})

describe('useMotionProfile', () => {
  it('tracks both exact media queries and page visibility, releasing every listener', () => {
    const motion = media(false)
    const hover = media(true)
    window.matchMedia = vi.fn((query: string) => query === '(prefers-reduced-motion: reduce)' ? motion : hover) as typeof window.matchMedia
    const add = vi.spyOn(document, 'addEventListener')
    const remove = vi.spyOn(document, 'removeEventListener')
    Object.defineProperty(document, 'hidden', { configurable: true, value: false })
    const view = render(<Probe />)
    expect(screen.getByText('{"reducedMotion":false,"fineHover":true,"pageVisible":true}')).toBeInTheDocument()
    expect(window.matchMedia).toHaveBeenCalledWith('(hover: hover) and (pointer: fine)')
    motion.change(true)
    expect(screen.getByText('{"reducedMotion":true,"fineHover":true,"pageVisible":true}')).toBeInTheDocument()
    hover.change(false)
    expect(screen.getByText('{"reducedMotion":true,"fineHover":false,"pageVisible":true}')).toBeInTheDocument()
    Object.defineProperty(document, 'hidden', { configurable: true, value: true })
    act(() => document.dispatchEvent(new Event('visibilitychange')))
    expect(screen.getByText('{"reducedMotion":true,"fineHover":false,"pageVisible":false}')).toBeInTheDocument()
    view.unmount()
    expect(motion.removeEventListener.mock.calls).toEqual(motion.addEventListener.mock.calls)
    expect(hover.removeEventListener.mock.calls).toEqual(hover.addEventListener.mock.calls)
    expect(remove.mock.calls).toContainEqual(add.mock.calls.find(([type]) => type === 'visibilitychange'))
  })
})
