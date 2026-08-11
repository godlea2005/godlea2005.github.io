import { useEffect, useRef, useState, type CSSProperties } from 'react'
import '../music.css'
import '../lyrics.css'
import '../player-control.css'
import { parseLrc, type ParsedLyric } from '../lib/lrc'

type Track = { title: string; artist: string; src: string; lrcSrc: string; hue: string }

const tracks: Track[] = [
  { title: '红色高跟鞋', artist: '蔡健雅', src: '/music/red-heels.mp3', lrcSrc: '/music/red-heels.lrc', hue: '350' },
  { title: '说了再见', artist: '阿杰', src: '/music/said-goodbye.mp3', lrcSrc: '/music/said-goodbye.lrc', hue: '218' },
]

const formatTime = (seconds: number) => Number.isFinite(seconds) ? `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}` : '0:00'

export function MusicPage() {
  const audioRef = useRef<HTMLAudioElement>(null)
  const lyricRef = useRef<HTMLDivElement>(null)
  const [trackIndex, setTrackIndex] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [volume, setVolume] = useState(60)
  const [playlistOpen, setPlaylistOpen] = useState(false)
  const [lyricsOpen, setLyricsOpen] = useState(true)
  const [singleLoop, setSingleLoop] = useState(false)
  const [error, setError] = useState('')
  const [lyrics, setLyrics] = useState<ParsedLyric[]>([])
  const track = tracks[trackIndex]
  const activeLyric = lyrics.reduce((active, line, index) => currentTime >= line.time ? index : active, -1)

  useEffect(() => { if (audioRef.current) audioRef.current.volume = volume / 100 }, [volume])
  useEffect(() => {
    let current = true
    setLyrics([])
    void fetch(track.lrcSrc).then(response => response.ok ? response.text() : '').then(source => {
      if (current) setLyrics(parseLrc(source))
    }).catch(() => { if (current) setLyrics([]) })
    return () => { current = false }
  }, [track.lrcSrc])
  useEffect(() => { lyricRef.current?.querySelector<HTMLElement>('[data-active="true"]')?.scrollIntoView({ behavior: 'smooth', block: 'center' }) }, [activeLyric])

  const togglePlay = async () => {
    const audio = audioRef.current
    if (!audio) return
    setError('')
    try { if (audio.paused) await audio.play(); else audio.pause() } catch { setError('请再次点击播放。') }
  }
  const selectTrack = (index: number) => {
    setTrackIndex(index); setCurrentTime(0); setDuration(0); setPlaylistOpen(false); setError('')
    window.setTimeout(() => { void audioRef.current?.play().catch(() => setPlaying(false)) }, 0)
  }
  const changeTrack = (offset: number) => selectTrack((trackIndex + offset + tracks.length) % tracks.length)

  return <main className="immersive-music" style={{ '--track-hue': track.hue } as CSSProperties}>
    <audio ref={audioRef} src={track.src} preload="metadata" onLoadedMetadata={e => setDuration(e.currentTarget.duration)} onTimeUpdate={e => setCurrentTime(e.currentTarget.currentTime)} onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onEnded={() => { if (singleLoop && audioRef.current) { audioRef.current.currentTime = 0; void audioRef.current.play() } else changeTrack(1) }} onError={() => setError('音频文件加载失败。')} />
    <div className="music-atmosphere" aria-hidden="true"><div className="music-orb"/><div className="music-rings"><i/><i/><i/><i/></div><div className={playing ? 'spectrum active' : 'spectrum'}/></div>
    <div className="music-page-top"><a href="#top">← 返回主页</a><div><span>WENHAO / MUSIC</span><b>沉浸式可视化</b></div><button onClick={() => setPlaylistOpen(true)}>☷ 歌单</button></div>
    <section className="track-identity" aria-label="当前曲目"><p>NOW PLAYING / {String(trackIndex + 1).padStart(2, '0')}</p><h1>{track.title}</h1><span>{track.artist}</span></section>
    {lyricsOpen && <section className="floating-lyrics real-lyrics" aria-label="歌词" ref={lyricRef}>{lyrics.length ? lyrics.map((line, index) => <p data-active={index === activeLyric} className={index === activeLyric ? 'active' : ''} key={`${line.time}-${line.text}`}>{line.text}</p>) : <div className="lyrics-unavailable"><p className="active">歌词待授权导入</p><small>替换对应 LRC 后自动按时间轴滚动</small></div>}</section>}
    <section className="music-control-deck" aria-label="音乐播放器"><div className="progress-row"><span>{formatTime(currentTime)}</span><input aria-label="进度" type="range" min="0" max={duration || 0} step="0.1" value={currentTime} onChange={e => { const value = Number(e.target.value); if (audioRef.current) audioRef.current.currentTime = value; setCurrentTime(value) }}/><span>{formatTime(duration)}</span></div><div className="control-row"><button onClick={() => setSingleLoop(!singleLoop)}>↻ <span>{singleLoop ? '单曲循环' : '列表循环'}</span></button><div><button onClick={() => changeTrack(-1)} aria-label="上一首">‹‹</button><button className="primary-play" onClick={togglePlay} aria-label={playing ? '暂停' : '播放'}><span className={playing ? 'pause-icon' : 'play-icon'} aria-hidden="true" /></button><button onClick={() => changeTrack(1)} aria-label="下一首">››</button></div><label>VOL <input aria-label="音量" type="range" min="0" max="100" value={volume} onChange={e => setVolume(Number(e.target.value))}/><span>{volume}</span></label></div><div className="secondary-row"><button onClick={() => setLyricsOpen(!lyricsOpen)}>{lyricsOpen ? '隐藏歌词' : '显示歌词'}</button><span>{error || 'LOCAL AUDIO / READY'}</span></div></section>
    <aside className={playlistOpen ? 'music-playlist open' : 'music-playlist'} aria-label="歌单切换"><header><div><small>PLAYLIST</small><h2>歌单切换</h2></div><b>{String(tracks.length).padStart(2, '0')}</b><button onClick={() => setPlaylistOpen(false)}>×</button></header>{tracks.map((item, index) => <button className={index === trackIndex ? 'selected' : ''} onClick={() => selectTrack(index)} key={item.title}><span>{String(index + 1).padStart(2, '0')}</span><div><b>{item.title}</b><small>{item.artist}</small></div><em>{index === trackIndex && playing ? 'PLAYING' : 'LOCAL'}</em></button>)}</aside>
  </main>
}
