import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ToolLogo } from '../src/components/tool-navigation/ToolLogo'

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('ToolLogo', () => {
  it('cleans up visibility observation and the active deadline on unmount', () => {
    vi.useFakeTimers()
    let intersect: IntersectionObserverCallback = () => {}
    const disconnect = vi.fn()
    vi.stubGlobal('IntersectionObserver', class {
      constructor(callback: IntersectionObserverCallback) { intersect = callback }
      observe = vi.fn()
      disconnect = disconnect
    })
    const view = render(<ToolLogo name="Tavily" logoHost="app.tavily.com" categoryId="api" />)
    expect(vi.getTimerCount()).toBe(0)
    act(() => intersect([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver))
    expect(vi.getTimerCount()).toBe(1)
    view.unmount()
    expect(disconnect).toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('does not start a request or deadline until an offscreen logo intersects, including after close/reopen', () => {
    vi.useFakeTimers()
    let intersect: IntersectionObserverCallback = () => {}
    const disconnect = vi.fn()
    vi.stubGlobal('IntersectionObserver', class {
      constructor(callback: IntersectionObserverCallback) { intersect = callback }
      observe = vi.fn()
      disconnect = disconnect
    })
    const view = render(<div><ToolLogo name="Tavily" logoHost="app.tavily.com" categoryId="api" /></div>)
    expect(view.container.querySelector('img')).not.toHaveAttribute('src')
    act(() => vi.advanceTimersByTime(6000))
    expect(screen.queryByText('TA')).not.toBeInTheDocument()
    view.container.firstElementChild!.setAttribute('inert', '')
    act(() => intersect([{ isIntersecting: false } as IntersectionObserverEntry], {} as IntersectionObserver))
    act(() => vi.advanceTimersByTime(6000))
    view.container.firstElementChild!.removeAttribute('inert')
    act(() => intersect([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver))
    expect(view.container.querySelector('img')).toHaveAttribute('src', 'https://favicon.im/app.tavily.com')
    fireEvent.load(view.container.querySelector('img')!)
    act(() => vi.advanceTimersByTime(6000))
    expect(view.container.querySelector('img')).toHaveAttribute('data-loaded', 'true')
    expect(disconnect).toHaveBeenCalled()
  })

  it.each(['', '   '])('falls back immediately for a missing host (%j) and recovers for a valid one', (logoHost) => {
    vi.useFakeTimers()
    const view = render(<ToolLogo name="Tavily" logoHost={logoHost} categoryId="api" />)
    expect(screen.getByText('TA')).toBeVisible()
    expect(view.container.querySelector('img')).toBeNull()
    expect(vi.getTimerCount()).toBe(0)
    view.rerender(<ToolLogo name="Tavily" logoHost=" app.tavily.com " categoryId="api" />)
    expect(view.container.querySelector('img')).toHaveAttribute('src', 'https://favicon.im/app.tavily.com')
    view.unmount()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('loads the requested favicon lazily without repeating the visible tool name', () => {
    const { container } = render(<ToolLogo name="StarDots" logoHost="stardots.io" categoryId="toolbox" />)
    const image = container.querySelector('img')!
    expect(image).toHaveAttribute('src', 'https://favicon.im/stardots.io')
    expect(image).toHaveAttribute('loading', 'lazy')
    expect(image).toHaveAttribute('decoding', 'async')
    expect(image).toHaveAttribute('alt', '')
    expect(image).toHaveAttribute('width', '28')
    expect(image).toHaveAttribute('height', '28')
  })

  it('replaces an error or timeout with deterministic initials and resets a pending timer for a new host', () => {
    vi.useFakeTimers()
    const view = render(<ToolLogo name="StarDots" logoHost="stardots.io" categoryId="toolbox" />)
    act(() => vi.advanceTimersByTime(2500))
    view.rerender(<ToolLogo name="GitHub" logoHost="github.com" categoryId="frontend-dev" />)
    expect(view.container.querySelector('img')).toHaveAttribute('src', 'https://favicon.im/github.com')
    act(() => vi.advanceTimersByTime(2500))
    expect(view.container.querySelector('img')).toHaveAttribute('src', 'https://favicon.im/github.com')
    expect(screen.queryByText('GI')).not.toBeInTheDocument()
    act(() => vi.advanceTimersByTime(5000))
    expect(screen.getByText('GI')).toBeVisible()
  })

  it.each([
    ['A', 'AA'],
    ['ßa', 'SS'],
  ])('keeps initials exactly two characters for %s', (name, expected) => {
    const view = render(<ToolLogo name={name} logoHost="broken.example" categoryId="toolbox" />)
    fireEvent.error(view.container.querySelector('img')!)
    expect(screen.getByText(expected)).toBeVisible()
    expect(expected).toHaveLength(2)
  })

  it('recovers from an error for a replacement host and still times out a genuinely stalled attempt', () => {
    vi.useFakeTimers()
    const view = render(<ToolLogo name="StarDots" logoHost="broken.example" categoryId="toolbox" />)
    fireEvent.error(view.container.querySelector('img')!)
    expect(screen.getByText('ST')).toBeVisible()
    view.rerender(<ToolLogo name="GitHub" logoHost="github.com" categoryId="frontend-dev" />)
    expect(view.container.querySelector('img')).toHaveAttribute('src', 'https://favicon.im/github.com')
    act(() => vi.advanceTimersByTime(4999))
    expect(screen.queryByText('GI')).not.toBeInTheDocument()
    act(() => vi.advanceTimersByTime(1))
    expect(screen.getByText('GI')).toBeVisible()
  })

  it('does not replace a successfully loaded image when the timeout expires', () => {
    vi.useFakeTimers()
    const view = render(<ToolLogo name="GitHub" logoHost="github.com" categoryId="frontend-dev" />)
    fireEvent.load(view.container.querySelector('img')!)
    act(() => vi.advanceTimersByTime(5000))
    expect(view.container.querySelector('img')).toHaveAttribute('src', 'https://favicon.im/github.com')
    expect(screen.queryByText('GI')).not.toBeInTheDocument()
  })
})
