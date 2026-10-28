import { Component, Suspense, type ErrorInfo, type ReactNode } from 'react'
import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createHeavyLazyRoute, resetHeavyRouteLoadingForTests } from '../src/lib/heavyRouteLoading'
import { RouteLoadingScreen } from '../src/components/RouteLoadingScreen'

const originalHidden = Object.getOwnPropertyDescriptor(document, 'hidden')

class TestErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  componentDidCatch(_error: Error, _info: ErrorInfo) {}
  render() { return this.state.failed ? <p>route failed</p> : this.props.children }
}

afterEach(() => {
  cleanup()
  resetHeavyRouteLoadingForTests()
  if (originalHidden) Object.defineProperty(document, 'hidden', originalHidden)
  else Reflect.deleteProperty(document, 'hidden')
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('heavy route loading', () => {
  it('keeps the first module pending, mounts content behind a 360ms exit, then stays cached', async () => {
    vi.useFakeTimers()
    const loader = vi.fn(async () => ({ default: () => <p>commerce ready</p> }))
    const Page = createHeavyLazyRoute('ai-commerce', loader, 900)
    const renderRoute = () => render(<>
      <RouteLoadingScreen route="ai-commerce" />
      <Suspense fallback={null}><Page /></Suspense>
    </>)
    const view = renderRoute()

    await act(async () => Promise.resolve())
    expect(screen.getByRole('status', { name: '正在打开 AI 电商实验室' })).toBeInTheDocument()
    await act(async () => vi.advanceTimersByTimeAsync(899))
    expect(screen.queryByText('commerce ready')).not.toBeInTheDocument()
    await act(async () => vi.advanceTimersByTimeAsync(1))
    expect(screen.getByText('commerce ready')).toBeInTheDocument()
    await act(async () => Promise.resolve())
    expect(screen.getByText('commerce ready')).toHaveAttribute('inert')
    expect(screen.getByRole('status')).toHaveClass('is-leaving')
    await act(async () => vi.advanceTimersByTimeAsync(359))
    expect(screen.getByRole('status')).toBeInTheDocument()
    await act(async () => vi.advanceTimersByTimeAsync(1))
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    expect(screen.getByText('commerce ready')).not.toHaveAttribute('inert')

    view.unmount()
    renderRoute()
    await act(async () => { await Promise.resolve(); await Promise.resolve() })
    expect(screen.getByText('commerce ready')).toBeInTheDocument()
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    expect(loader).toHaveBeenCalledTimes(1)
  })

  it('removes the artificial delay and uses only a 120ms reduced-motion fade', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() })))
    const Page = createHeavyLazyRoute('music', async () => ({ default: () => <p>ready now</p> }), 900)
    render(<><RouteLoadingScreen route="music" /><Suspense fallback={null}><Page /></Suspense></>)
    await act(async () => { await Promise.resolve(); await Promise.resolve() })
    expect(screen.getByText('ready now')).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveClass('is-leaving', 'is-reduced-motion')
    expect(vi.getTimerCount()).toBe(1)
    await act(async () => vi.advanceTimersByTimeAsync(120))
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('lets an import failure replace the overlay instead of trapping the page', async () => {
    vi.useFakeTimers()
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const Page = createHeavyLazyRoute('tools', async () => { throw new Error('chunk failed') }, 900)
    render(<><RouteLoadingScreen route="tools" /><TestErrorBoundary><Suspense fallback={null}><Page /></Suspense></TestErrorBoundary></>)
    await act(async () => { await Promise.resolve(); await Promise.resolve() })
    expect(screen.getByText('route failed')).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveClass('is-leaving')
    await act(async () => vi.advanceTimersByTimeAsync(360))
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    expect(vi.getTimerCount()).toBe(0)
    errorLog.mockRestore()
  })

  it.each([
    ['ai-commerce', 'OPENING COMMERCE LAB'],
    ['commerce-admin', 'OPENING OPERATOR CONSOLE'],
    ['music', 'LOADING AUDIO FIELD'],
    ['guestbook', 'CONNECTING OPEN CHANNEL'],
    ['tools', 'OPENING TOOL INDEX'],
  ] as const)('announces and labels %s', (route, copy) => {
    render(<RouteLoadingScreen route={route} />)
    expect(screen.getByRole('status')).toHaveTextContent(copy)
    expect(screen.getByText('WENHAO')).toBeInTheDocument()
  })

  it('makes shell siblings inert until the exit completes and restores them on cleanup', () => {
    const view = render(<div className="site-shell"><button>behind</button><RouteLoadingScreen route="guestbook" /></div>)
    expect(screen.getByText('behind')).toHaveAttribute('inert')
    view.rerender(<div className="site-shell"><button>behind</button></div>)
    expect(screen.getByText('behind')).not.toHaveAttribute('inert')
  })

  it('keeps static copy when Canvas 2D is unavailable', () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null)
    render(<RouteLoadingScreen route="commerce-admin" />)
    expect(screen.getByText('WENHAO')).toBeVisible()
    expect(screen.getByText('OPENING OPERATOR CONSOLE')).toBeVisible()
  })

  it('marks hidden-page motion as paused and removes the marker after resume', () => {
    render(<RouteLoadingScreen route="guestbook" />)
    Object.defineProperty(document, 'hidden', { configurable: true, value: true })
    act(() => document.dispatchEvent(new Event('visibilitychange')))
    expect(screen.getByRole('status')).toHaveClass('is-page-hidden')
    Object.defineProperty(document, 'hidden', { configurable: true, value: false })
    act(() => document.dispatchEvent(new Event('visibilitychange')))
    expect(screen.getByRole('status')).not.toHaveClass('is-page-hidden')
  })
})
