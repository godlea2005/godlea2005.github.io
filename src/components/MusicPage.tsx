import { useEffect, useState } from 'react'
import '../music.css'

const tracks = [
  { title: '夜航信号', artist: 'Wenhao Studio', duration: '3:42', hue: '246' },
  { title: '雨后的工作台', artist: 'Ambient Notes', duration: '4:18', hue: '188' },
  { title: '像素与月光', artist: 'Digital Sketches', duration: '2:56', hue: '322' },
  { title: '凌晨四点的界面', artist: 'Quiet Systems', duration: '3:28', hue: '35' },
]

const lyrics = ['夜色在屏幕边缘缓慢经过', '一束信号穿过安静的城市', '把没有说完的想法留在这里', '等待下一次播放']

export function MusicPage() {
  const [trackIndex, setTrackIndex] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [progress, setProgress] = useState(18)
  const [volume, setVolume] = useState(60)
  const [playlistOpen, setPlaylistOpen] = useState(false)
  const [lyricsOpen, setLyricsOpen] = useState(true)
  const [mode, setMode] = useState<'列表循环' | '单曲循环' | '随机播放'>('列表循环')
  const track = tracks[trackIndex]

  useEffect(() => {
    if (!playing) return
    const timer = window.setInterval(() => setProgress((value) => value >= 100 ? 0 : value + 0.35), 250)
    return () => window.clearInterval(timer)
  }, [playing])

  const changeTrack = (offset: number) => {
    setTrackIndex((value) => (value + offset + tracks.length) % tracks.length)
    setProgress(0)
    setPlaying(true)
  }

  const cycleMode = () => setMode((value) => value === '列表循环' ? '单曲循环' : value === '单曲循环' ? '随机播放' : '列表循环')

  return (
    <main className="immersive-music" style={{ '--track-hue': track.hue } as React.CSSProperties}>
      <div className="music-atmosphere" aria-hidden="true"><div className="music-orb" /><div className="music-rings"><i/><i/><i/><i/></div><div className={playing ? 'spectrum active' : 'spectrum'}>{Array.from({ length: 56 }, (_, index) => <i key={index} style={{ '--bar': `${20 + ((index * 17) % 72)}%`, '--delay': `${(index % 9) * -0.08}s` } as React.CSSProperties} />)}</div></div>
      <div className="music-page-top"><a href="#top">← 返回主页</a><div><span>WENHAO / MUSIC</span><b>沉浸式可视化</b></div><button onClick={() => setPlaylistOpen(!playlistOpen)}>☷ 歌单</button></div>
      <section className="track-identity" aria-label="当前曲目"><p>NOW PLAYING / {String(trackIndex + 1).padStart(2, '0')}</p><h1>{track.title}</h1><span>{track.artist}</span></section>
      {lyricsOpen && <section className="floating-lyrics" aria-label="歌词">{lyrics.map((line, index) => <p className={Math.floor(progress / 25) === index ? 'active' : ''} key={line}>{line}</p>)}</section>}
      <section className="music-control-deck" aria-label="音乐播放器">
        <div className="progress-row"><span>{Math.floor(progress * 2.22 / 60)}:{String(Math.floor(progress * 2.22 % 60)).padStart(2, '0')}</span><input aria-label="进度" type="range" min="0" max="100" step="0.1" value={progress} onChange={(event) => setProgress(Number(event.target.value))}/><span>{track.duration}</span></div>
        <div className="control-row"><button onClick={cycleMode} title={mode}>↻ <span>{mode}</span></button><div><button onClick={() => changeTrack(-1)} aria-label="上一首">‹‹</button><button className="primary-play" onClick={() => setPlaying(!playing)} aria-label={playing ? '暂停' : '播放'}>{playing ? 'Ⅱ' : '▶'}</button><button onClick={() => changeTrack(1)} aria-label="下一首">››</button></div><label>VOL <input aria-label="音量" type="range" min="0" max="100" value={volume} onChange={(event) => setVolume(Number(event.target.value))}/><span>{volume}</span></label></div>
        <div className="secondary-row"><button onClick={() => setLyricsOpen(!lyricsOpen)}>{lyricsOpen ? '隐藏歌词' : '显示歌词'}</button><span>授权音源接入前为交互演示</span></div>
      </section>
      <aside className={playlistOpen ? 'music-playlist open' : 'music-playlist'} aria-label="歌单切换"><header><div><small>PLAYLIST</small><h2>歌单切换</h2></div><b>{String(tracks.length).padStart(2, '0')}</b><button onClick={() => setPlaylistOpen(false)}>×</button></header>{tracks.map((item, index) => <button className={index === trackIndex ? 'selected' : ''} onClick={() => { setTrackIndex(index); setProgress(0); setPlaying(true); setPlaylistOpen(false) }} key={item.title}><span>{String(index + 1).padStart(2, '0')}</span><div><b>{item.title}</b><small>{item.artist}</small></div><em>{item.duration}</em></button>)}</aside>
    </main>
  )
}
