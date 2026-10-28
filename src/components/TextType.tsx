import { useEffect, useMemo, useRef, useState } from 'react'
import { useMotionProfile } from '../lib/useMotionProfile'
import './text-type.css'

export type TextTypeProps = {
  texts: readonly string[]
  typingMs?: number
  deletingMs?: number
  pauseMs?: number
  loop?: boolean
}

type Step = { phrase: number; length: number; phase: 'typing' | 'pausing' | 'deleting' | 'settled' }

export function TextType({ texts, typingMs = 55, deletingMs = 28, pauseMs = 1100, loop = false }: TextTypeProps) {
  const { reducedMotion, pageVisible } = useMotionProfile()
  const staticText = reducedMotion
  const [step, setStep] = useState<Step>({ phrase: 0, length: 0, phase: 'typing' })
  const stepRef = useRef(step)
  const textKey = JSON.stringify(texts)
  const stableTexts = useMemo<readonly string[]>(() => JSON.parse(textKey) as string[], [textKey])
  const first = stableTexts[0] ?? ''
  const phrase = stableTexts[step.phrase] ?? first

  useEffect(() => {
    if (staticText || !pageVisible || stepRef.current.phase === 'settled' || stableTexts.length === 0) return
    let timer = 0
    const tick = () => {
      const current = stepRef.current
      let delay: number
      let next: Step
      if (current.phase === 'typing') {
        delay = typingMs
        next = current.length < Array.from(stableTexts[current.phrase] ?? '').length
          ? { ...current, length: current.length + 1 }
          : { ...current, phase: 'pausing' }
      } else if (current.phase === 'pausing') {
        delay = pauseMs
        next = current.phrase === stableTexts.length - 1 && !loop
          ? { phrase: 0, length: Array.from(first).length, phase: 'settled' }
          : { ...current, phase: 'deleting' }
      } else if (current.phase === 'deleting') {
        delay = deletingMs
        const nextPhrase = current.phrase === stableTexts.length - 1 ? 0 : current.phrase + 1
        next = current.length > 0
          ? { ...current, length: current.length - 1 }
          : { phrase: nextPhrase, length: 0, phase: 'typing' }
      } else return
      timer = window.setTimeout(() => {
        stepRef.current = next
        setStep(next)
        if (next.phase !== 'settled') tick()
      }, delay)
    }
    tick()
    return () => window.clearTimeout(timer)
  }, [deletingMs, first, loop, pageVisible, pauseMs, stableTexts, staticText, textKey, typingMs])

  const visibleText = staticText || step.phase === 'settled'
    ? first
    : Array.from(phrase).slice(0, step.length).join('')

  return <span className="text-type">
    <span className="text-type-accessible">{first}</span>
    <span aria-hidden="true" className="text-type-glyphs">{visibleText}</span>
    {!staticText && step.phase !== 'settled' && <span aria-hidden="true" className="text-type-caret" />}
  </span>
}
