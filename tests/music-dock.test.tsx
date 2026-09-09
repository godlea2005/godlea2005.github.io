import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../src/music/MusicProvider', () => ({
  useMusic: () => ({
    playing: false, duration: 0, currentTime: 0, muted: false, volume: 0.7,
    error: '', status: 'idle', track: { title: '测试音乐', artist: '测试作者', accent: '#7dffb2' },
    seek: vi.fn(), previous: vi.fn(), togglePlay: vi.fn(), next: vi.fn(), toggleMute: vi.fn(), setVolume: vi.fn(),
  }),
}))
vi.mock('../src/music/PlaylistOverlay', () => ({ PlaylistOverlay: () => null }))

import { calculateCommerceLauncherPlacement, GlobalMusicDock } from '../src/music/GlobalMusicDock'

const rect = (left: number, top: number, right: number, bottom: number): DOMRect => ({
  left, top, right, bottom, width: right - left, height: bottom - top,
  x: left, y: top, toJSON: () => ({}),
})

describe('mobile commerce music launcher', () => {
  beforeEach(() => {
    class ResizeObserverMock {
      observe() {}
      disconnect() {}
      unobserve() {}
    }
    vi.stubGlobal('ResizeObserver', ResizeObserverMock)
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => window.setTimeout(() => callback(0), 0))
    vi.stubGlobal('cancelAnimationFrame', (id: number) => window.clearTimeout(id))
  })

  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
  })

  it.each([
    { width: 600, action: rect(319, 649.984, 569, 703.984), launcher: rect(544, 710, 588, 754) },
    { width: 640, action: rect(348, 716, 608, 770), launcher: rect(584, 776, 628, 820) },
  ])('moves the launcher to a measured 12px vertical gap at $width px', ({ width, action, launcher }) => {
    const placement = calculateCommerceLauncherPlacement({
      actionRect: action,
      launcherRect: launcher,
      viewportWidth: width,
      viewportHeight: 844,
      currentShiftY: 0,
    })
    const movedTop = launcher.top - placement.shiftY
    const movedBottom = launcher.bottom - placement.shiftY

    expect(placement.side).toBe('above')
    expect(action.left < launcher.right && action.right > launcher.left).toBe(true)
    expect(action.top - movedBottom).toBeCloseTo(12, 5)
    expect(movedTop).toBeGreaterThanOrEqual(12)
  })

  it('reads actual primary-action and launcher rectangles and applies the calculated shift', async () => {
    const view = render(<><form className="commerce-workspace"><button data-commerce-primary-action>提交</button></form><GlobalMusicDock commerceMode /></>)
    const action = screen.getByRole('button', { name: '提交' })
    const launcher = screen.getByRole('button', { name: '打开音乐播放器' })
    const dock = view.container.querySelector<HTMLElement>('.music-dock')!
    action.getBoundingClientRect = vi.fn(() => rect(319, 649.984, 569, 703.984))
    launcher.getBoundingClientRect = vi.fn(() => {
      const shift = Number.parseFloat(dock.style.getPropertyValue('--commerce-launcher-shift-y')) || 0
      return rect(544, 710 - shift, 588, 754 - shift)
    })
    window.dispatchEvent(new Event('resize'))

    await waitFor(() => expect(dock).toHaveAttribute('data-commerce-placement', 'above'))
    expect(Number.parseFloat(dock.style.getPropertyValue('--commerce-launcher-shift-y'))).toBeCloseTo(116.016, 5)
    expect(action.getBoundingClientRect).toHaveBeenCalled()
    expect(launcher.getBoundingClientRect).toHaveBeenCalled()
  })

  it('does not shift when horizontal ranges do not intersect and keeps the launcher keyboard-focusable', async () => {
    const view = render(<><form className="commerce-workspace"><button data-commerce-primary-action>提交</button></form><GlobalMusicDock commerceMode /></>)
    const action = screen.getByRole('button', { name: '提交' })
    const launcher = screen.getByRole('button', { name: '打开音乐播放器' })
    action.getBoundingClientRect = vi.fn(() => rect(20, 650, 280, 704))
    launcher.getBoundingClientRect = vi.fn(() => rect(544, 710, 588, 754))
    window.dispatchEvent(new Event('resize'))

    await waitFor(() => expect(view.container.querySelector('.music-dock')).toHaveStyle('--commerce-launcher-shift-y: 0px'))
    await userEvent.tab()
    await userEvent.tab()
    expect(launcher).toHaveFocus()
  })
})
