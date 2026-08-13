import { useMusic } from './MusicProvider'
import { ListIcon, MutedIcon, NextIcon, PauseIcon, PlayIcon, PreviousIcon, RepeatIcon, RepeatOneIcon, ShuffleIcon, VolumeIcon } from './icons'

export const formatTime = (seconds: number) => Number.isFinite(seconds)
  ? `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`
  : '0:00'

function ModeIcon({ mode }: { mode: ReturnType<typeof useMusic>['mode'] }) {
  if (mode === 'single') return <RepeatOneIcon />
  if (mode === 'shuffle') return <ShuffleIcon />
  return <RepeatIcon />
}

export function TransportControls({ onOpenPlaylist }: { onOpenPlaylist: () => void }) {
  const music = useMusic()
  const progress = music.duration ? music.currentTime / music.duration * 100 : 0

  return <section className="transport" aria-label="播放控制">
    <div className="transport-progress desktop-transport">
      <span>{formatTime(music.currentTime)}</span>
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
      <span>{formatTime(music.duration)}</span>
    </div>
    <div className="transport-main desktop-transport">
      <div className="transport-primary">
        <button type="button" onClick={music.previous} aria-label="上一首"><PreviousIcon /></button>
        <button type="button" className="main-play" onClick={() => void music.togglePlay()} aria-label={music.playing ? '暂停' : '播放'}>
          {music.playing ? <PauseIcon size={23} /> : <PlayIcon size={23} />}
        </button>
        <button type="button" onClick={music.next} aria-label="下一首"><NextIcon /></button>
      </div>
      <div className="transport-secondary">
        <button type="button" onClick={music.cycleMode} aria-label={`播放模式：${music.mode}`}><ModeIcon mode={music.mode} /></button>
        <button type="button" onClick={onOpenPlaylist} aria-label="打开歌单"><ListIcon /></button>
        <div className="volume-control">
          <button type="button" onClick={music.toggleMute} aria-label={music.muted ? '取消静音' : '静音'}>{music.muted ? <MutedIcon /> : <VolumeIcon />}</button>
          <input aria-label="音量" type="range" min="0" max="1" step="0.01" value={music.muted ? 0 : music.volume} onChange={(event) => music.setVolume(Number(event.target.value))} />
        </div>
      </div>
    </div>
    <div className="player-status desktop-transport"><i className={music.playing ? 'is-live' : ''} />{music.error || (music.status === 'buffering' ? 'BUFFERING' : music.playing ? 'LIVE AUDIO REACTIVE' : 'READY / LOCAL AUDIO')}</div>
    <div className="mobile-transport">
      <div className="mobile-player-top">
        <div className="mobile-track-meta"><strong>{music.track.title}</strong><span>{music.track.artist}</span></div>
        <button type="button" onClick={music.cycleMode} aria-label={`播放模式：${music.mode}`}><ModeIcon mode={music.mode} /></button>
        <button type="button" className="mobile-main-play" onClick={() => void music.togglePlay()} aria-label={music.playing ? '暂停' : '播放'}>{music.playing ? <PauseIcon size={21} /> : <PlayIcon size={21} />}</button>
        <button type="button" onClick={onOpenPlaylist} aria-label="打开歌单"><ListIcon /></button>
        <button type="button" onClick={music.toggleMute} aria-label={music.muted ? '取消静音' : '静音'}>{music.muted ? <MutedIcon /> : <VolumeIcon />}</button>
      </div>
      <div className="mobile-player-bottom">
        <button type="button" onClick={music.previous} aria-label="上一首"><PreviousIcon /></button>
        <span>{formatTime(music.currentTime)}</span>
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
        <span>{formatTime(music.duration)}</span>
        <button type="button" onClick={music.next} aria-label="下一首"><NextIcon /></button>
      </div>
    </div>
  </section>
}
