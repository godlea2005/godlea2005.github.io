import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('../src/music/MusicProvider', () => ({ useMusic: () => ({
  track: { accent: '#ffffff', accentRgb: '255,255,255' }, playing: false, trackIndex: 0, selectTrack: vi.fn(),
  tracks: [{ id: 'first', title: '测试音乐', artist: '测试作者', accent: '#ffffff', accentRgb: '255,255,255', durationLabel: '3:00' }],
}) }))
vi.mock('../src/music/AudioTerrain', () => ({ AudioTerrain: () => null }))
vi.mock('../src/music/RecordSleeve', () => ({ RecordSleeve: () => null }))
vi.mock('../src/music/SyncedLyrics', () => ({ SyncedLyrics: () => null }))
vi.mock('../src/music/TransportControls', () => ({ TransportControls: () => null }))

import { MusicPage } from '../src/components/MusicPage'

afterEach(cleanup)

describe('compact music page controls', () => {
  it('retains accessible names when mobile CSS hides visible header labels', async () => {
    const { container } = render(<MusicPage />)
    const header = container.querySelector<HTMLElement>('.music-local-header')!
    header.querySelectorAll<HTMLElement>('a span, button span').forEach((label) => { label.style.display = 'none' })
    expect(within(header).getByRole('link', { name: '返回主站' })).toHaveAttribute('href', '#top')
    await userEvent.click(within(header).getByRole('button', { name: '打开歌单' }))
    expect(screen.getByRole('dialog', { name: '播放列表' })).toBeInTheDocument()
  })

  it('uses the real playlist focus boundary from the immersive music page', async () => {
    const user = userEvent.setup()
    const { container } = render(<MusicPage />)
    const trigger = screen.getByRole('button', { name: '打开歌单' })
    trigger.focus()
    await user.keyboard('{Enter}')
    const dialog = screen.getByRole('dialog', { name: '播放列表' })
    const close = within(dialog).getByRole('button', { name: '关闭歌单' })
    const track = within(dialog).getByRole('button', { name: /测试音乐/ })
    expect(container).toHaveAttribute('inert')
    expect(close).toHaveFocus()
    await user.tab({ shift: true })
    expect(track).toHaveFocus()
    await user.tab()
    expect(close).toHaveFocus()
    await user.keyboard('{Escape}')
    expect(container).not.toHaveAttribute('inert')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(trigger).toHaveFocus()
  })
})
