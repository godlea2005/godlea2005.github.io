import { useCallback, useState } from 'react'
import '../music/music-experience.css'
import { AudioTerrain } from '../music/AudioTerrain'
import { RecordSleeve } from '../music/RecordSleeve'
import { SyncedLyrics } from '../music/SyncedLyrics'
import { TransportControls } from '../music/TransportControls'
import { PlaylistOverlay } from '../music/PlaylistOverlay'
import { useMusic } from '../music/MusicProvider'
import { ArrowLeftIcon, ListIcon } from '../music/icons'

export function MusicPage() {
  const [playlistOpen, setPlaylistOpen] = useState(false)
  const music = useMusic()
  const closePlaylist = useCallback(() => setPlaylistOpen(false), [])

  return <main className="music-experience" style={{ '--accent': music.track.accent, '--accent-rgb': music.track.accentRgb } as React.CSSProperties}>
    <AudioTerrain />
    <div className="music-vignette" aria-hidden="true" />
    <header className="music-local-header">
      <a href="#top"><ArrowLeftIcon /><span>返回主站</span></a>
      <div><i className={music.playing ? 'is-live' : ''} /><span>AUDIO FIELD</span><b>WENHAO / 2026</b></div>
      <button type="button" onClick={() => setPlaylistOpen(true)}><ListIcon /><span>歌单</span><em>{String(music.tracks.length).padStart(2, '0')}</em></button>
    </header>
    <div className="music-stage-grid">
      <RecordSleeve />
      <SyncedLyrics />
    </div>
    <TransportControls onOpenPlaylist={() => setPlaylistOpen(true)} />
    <div className="music-coordinate" aria-hidden="true"><span>31.2304° N</span><i /><span>121.4737° E</span></div>
    <PlaylistOverlay open={playlistOpen} onClose={closePlaylist} />
  </main>
}
