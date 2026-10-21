import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

const ogl = vi.hoisted(() => ({ fail: false, renders: vi.fn(), lost: vi.fn() }))
vi.mock('ogl', () => ({
  Renderer: class {
    gl: object
    constructor() {
      if (ogl.fail) throw new Error('WebGL unavailable')
      this.gl = { canvas: document.createElement('canvas'), clearColor: vi.fn(), drawingBufferWidth: 100, drawingBufferHeight: 100,
        getExtension: () => ({ loseContext: ogl.lost }) }
    }
    setSize = vi.fn()
    render = ogl.renders
  },
  Program: class { uniforms: Record<string, { value: unknown }>; constructor(_: unknown, options: { uniforms: Record<string, { value: unknown }> }) { this.uniforms = options.uniforms } },
  Triangle: class {}, Mesh: class {},
}))

import GradientWaves from '../src/components/GradientWaves/GradientWaves'

const originalResize = globalThis.ResizeObserver
const originalIntersection = globalThis.IntersectionObserver
const originalRaf = window.requestAnimationFrame
const originalCancel = window.cancelAnimationFrame
const originalHidden = Object.getOwnPropertyDescriptor(document, 'hidden')

function setupObservers() {
  const frames = new Map<number, FrameRequestCallback>()
  let id = 0
  window.requestAnimationFrame = vi.fn((callback: FrameRequestCallback) => { frames.set(++id, callback); return id })
  window.cancelAnimationFrame = vi.fn((frame: number) => { frames.delete(frame) })
  const resizeDisconnect = vi.fn()
  const intersectionDisconnect = vi.fn()
  const intersections: IntersectionObserverCallback[] = []
  globalThis.ResizeObserver = class { observe = vi.fn(); disconnect = resizeDisconnect } as unknown as typeof ResizeObserver
  globalThis.IntersectionObserver = class {
    constructor(callback: IntersectionObserverCallback) { intersections.push(callback) }
    observe = vi.fn(); disconnect = intersectionDisconnect
  } as unknown as typeof IntersectionObserver
  return { frames, resizeDisconnect, intersectionDisconnect, intersections }
}

afterEach(() => {
  cleanup()
  ogl.fail = false
  ogl.renders.mockClear()
  ogl.lost.mockClear()
  globalThis.ResizeObserver = originalResize
  globalThis.IntersectionObserver = originalIntersection
  window.requestAnimationFrame = originalRaf
  window.cancelAnimationFrame = originalCancel
  if (originalHidden) Object.defineProperty(document, 'hidden', originalHidden)
  vi.restoreAllMocks()
})

describe('GradientWaves', () => {
  it('keeps the CSS fallback after WebGL setup fails', () => {
    ogl.fail = true
    const env = setupObservers()
    expect(() => render(<GradientWaves />)).not.toThrow()
    expect(screen.getByTestId('gradient-waves')).toHaveAttribute('data-renderer', 'fallback')
    expect(env.frames.size).toBe(0)
  })

  it('works without observers and renders exactly one frame for speed zero', () => {
    const env = setupObservers()
    globalThis.ResizeObserver = undefined as unknown as typeof ResizeObserver
    globalThis.IntersectionObserver = undefined as unknown as typeof IntersectionObserver
    const view = render(<GradientWaves speed={0} />)
    expect(screen.getByTestId('gradient-waves')).toHaveAttribute('data-renderer', 'webgl')
    expect(ogl.renders).toHaveBeenCalledTimes(1)
    expect(env.frames.size).toBe(0)
    view.unmount()
    expect(ogl.lost).toHaveBeenCalledOnce()
  })

  it('stops while hidden/offscreen and releases observers, listeners and context on unmount', () => {
    const env = setupObservers()
    const add = vi.spyOn(document, 'addEventListener')
    const remove = vi.spyOn(document, 'removeEventListener')
    const view = render(<GradientWaves speed={0.5} />)
    expect(env.frames.size).toBe(1)
    act(() => env.intersections[0]([{ isIntersecting: false } as IntersectionObserverEntry], {} as IntersectionObserver))
    expect(env.frames.size).toBe(0)
    act(() => env.intersections[0]([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver))
    expect(env.frames.size).toBe(1)
    Object.defineProperty(document, 'hidden', { configurable: true, value: true })
    act(() => document.dispatchEvent(new Event('visibilitychange')))
    expect(env.frames.size).toBe(0)
    view.unmount()
    expect(env.resizeDisconnect).toHaveBeenCalled()
    expect(env.intersectionDisconnect).toHaveBeenCalled()
    expect(ogl.lost).toHaveBeenCalledOnce()
    expect(remove.mock.calls).toContainEqual(add.mock.calls.find(([event]) => event === 'visibilitychange'))
  })
})
