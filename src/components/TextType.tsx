import { useEffect, useRef, useState } from 'react'
import { useMotionProfile } from '../lib/useMotionProfile'
import './text-type.css'

export type TextTypeProps = {
  texts: readonly string[]
  typingMs?: number
  deletingMs?: number
  pauseMs?: number
}

type Step = { phrase: number; length: number; phase: 'typing' | 'pausing' | 'deleting' | 'settled' }

export function TextType({ texts, typingMs = 55, deletingMs = 28, pauseMs = 1100 }: TextTypeProps) {
  const { reducedMotion, pageVisible } = useMotionProfile()
  const [step, setStep] = useState<Step>({ phrase: 0, length: 0, phase: 'typing' })
  const stepRef = useRef(step)
  const first = texts[0] ?? ''
  const phrase = texts[step.phrase] ?? first
  const textKey = JSON.stringify(texts)

  useEffect(() => {
    if (reducedMotion || !pageVisible || stepRef.current.phase === 'settled' || texts.length === 0) return
    let timer = 0
    const tick = () => {
      const current = stepRef.current
      let delay: number
      let next: Step
      if (current.phase === 'typing') {
        delay = typingMs
        next = current.length < Array.from(texts[current.phrase] ?? '').length
          ? { ...current, length: current.length + 1 }
          : { ...current, phase: 'pausing' }
      } else if (current.phase === 'pausing') {
        delay = pauseMs
        next = current.phrase === texts.length - 1
          ? { phrase: 0, length: Array.from(first).length, phase: 'settled' }
          : { ...current, phase: 'deleting' }
      } else if (current.phase === 'deleting') {
        delay = deletingMs
        next = current.length > 0
          ? { ...current, length: current.length - 1 }
          : { phrase: current.phrase + 1, length: 0, phase: 'typing' }
      } else return
      timer = window.setTimeout(() => {
        stepRef.current = next
        setStep(next)
        if (next.phase !== 'settled') tick()
      }, delay)
    }
    tick()
    return () => window.clearTimeout(timer)
  }, [deletingMs, first, pageVisible, pauseMs, reducedMotion, textKey, texts, typingMs])

  const visibleText = reducedMotion || step.phase === 'settled'
    ? first
    : Array.from(phrase).slice(0, step.length).join('')

  return <span className="text-type" aria-label={first}>
    <span aria-hidden="true" className="text-type-glyphs">{visibleText}</span>
    <span aria-hidden="true" className="text-type-caret" />
  </span>
}
