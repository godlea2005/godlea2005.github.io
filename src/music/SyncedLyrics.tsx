import { useMemo } from 'react'
import { useMusic } from './MusicProvider'

export function SyncedLyrics() {
  const { lyrics, activeLyric, track } = useMusic()
  const visibleActiveLyric = Math.max(activeLyric, 0)
  const windowedLyrics = useMemo(() => {
    if (!lyrics.length) return []
    const center = Math.max(activeLyric, 0)
    const start = Math.max(0, Math.min(center - 4, lyrics.length - 9))
    return lyrics.slice(start, start + 9).map((line, offset) => ({ ...line, index: start + offset }))
  }, [activeLyric, lyrics])

  return <section className="synced-lyrics notranslate" translate="no" aria-label={`${track.title} 歌词`}>
    <div className="lyric-eyebrow"><i /> LYRIC SIGNAL <span>{String(Math.max(activeLyric + 1, 0)).padStart(2, '0')}</span></div>
    <div className="lyric-window" aria-live="polite">
      {windowedLyrics.length ? windowedLyrics.map((line) => {
        const distance = Math.abs(line.index - visibleActiveLyric)
        return <p
          key={`${line.time}-${line.text}`}
          className={line.index === visibleActiveLyric ? 'is-active' : ''}
          style={{ '--distance': distance } as React.CSSProperties}
        >{line.text}</p>
      }) : <><p className="is-active">歌词信号正在接入</p><p>音乐开始后将按时间轴同步</p></>}
    </div>
  </section>
}
