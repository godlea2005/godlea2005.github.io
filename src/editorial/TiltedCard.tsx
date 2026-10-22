import { useEffect, useRef, type CSSProperties, type PointerEvent, type ReactNode } from 'react'
import { useMotionProfile } from '../lib/useMotionProfile'
import './tilted-card.css'

export type TiltedCardProps = {
  href: string
  label: string
  children: ReactNode
  className?: string
}

const clampUnit = (value: number) => Math.max(-1, Math.min(1, value))

function resetTilt(element: HTMLAnchorElement | null) {
  if (!element) return
  element.style.setProperty('--tilt-x', '0deg')
  element.style.setProperty('--tilt-y', '0deg')
  element.style.setProperty('--glare-x', '50%')
  element.style.setProperty('--glare-y', '50%')
}

export function TiltedCard({ href, label, children, className }: TiltedCardProps) {
  const cardRef = useRef<HTMLAnchorElement>(null)
  const { reducedMotion, fineHover } = useMotionProfile()

  useEffect(() => {
    if (reducedMotion || !fineHover) resetTilt(cardRef.current)
  }, [fineHover, reducedMotion])

  const handlePointerMove = (event: PointerEvent<HTMLAnchorElement>) => {
    const card = event.currentTarget
    if (reducedMotion || !fineHover) {
      resetTilt(card)
      return
    }

    const bounds = card.getBoundingClientRect()
    if (bounds.width <= 0 || bounds.height <= 0) {
      resetTilt(card)
      return
    }

    const offsetX = clampUnit(((event.clientX - bounds.left) / bounds.width) * 2 - 1)
    const offsetY = clampUnit(((event.clientY - bounds.top) / bounds.height) * 2 - 1)
    card.style.setProperty('--tilt-x', `${-offsetY * 6}deg`)
    card.style.setProperty('--tilt-y', `${offsetX * 6}deg`)
    card.style.setProperty('--glare-x', `${50 + offsetX * 50}%`)
    card.style.setProperty('--glare-y', `${50 + offsetY * 50}%`)
  }

  const initialStyle = {
    '--tilt-x': '0deg',
    '--tilt-y': '0deg',
    '--glare-x': '50%',
    '--glare-y': '50%',
  } as CSSProperties

  return <a
    ref={cardRef}
    className={['tilted-card', className].filter(Boolean).join(' ')}
    href={href}
    aria-label={label}
    data-target-cursor=""
    data-cursor-label="查看案例"
    style={initialStyle}
    onPointerMove={handlePointerMove}
    onPointerLeave={(event) => resetTilt(event.currentTarget)}
    onPointerCancel={(event) => resetTilt(event.currentTarget)}
    onBlur={(event) => resetTilt(event.currentTarget)}
  >{children}</a>
}
