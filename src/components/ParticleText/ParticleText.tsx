import { useLayoutEffect, useRef, useState } from 'react'
import { useMotionProfile } from '../../lib/useMotionProfile'
import './ParticleText.css'

type ParticleTextProps = {
  text: string
  colors?: string[]
  particleSize?: number
  particleGap?: number
  mouseRadius?: number
  mouseStrength?: number
  friction?: number
  ease?: number
  className?: string
}

type Particle = {
  x: number; y: number; originX: number; originY: number
  velocityX: number; velocityY: number; color: string
}

const defaultColors = ['#f8f7ff', '#ddd8f7', '#bbb2dc', '#e8b1d1']
const settledError = 0.45
const settledFrames = 12

export function ParticleText({
  text, colors = defaultColors, particleSize = 1.55, particleGap = 3,
  friction = 0.78, ease = 0.055, className = '',
}: ParticleTextProps) {
  const { reducedMotion, fineHover } = useMotionProfile()
  const animated = fineHover && !reducedMotion
  const rootRef = useRef<HTMLSpanElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [stage, setStage] = useState<'fallback' | 'forming' | 'settled'>('fallback')

  useLayoutEffect(() => {
    if (!animated) return
    const root = rootRef.current
    const canvas = canvasRef.current
    const context = canvas?.getContext('2d')
    if (!root || !canvas || !context) return

    let particles: Particle[] = []
    let frame = 0
    let resizeFrame = 0
    let width = 0
    let height = 0
    let calmFrames = 0
    let isSettled = false

    const stop = () => {
      if (frame) window.cancelAnimationFrame(frame)
      frame = 0
    }
    const draw = () => {
      context.clearRect(0, 0, width, height)
      for (const particle of particles) {
        context.fillStyle = particle.color
        context.beginPath()
        context.arc(particle.x, particle.y, particleSize, 0, Math.PI * 2)
        context.fill()
      }
    }
    const animate = () => {
      frame = 0
      let maxError = 0
      for (const particle of particles) {
        particle.velocityX = (particle.velocityX + (particle.originX - particle.x) * ease) * friction
        particle.velocityY = (particle.velocityY + (particle.originY - particle.y) * ease) * friction
        particle.x += particle.velocityX
        particle.y += particle.velocityY
        maxError = Math.max(maxError,
          Math.abs(particle.originX - particle.x) + Math.abs(particle.originY - particle.y) +
          Math.abs(particle.velocityX) + Math.abs(particle.velocityY))
      }
      draw()
      calmFrames = maxError < settledError ? calmFrames + 1 : 0
      if (calmFrames >= settledFrames) {
        isSettled = true
        setStage('settled')
      } else if (!document.hidden) frame = window.requestAnimationFrame(animate)
    }
    const start = () => {
      if (!document.hidden && !isSettled && !frame && particles.length) frame = window.requestAnimationFrame(animate)
    }
    const build = () => {
      const bounds = root.getBoundingClientRect()
      const nextWidth = Math.max(1, Math.round(bounds.width))
      const nextHeight = Math.max(1, Math.round(bounds.height))
      if (nextWidth === width && nextHeight === height) return
      stop()
      width = nextWidth
      height = nextHeight
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      canvas.width = Math.round(width * dpr)
      canvas.height = Math.round(height * dpr)
      canvas.style.width = `${width}px`
      canvas.style.height = `${height}px`
      context.setTransform(dpr, 0, 0, dpr, 0, 0)

      const sampleCanvas = document.createElement('canvas')
      sampleCanvas.width = width
      sampleCanvas.height = height
      const sample = sampleCanvas.getContext('2d', { willReadFrequently: true })
      if (!sample) { setStage('fallback'); return }
      let fontSize = Math.min(174, height * 0.84)
      sample.font = `900 ${fontSize}px Inter, Arial, sans-serif`
      const measured = sample.measureText(text).width
      if (measured > width * 0.98) fontSize *= (width * 0.98) / measured
      sample.clearRect(0, 0, width, height)
      sample.fillStyle = '#fff'
      sample.font = `900 ${fontSize}px Inter, Arial, sans-serif`
      sample.textAlign = 'center'
      sample.textBaseline = 'middle'
      sample.fillText(text, width / 2, height / 2 + fontSize * 0.035)
      const image = sample.getImageData(0, 0, width, height).data
      const next: Particle[] = []
      for (let y = 0; y < height; y += Math.max(2, particleGap)) {
        for (let x = 0; x < width; x += Math.max(2, particleGap)) {
          if (image[(y * width + x) * 4 + 3] < 128) continue
          next.push({
            x: x + (Math.random() - 0.5) * 22,
            y: y + (Math.random() - 0.5) * 22,
            originX: x, originY: y, velocityX: 0, velocityY: 0,
            color: colors[Math.floor(Math.random() * colors.length)] ?? '#fff',
          })
        }
      }
      particles = next
      calmFrames = 0
      isSettled = false
      setStage(particles.length ? 'forming' : 'fallback')
      draw()
      start()
    }
    const onResize = () => {
      if (document.hidden) return
      const bounds = root.getBoundingClientRect()
      if (Math.max(1, Math.round(bounds.width)) === width && Math.max(1, Math.round(bounds.height)) === height) return
      if (resizeFrame) window.cancelAnimationFrame(resizeFrame)
      resizeFrame = window.requestAnimationFrame(() => { resizeFrame = 0; if (!document.hidden) build() })
    }
    const onVisibility = () => {
      if (document.hidden) {
        stop()
        if (resizeFrame) window.cancelAnimationFrame(resizeFrame)
        resizeFrame = 0
      } else {
        build()
        start()
      }
    }
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(onResize) : null
    observer?.observe(root)
    if (!observer) window.addEventListener('resize', onResize)
    document.addEventListener('visibilitychange', onVisibility)
    build()
    return () => {
      stop()
      if (resizeFrame) window.cancelAnimationFrame(resizeFrame)
      observer?.disconnect()
      if (!observer) window.removeEventListener('resize', onResize)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [animated, colors, ease, friction, particleGap, particleSize, text])

  return <span ref={rootRef} className={`particle-text is-${animated ? stage : 'fallback'}${className ? ` ${className}` : ''}`} role="img" aria-label={text}>
    <span className="particle-text-fallback" aria-hidden="true">{text}</span>
    {animated && <canvas ref={canvasRef} aria-hidden="true" />}
  </span>
}
