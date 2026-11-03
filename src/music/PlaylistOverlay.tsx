import { ModalSurface } from '../components/ModalSurface'
import { useMusic } from './MusicProvider'
import { CloseIcon, PauseIcon, PlayIcon } from './icons'

export function PlaylistOverlay({ open, onClose }: { open: boolean; onClose: () => void }) {
  const music = useMusic()

  if (!open) return null

  return <ModalSurface className="playlist-layer is-open" panelClassName="playlist-panel" label="播放列表" onClose={onClose}>
      <header>
        <div><small>PLAYLIST / {String(music.tracks.length).padStart(2, '0')}</small><h2>歌单切换</h2><p>PRIVATE AUDIO ARCHIVE</p></div>
        <button type="button" data-modal-focus onClick={onClose} aria-label="关闭歌单"><CloseIcon size={24} /></button>
      </header>
      <div className="playlist-tracks">
        {music.tracks.map((item, index) => {
          const selected = index === music.trackIndex
          return <button
            type="button"
            className={selected ? 'playlist-item is-current' : 'playlist-item'}
            onClick={() => { music.selectTrack(index); onClose() }}
            key={item.id}
          >
            <span className="playlist-cover" style={{ '--accent': item.accent, '--accent-rgb': item.accentRgb } as React.CSSProperties}>{item.title.slice(0, 1)}</span>
            <span className="playlist-copy"><strong>{item.title}</strong><small>{item.artist}</small></span>
            <span className="playlist-duration">{selected && music.playing ? <><i /><i /><i /></> : item.durationLabel}</span>
            <span className="playlist-action">{selected && music.playing ? <PauseIcon /> : <PlayIcon />}</span>
          </button>
        })}
      </div>
      <footer><span>LOCAL FILES</span><span>LOSSLESS SIGNAL</span></footer>
  </ModalSurface>
}
