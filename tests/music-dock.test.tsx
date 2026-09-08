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

import { GlobalMusicDock } from '../src/music/GlobalMusicDock'

describe('mobile commerce music launcher', () => {
  beforeEach(() => {
    class IntersectionObserverMock {
      constructor(private callback: IntersectionObserverCallback) {}
      observe(target: Element) {
        this.callback([{ isIntersecting: true, target } as IntersectionObserverEntry], this as unknown as IntersectionObserver)
      }
      disconnect() {}
      unobserve() {}
      takeRecords() { return [] }
      root = null
      rootMargin = ''
      thresholds = []
    }
    vi.stubGlobal('IntersectionObserver', IntersectionObserverMock)
  })

  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
  })

  it('only enables submit clearance for an actually visible enabled action and keeps the launcher keyboard-focusable', async () => {
    const view = render(<><form className="commerce-workspace"><button className="commerce-submit">提交</button></form><GlobalMusicDock commerceMode /></>)
    await waitFor(() => expect(view.container.querySelector('.music-dock')).toHaveClass('has-visible-commerce-action'))

    const launcher = screen.getByRole('button', { name: '打开音乐播放器' })
    await userEvent.tab()
    await userEvent.tab()
    expect(launcher).toHaveFocus()
  })

  it('does not reserve fixed clearance for a disabled action', () => {
    const view = render(<><form className="commerce-workspace"><button className="commerce-submit" disabled>提交</button></form><GlobalMusicDock commerceMode /></>)
    expect(view.container.querySelector('.music-dock')).not.toHaveClass('has-visible-commerce-action')
  })
})
