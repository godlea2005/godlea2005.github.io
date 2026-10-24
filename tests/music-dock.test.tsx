import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { readFileSync } from 'node:fs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const musicActions = vi.hoisted(() => ({ selectTrack: vi.fn() }))
vi.mock('../src/music/MusicProvider', () => ({
  useMusic: () => ({
    playing: false, duration: 0, currentTime: 0, muted: false, volume: 0.7,
    error: '', status: 'idle', track: { title: '测试音乐', artist: '测试作者', accent: '#7dffb2' },
    trackIndex: 0, tracks: [
      { id: 'first', title: '测试音乐', artist: '测试作者', accent: '#7dffb2', durationLabel: '3:00' },
      { id: 'second', title: '第二首', artist: '测试作者', accent: '#7dffb2', durationLabel: '4:00' },
    ], selectTrack: musicActions.selectTrack,
    seek: vi.fn(), previous: vi.fn(), togglePlay: vi.fn(), next: vi.fn(), toggleMute: vi.fn(), setVolume: vi.fn(),
  }),
}))

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
    vi.clearAllMocks()
    vi.unstubAllGlobals()
  })

  it('shows only an exact 48px collapsed launcher until activation', async () => {
    const style = document.createElement('style')
    style.textContent = readFileSync('src/music/music-experience.css', 'utf8')
    document.head.append(style)
    try {
      render(<GlobalMusicDock />)
      const launcher = screen.getByRole('button', { name: '打开音乐播放器' })
      expect(getComputedStyle(launcher).width).toBe('48px')
      expect(getComputedStyle(launcher).height).toBe('48px')
      expect(screen.getAllByRole('button')).toEqual([launcher])
      expect(screen.queryByRole('button', { name: '播放' })).not.toBeInTheDocument()
      expect(launcher).toHaveAttribute('aria-expanded', 'false')
      await userEvent.click(launcher)
      expect(screen.getByRole('button', { name: '播放' })).toBeInTheDocument()
      expect(launcher).toHaveAttribute('aria-expanded', 'true')
    } finally {
      style.remove()
    }
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

  it('keeps the launcher 12px clear of the guestbook composer without commerce mode', async () => {
    const view = render(<><form className="guestbook-composer"><textarea aria-label="留言内容" /></form><GlobalMusicDock guestbookMode /></>)
    const composer = view.container.querySelector<HTMLElement>('.guestbook-composer')!
    const launcher = screen.getByRole('button', { name: '打开音乐播放器' })
    const dock = view.container.querySelector<HTMLElement>('.music-dock')!
    composer.getBoundingClientRect = vi.fn(() => rect(17, 742, 373, 863))
    launcher.getBoundingClientRect = vi.fn(() => {
      const shift = Number.parseFloat(dock.style.getPropertyValue('--commerce-launcher-shift-y')) || 0
      return rect(330, 784 - shift, 378, 832 - shift)
    })
    window.dispatchEvent(new Event('resize'))
    await waitFor(() => expect(dock).toHaveAttribute('data-commerce-placement', 'above'))
    expect(Number.parseFloat(dock.style.getPropertyValue('--commerce-launcher-shift-y'))).toBe(102)
    const css = readFileSync('src/music/music-experience.css', 'utf8')
    expect(css).toMatch(/\.site-shell:has\(\.guestbook-composer :focus\) \.music-dock:not\(\.is-open\)\s*\{\s*visibility: hidden/s)
  })

  it.each([
    { width: 390, height: 844, composerRect: rect(17, 742, 373, 863), launcherRect: rect(330, 784, 378, 832) },
    { width: 768, height: 1024, composerRect: rect(38, 838, 730, 965), launcherRect: rect(703, 959, 751, 1007) },
    { width: 1024, height: 900, composerRect: rect(58, 714, 966, 841), launcherRect: rect(953, 829, 1001, 877) },
  ])('shares the measured guestbook offset with the real open player at $width px', async ({ width, height, composerRect, launcherRect }) => {
    vi.stubGlobal('innerWidth', width)
    vi.stubGlobal('innerHeight', height)
    const style = document.createElement('style')
    style.textContent = readFileSync('src/music/music-experience.css', 'utf8')
    document.head.append(style)
    try {
      const view = render(<><form className="guestbook-composer"><textarea aria-label="留言内容" /></form><GlobalMusicDock guestbookMode /></>)
      const dock = view.container.querySelector<HTMLElement>('.music-dock')!
      const launcher = screen.getByRole('button', { name: '打开音乐播放器' })
      view.container.querySelector<HTMLElement>('.guestbook-composer')!.getBoundingClientRect = () => composerRect
      launcher.getBoundingClientRect = () => {
        const shift = Number.parseFloat(dock.style.getPropertyValue('--commerce-launcher-shift-y')) || 0
        return rect(launcherRect.left, launcherRect.top - shift, launcherRect.right, launcherRect.bottom - shift)
      }
      window.dispatchEvent(new Event('resize'))
      await waitFor(() => expect(dock).toHaveAttribute('data-commerce-placement', 'above'))
      await userEvent.click(launcher)
      const player = screen.getByRole('complementary', { name: '全站音乐播放器' })
      expect(dock).toHaveClass('is-guestbook', 'is-open')
      expect(composerRect.top - launcher.getBoundingClientRect().bottom).toBe(12)
      // The ancestor contract must move the panel too, not just its 48px button.
      expect(getComputedStyle(player).translate).toBe('var(--commerce-launcher-shift-x, 0px) calc(-1 * var(--commerce-launcher-shift-y, 0px))')
      expect(getComputedStyle(player).maxHeight).toContain('var(--commerce-launcher-shift-y, 0px)')
      expect(getComputedStyle(player).overflowY).toBe('auto')
    } finally { style.remove() }
  })

  it.each(['Escape', 'close', 'launcher', 'outside', 'visualization'])('enters the player and restores launcher focus on %s dismissal', async (dismissal) => {
    const user = userEvent.setup()
    const view = render(<><button>Outside</button><GlobalMusicDock /></>)
    const launcher = screen.getByRole('button', { name: '打开音乐播放器' })
    launcher.focus()
    await user.keyboard('{Enter}')
    expect(screen.getByRole('slider', { name: '播放进度' })).toHaveFocus()
    await user.tab()
    expect(screen.getByRole('button', { name: '上一首' })).toHaveFocus()
    if (dismissal === 'Escape') await user.keyboard('{Escape}')
    if (dismissal === 'close') await user.click(view.container.querySelector('.music-popover-close')!)
    if (dismissal === 'launcher') await user.click(launcher)
    if (dismissal === 'outside') await user.click(screen.getByRole('button', { name: 'Outside' }))
    if (dismissal === 'visualization') await user.click(screen.getByRole('link', { name: /音乐可视化/ }))
    expect(launcher).toHaveAttribute('aria-expanded', 'false')
    expect(launcher).toHaveFocus()
    expect(view.container.querySelector('.music-popover')).toHaveAttribute('inert')
  })

  it.each(['textbox', 'textarea'] as const)('keeps the first-click %s focused when it dismisses the player', async (control) => {
    const user = userEvent.setup()
    render(<><form className="guestbook-composer">
      <input aria-label="访客名称" />
      <textarea aria-label="留言内容" />
    </form><GlobalMusicDock guestbookMode /></>)
    const launcher = screen.getByRole('button', { name: '打开音乐播放器' })
    await user.click(launcher)
    expect(screen.getByRole('slider', { name: '播放进度' })).toHaveFocus()
    const field = control === 'textbox' ? screen.getByRole('textbox', { name: '访客名称' }) : screen.getByRole('textbox', { name: '留言内容' })
    await user.click(field)
    expect(launcher).toHaveAttribute('aria-expanded', 'false')
    expect(field).toHaveFocus()
    expect(screen.queryByRole('slider', { name: '播放进度' })).not.toBeInTheDocument()
  })

  it.each(['Escape', 'close', 'keyboard close', 'scrim', 'selection'])('uses the real shared playlist modal lifecycle on %s', async (dismissal) => {
    const user = userEvent.setup()
    const view = render(<GlobalMusicDock />)
    const launcher = screen.getByRole('button', { name: '打开音乐播放器' })
    await user.click(launcher)
    const playlistTrigger = screen.getByRole('button', { name: '打开歌单' })
    await user.click(playlistTrigger)
    const dialog = screen.getByRole('dialog', { name: '播放列表' })
    const close = within(dialog).getByRole('button', { name: '关闭歌单' })
    const last = within(dialog).getByRole('button', { name: /第二首/ })
    expect(close).toHaveFocus()
    expect(view.container).toHaveAttribute('inert')
    expect(document.body.style.overflow).toBe('hidden')
    await user.tab({ shift: true })
    expect(last).toHaveFocus()
    await user.tab()
    expect(close).toHaveFocus()
    if (dismissal === 'Escape') await user.keyboard('{Escape}')
    if (dismissal === 'close') await user.click(close)
    if (dismissal === 'keyboard close') await user.keyboard('{Enter}')
    if (dismissal === 'scrim') await user.click(dialog.parentElement!)
    if (dismissal === 'selection') {
      await user.click(last)
      expect(musicActions.selectTrack).toHaveBeenCalledExactlyOnceWith(1)
    }
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(view.container).not.toHaveAttribute('inert')
    expect(document.body.style.overflow).not.toBe('hidden')
    expect(playlistTrigger).toHaveFocus()
    expect(launcher).toHaveAttribute('aria-expanded', 'true')
    await user.keyboard('{Escape}')
    expect(launcher).toHaveFocus()
  })
})
