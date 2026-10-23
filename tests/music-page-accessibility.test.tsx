import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('../src/music/MusicProvider', () => ({ useMusic: () => ({ track: { accent: '#ffffff', accentRgb: '255,255,255' }, tracks: [], playing: false }) }))
vi.mock('../src/music/AudioTerrain', () => ({ AudioTerrain: () => null }))
vi.mock('../src/music/RecordSleeve', () => ({ RecordSleeve: () => null }))
vi.mock('../src/music/SyncedLyrics', () => ({ SyncedLyrics: () => null }))
vi.mock('../src/music/TransportControls', () => ({ TransportControls: () => null }))
vi.mock('../src/music/PlaylistOverlay', () => ({ PlaylistOverlay: ({ open }: { open: boolean }) => open ? <div role="dialog" aria-label="播放列表" /> : null }))

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
})
