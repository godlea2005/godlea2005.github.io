import { useMusic } from './MusicProvider'

export function RecordSleeve() {
  const { track, trackIndex, playing } = useMusic()
  const arcId = `vinyl-arc-${track.id}`
  return <section className="record-stage" aria-label={`正在播放：${track.title}，${track.artist}`}>
    <div className="vinyl-positioner" aria-hidden="true">
      <div className={playing ? 'vinyl is-spinning' : 'vinyl'}>
        <div className="vinyl-grooves" />
        <div className="vinyl-label" style={{ background: track.accent }}>
          <svg className="vinyl-label-type" viewBox="0 0 100 100">
            <defs><path id={arcId} d="M 15 57 A 36 36 0 0 1 85 57" /></defs>
            <text><textPath href={`#${arcId}`} startOffset="50%" textAnchor="middle">WENHAO · PRIVATE AUDIO · 2026</textPath></text>
          </svg>
          <i />
        </div>
      </div>
      <div className="vertical-track-copy">
        <strong>{track.title}</strong>
        <span>{track.artist} / NOW PLAYING</span>
      </div>
    </div>
    <div className="album-sleeve" style={{ '--accent': track.accent, '--accent-rgb': track.accentRgb } as React.CSSProperties}>
      <div className="cover-index">W/{String(trackIndex + 1).padStart(2, '0')}</div>
      <div className="cover-signal"><i /><i /><i /><i /><i /></div>
      <div className="cover-copy"><small>PRIVATE FREQUENCY</small><strong className={track.title.length > 4 ? 'is-extended' : ''}>{track.title}</strong><span>WENHAO AUDIO ARCHIVE · 2026</span></div>
    </div>
    <div className="compact-track-copy">
      <strong>{track.title}</strong>
      <span>{track.artist} / NOW PLAYING</span>
    </div>
  </section>
}
