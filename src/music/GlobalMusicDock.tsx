import { useEffect, useRef, useState } from 'react'
import './music-experience.css'
import { useMusic } from './MusicProvider'
import { CloseIcon, ListIcon, MutedIcon, NextIcon, PauseIcon, PlayIcon, PreviousIcon, VolumeIcon } from './icons'
import { PlaylistOverlay } from './PlaylistOverlay'
import { formatTime } from './TransportControls'

const COMMERCE_CONTROL_GAP_PX = 12
const COMMERCE_VIEWPORT_INSET_PX = 12
/** @deprecated The launcher now uses measured geometry; retained for import compatibility only. */
export const COMMERCE_MUSIC_ACTION_CLEARANCE_PX = 78

type RectLike = Pick<DOMRect, 'left' | 'right' | 'top' | 'bottom' | 'width' | 'height'>
type CommerceLauncherPlacement = {
  shiftX: number
  shiftY: number
  side: 'unchanged' | 'above' | 'below' | 'left' | 'right'
}

const rangesOverlap = (firstStart: number, firstEnd: number, secondStart: number, secondEnd: number) =>
  firstStart < secondEnd && firstEnd > secondStart

/** Resolve against the launcher's unshifted fixed position, even after a prior measurement moved it. */
export function calculateCommerceLauncherPlacement({
  actionRect,
  launcherRect,
  viewportWidth,
  viewportHeight,
  currentShiftX = 0,
  currentShiftY = 0,
}: {
  actionRect: RectLike
  launcherRect: RectLike
  viewportWidth: number
  viewportHeight: number
  currentShiftX?: number
  currentShiftY?: number
}): CommerceLauncherPlacement {
  const base = {
    left: launcherRect.left - currentShiftX,
    right: launcherRect.right - currentShiftX,
    top: launcherRect.top + currentShiftY,
    bottom: launcherRect.bottom + currentShiftY,
    width: launcherRect.width,
    height: launcherRect.height,
  }
  if (!rangesOverlap(actionRect.left, actionRect.right, base.left, base.right)) {
    return { shiftX: 0, shiftY: 0, side: 'unchanged' }
  }
  const verticalGap = base.top >= actionRect.bottom
    ? base.top - actionRect.bottom
    : actionRect.top >= base.bottom ? actionRect.top - base.bottom : -1
  if (verticalGap >= COMMERCE_CONTROL_GAP_PX) {
    return { shiftX: 0, shiftY: 0, side: 'unchanged' }
  }

  const aboveShift = base.bottom - (actionRect.top - COMMERCE_CONTROL_GAP_PX)
  const belowShift = base.top - (actionRect.bottom + COMMERCE_CONTROL_GAP_PX)
  const aboveFits = base.top - aboveShift >= COMMERCE_VIEWPORT_INSET_PX
  const belowFits = base.bottom - belowShift <= viewportHeight - COMMERCE_VIEWPORT_INSET_PX
  const preferAbove = (actionRect.top + actionRect.bottom) / 2 >= viewportHeight / 2
  if (preferAbove && aboveFits) return { shiftX: 0, shiftY: aboveShift, side: 'above' }
  if (!preferAbove && belowFits) return { shiftX: 0, shiftY: belowShift, side: 'below' }
  if (aboveFits) return { shiftX: 0, shiftY: aboveShift, side: 'above' }
  if (belowFits) return { shiftX: 0, shiftY: belowShift, side: 'below' }

  const leftShift = actionRect.left - COMMERCE_CONTROL_GAP_PX - base.right
  const rightShift = actionRect.right + COMMERCE_CONTROL_GAP_PX - base.left
  const leftFits = base.left + leftShift >= COMMERCE_VIEWPORT_INSET_PX
  const rightFits = base.right + rightShift <= viewportWidth - COMMERCE_VIEWPORT_INSET_PX
  if (leftFits || rightFits) {
    if (leftFits && (!rightFits || Math.abs(leftShift) <= Math.abs(rightShift))) {
      return { shiftX: leftShift, shiftY: 0, side: 'left' }
    }
    return { shiftX: rightShift, shiftY: 0, side: 'right' }
  }
  return { shiftX: 0, shiftY: 0, side: 'unchanged' }
}

