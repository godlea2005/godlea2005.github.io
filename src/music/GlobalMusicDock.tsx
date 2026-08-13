import { useEffect, useRef, useState } from 'react'
import './music-experience.css'
import { useMusic } from './MusicProvider'
import { CloseIcon, ListIcon, MutedIcon, NextIcon, PauseIcon, PlayIcon, PreviousIcon, VolumeIcon } from './icons'
import { PlaylistOverlay } from './PlaylistOverlay'
import { formatTime } from './TransportControls'

export function GlobalMusicDock() {
  const music = useMusic()
  const dockRef = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const [playlistOpen, setPlaylistOpen] = useState(false)
  const progress = music.duration ? music.currentTime / music.duration * 100 : 0

  useEffect(() => {
    if (!open) return
    const closeOutside = (event: PointerEvent) => {
      if (!dockRef.current?.contains(event.target as Node)) setOpen(false)
    }
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !playlistOpen) setOpen(false)
    }
    document.addEventListener('pointerdown', closeOutside)
    window.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('pointerdown', closeOutside)
      window.removeEventListener('keydown', closeOnEscape)
    }
  }, [open, playlistOpen])

  return <>
    <div className={`music-dock${open ? ' is-open' : ''}${music.playing ? ' is-playing' : ''}`} ref={dockRef} style={{ '--accent': music.track.accent } as React.CSSProperties}>
      <aside className="music-popover" id="global-music-player" aria-label="全站音乐播放器" aria-hidden={!open} inert={open ? undefined : true}>
        <header className="music-popover-header">
          <div className="music-popover-cover" aria-hidden="true"><i /></div>
          <div className="music-popover-copy"><small>NOW {music.playing ? 'PLAYING' : 'READY'}</small><strong>{music.track.title}</strong><span>{music.track.artist}</span></div>
          <button className="music-popover-close" type="button" onClick={() => setOpen(false)} aria-label="收起音乐播放器"><CloseIcon size={18} /></button>
        </header>

        <div className="music-popover-progress">
          <div><span>{formatTime(music.currentTime)}</span><span>{formatTime(music.duration)}</span></div>
          <input
            aria-label="播放进度"
            type="range"
            min="0"
            max={music.duration || 0}
            step="0.1"
            value={music.currentTime}
            onChange={(event) => music.seek(Number(event.target.value))}
            style={{ '--progress': `${progress}%` } as React.CSSProperties}
          />
        </div>

        <div className="music-popover-controls">
          <button type="button" onClick={music.previous} aria-label="上一首"><PreviousIcon /></button>
          <button className="music-popover-play" type="button" onClick={() => void music.togglePlay()} aria-label={music.playing ? '暂停' : '播放'}>{music.playing ? <PauseIcon size={22} /> : <PlayIcon size={22} />}</button>
          <button type="button" onClick={music.next} aria-label="下一首"><NextIcon /></button>
          <span className="music-control-divider" />
          <button type="button" onClick={music.toggleMute} aria-label={music.muted ? '取消静音' : '静音'}>{music.muted ? <MutedIcon /> : <VolumeIcon />}</button>
          <input className="music-popover-volume" aria-label="音量" type="range" min="0" max="1" step="0.01" value={music.muted ? 0 : music.volume} onChange={(event) => music.setVolume(Number(event.target.value))} />
          <button type="button" onClick={() => setPlaylistOpen(true)} aria-label="打开歌单"><ListIcon /></button>
        </div>

        <footer className="music-popover-footer">
          <span><i className={music.playing ? 'is-live' : ''} />{music.error || (music.status === 'buffering' ? 'BUFFERING' : 'LOCAL AUDIO')}</span>
          <a href="#music" onClick={() => setOpen(false)}>音乐可视化 <b>↗</b></a>
        </footer>
      </aside>

      <button
        className="music-launcher"
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-label={open ? '收起音乐播放器' : '打开音乐播放器'}
        aria-expanded={open}
        aria-controls="global-music-player"
      >
        <span className="music-note" aria-hidden="true">♪</span>
        <span className="music-equalizer" aria-hidden="true"><i /><i /><i /></span>
      </button>
    </div>
    <PlaylistOverlay open={playlistOpen} onClose={() => setPlaylistOpen(false)} />
  </>
}
