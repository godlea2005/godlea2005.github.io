import { useEffect, useRef, useState, type CSSProperties } from 'react'
import './target-cursor.css'

type CursorFrame = {
  left: number
  top: number
  width: number
  height: number
  borderRadius: string
  label: string
}

const blockedSelector = 'form, input, textarea, select, [role="slider"], [role="textbox"], [role="combobox"], [contenteditable]:not([contenteditable="false"]), [data-no-target-cursor]'
const modalSelector = '[role="dialog"][aria-modal="true"], dialog[open]'

const supportsCursor = () =>
  typeof window !== 'undefined' &&
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(pointer: fine)').matches &&
  !window.matchMedia('(prefers-reduced-motion: reduce)').matches

export function TargetCursor({ selector = '[data-target-cursor]' }: { selector?: string }) {
  const [enabled, setEnabled] = useState(supportsCursor)
  const [frame, setFrame] = useState<CursorFrame | null>(null)
  const activeRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return
    const pointer = window.matchMedia('(pointer: fine)')
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)')
    const update = () => setEnabled(pointer.matches && !motion.matches)
    pointer.addEventListener('change', update)
    motion.addEventListener('change', update)
    update()
    return () => {
      pointer.removeEventListener('change', update)
      motion.removeEventListener('change', update)
    }
  }, [])

  useEffect(() => {
    const clear = () => {
      activeRef.current?.classList.remove('target-cursor-active')
      activeRef.current = null
      setFrame(null)
    }
    if (!enabled) {
      clear()
      return
    }

    const measure = () => {
      const target = activeRef.current
      if (!target || !target.isConnected || target.closest(blockedSelector) || document.querySelector(modalSelector)) {
        clear()
        return
      }
      const rect = target.getBoundingClientRect()
      setFrame({
        left: rect.left,
        top: rect.top,
        width: rect.width,
        height: rect.height,
        borderRadius: getComputedStyle(target).borderRadius,
        label: target.dataset.cursorLabel ?? '',
      })
    }
    const resolve = (eventTarget: EventTarget | null) => {
      if (!(eventTarget instanceof Element) || eventTarget.closest(blockedSelector) || eventTarget.closest(modalSelector) || document.querySelector(modalSelector)) return null
      const target = eventTarget.closest<HTMLElement>(selector)
      return target && !target.closest(blockedSelector) ? target : null
    }
    const enter = (event: Event) => {
      const target = resolve(event.target)
      if (target === activeRef.current) return
      clear()
      if (!target) return
      activeRef.current = target
      target.classList.add('target-cursor-active')
      measure()
    }
    const leave = (event: Event) => {
      const active = activeRef.current
      if (!active || !(event.target instanceof Node) || !active.contains(event.target)) return
      const related = (event as PointerEvent | FocusEvent).relatedTarget
      if (related instanceof Node && active.contains(related)) return
      clear()
    }
    const observer = new MutationObserver(() => {
      if (activeRef.current && (!activeRef.current.isConnected || document.querySelector(modalSelector))) clear()
    })
    observer.observe(document.body, { childList: true, subtree: true })
    document.addEventListener('pointerover', enter)
    document.addEventListener('pointerout', leave)
    document.addEventListener('focusin', enter)
    document.addEventListener('focusout', leave)
    window.addEventListener('scroll', measure, true)
    window.addEventListener('resize', measure)
    return () => {
      observer.disconnect()
      document.removeEventListener('pointerover', enter)
      document.removeEventListener('pointerout', leave)
      document.removeEventListener('focusin', enter)
      document.removeEventListener('focusout', leave)
      window.removeEventListener('scroll', measure, true)
      window.removeEventListener('resize', measure)
      activeRef.current?.classList.remove('target-cursor-active')
      activeRef.current = null
    }
  }, [enabled, selector])

  if (!enabled) return null

  const style: CSSProperties | undefined = frame ? {
    left: frame.left,
    top: frame.top,
    width: frame.width,
    height: frame.height,
    borderRadius: frame.borderRadius,
  } : undefined

  return (
    <div data-testid="target-cursor" className="target-cursor" data-visible={Boolean(frame)} aria-hidden="true" style={style}>
      <span className="target-cursor-corner target-cursor-top-left" />
      <span className="target-cursor-corner target-cursor-top-right" />
      <span className="target-cursor-corner target-cursor-bottom-left" />
      <span className="target-cursor-corner target-cursor-bottom-right" />
      {frame?.label && <span className="target-cursor-label">{frame.label}</span>}
    </div>
  )
}