export function GlobalMusicDock({ commerceMode = false }: { commerceMode?: boolean }) {
  const music = useMusic()
  const dockRef = useRef<HTMLDivElement>(null)
  const launcherRef = useRef<HTMLButtonElement>(null)
  const [open, setOpen] = useState(false)
  const [playlistOpen, setPlaylistOpen] = useState(false)
  const [commercePlacement, setCommercePlacement] = useState<CommerceLauncherPlacement>({ shiftX: 0, shiftY: 0, side: 'unchanged' })
  const commercePlacementRef = useRef(commercePlacement)
  commercePlacementRef.current = commercePlacement
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

  useEffect(() => {
    if (!commerceMode) {
      setCommercePlacement({ shiftX: 0, shiftY: 0, side: 'unchanged' })
      return
    }
    let frame: number | null = null
    let observedAction: HTMLElement | null = null
    const resizeObserver = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => schedule())
    const visiblePrimaryAction = () => Array.from(document.querySelectorAll<HTMLElement>('[data-commerce-primary-action]'))
      .find((candidate) => {
        const candidateRect = candidate.getBoundingClientRect()
        const style = window.getComputedStyle(candidate)
        return candidateRect.width > 0 && candidateRect.height > 0
          && candidateRect.bottom > 0 && candidateRect.top < window.innerHeight
          && style.display !== 'none' && style.visibility !== 'hidden'
      }) ?? null
    const measure = () => {
      const launcher = launcherRef.current
      const action = visiblePrimaryAction()
      if (observedAction !== action) {
        if (observedAction) resizeObserver?.unobserve(observedAction)
        observedAction = action
        if (action) resizeObserver?.observe(action)
      }
      if (!launcher || !action) {
        setCommercePlacement((current) => current.shiftX || current.shiftY
          ? { shiftX: 0, shiftY: 0, side: 'unchanged' }
          : current)
        return
      }
      const current = commercePlacementRef.current
      const next = calculateCommerceLauncherPlacement({
        actionRect: action.getBoundingClientRect(),
        launcherRect: launcher.getBoundingClientRect(),
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight,
        currentShiftX: current.shiftX,
        currentShiftY: current.shiftY,
      })
      setCommercePlacement((value) => value.shiftX === next.shiftX && value.shiftY === next.shiftY && value.side === next.side ? value : next)
    }
    function schedule() {
      if (frame !== null) return
      frame = window.requestAnimationFrame(() => {
        frame = null
        measure()
      })
    }
    resizeObserver?.observe(launcherRef.current!)
    const mutationObserver = new MutationObserver(schedule)
    mutationObserver.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['class', 'style', 'hidden', 'disabled', 'data-commerce-primary-action'],
    })
    window.addEventListener('resize', schedule)
    window.addEventListener('scroll', schedule, true)
    schedule()
    return () => {
      if (frame !== null) window.cancelAnimationFrame(frame)
      window.removeEventListener('resize', schedule)
      window.removeEventListener('scroll', schedule, true)
      mutationObserver.disconnect()
      resizeObserver?.disconnect()
    }
  }, [commerceMode])

  return <>
    <div className={`music-dock${open ? ' is-open' : ''}${music.playing ? ' is-playing' : ''}${commerceMode ? ' is-commerce' : ''}`} ref={dockRef} data-commerce-placement={commercePlacement.side} style={{ '--accent': music.track.accent, '--commerce-launcher-shift-x': `${commercePlacement.shiftX}px`, '--commerce-launcher-shift-y': `${commercePlacement.shiftY}px` } as React.CSSProperties}>
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
        ref={launcherRef}
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
