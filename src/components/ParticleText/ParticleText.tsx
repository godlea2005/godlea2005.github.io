import { useEffect, useRef, useState } from 'react'
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
  x: number
  y: number
  originX: number
  originY: number
  velocityX: number
  velocityY: number
  color: string
}

const defaultColors = ['#f8f7ff', '#ddd8f7', '#bbb2dc', '#e8b1d1']

export function ParticleText({
  text,
  colors = defaultColors,
  particleSize = 1.55,
  particleGap = 3,
  mouseRadius = 86,
  mouseStrength = 1.35,
  friction = 0.78,
  ease = 0.055,
  className = '',
}: ParticleTextProps) {
  const rootRef = useRef<HTMLSpanElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    const root = rootRef.current
    const canvas = canvasRef.current
    const context = canvas?.getContext('2d')
    if (!root || !canvas || !context) return

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const mouse = { x: Number.NEGATIVE_INFINITY, y: Number.NEGATIVE_INFINITY }
    let particles: Particle[] = []
    let frame = 0
    let resizeFrame = 0
    let width = 0
    let height = 0

    const draw = () => {
      context.clearRect(0, 0, width, height)
      for (const particle of particles) {
        context.fillStyle = particle.color
        context.beginPath()
        context.arc(particle.x, particle.y, particleSize, 0, Math.PI * 2)
        context.fill()
      }
    }

    const buildParticles = () => {
      const bounds = root.getBoundingClientRect()
      width = Math.max(1, Math.round(bounds.width))
      height = Math.max(1, Math.round(bounds.height))
      const dpr = Math.min(window.devicePixelRatio || 1, 2)

      canvas.width = Math.round(width * dpr)
      canvas.height = Math.round(height * dpr)
      canvas.style.width = `${width}px`
      canvas.style.height = `${height}px`
      context.setTransform(dpr, 0, 0, dpr, 0, 0)

      const sampleCanvas = document.createElement('canvas')
      sampleCanvas.width = width
      sampleCanvas.height = height
      const sampleContext = sampleCanvas.getContext('2d', { willReadFrequently: true })
      if (!sampleContext) return

      let fontSize = Math.min(174, height * 0.84)
      sampleContext.font = `900 ${fontSize}px Inter, Arial, sans-serif`
      const measuredWidth = sampleContext.measureText(text).width
      if (measuredWidth > width * 0.98) fontSize *= (width * 0.98) / measuredWidth

      sampleContext.clearRect(0, 0, width, height)
      sampleContext.fillStyle = '#fff'
      sampleContext.font = `900 ${fontSize}px Inter, Arial, sans-serif`
      sampleContext.textAlign = 'center'
      sampleContext.textBaseline = 'middle'
      sampleContext.fillText(text, width / 2, height / 2 + fontSize * 0.035)

      const image = sampleContext.getImageData(0, 0, width, height).data
      const nextParticles: Particle[] = []
      const step = Math.max(2, particleGap)

      for (let y = 0; y < height; y += step) {
        for (let x = 0; x < width; x += step) {
          if (image[(y * width + x) * 4 + 3] < 128) continue
          const spread = reducedMotion ? 0 : 22
          nextParticles.push({
            x: x + (Math.random() - 0.5) * spread,
            y: y + (Math.random() - 0.5) * spread,
            originX: x,
            originY: y,
            velocityX: 0,
            velocityY: 0,
            color: colors[Math.floor(Math.random() * colors.length)] ?? '#fff',
          })
        }
      }

      particles = nextParticles
      setReady(true)
      draw()
    }

    const animate = () => {
      for (const particle of particles) {
        const deltaX = particle.x - mouse.x
        const deltaY = particle.y - mouse.y
        const distance = Math.hypot(deltaX, deltaY)

        if (distance > 0 && distance < mouseRadius) {
          const force = (1 - distance / mouseRadius) * mouseStrength
          particle.velocityX += (deltaX / distance) * force
          particle.velocityY += (deltaY / distance) * force
        }

        particle.velocityX += (particle.originX - particle.x) * ease
        particle.velocityY += (particle.originY - particle.y) * ease
        particle.velocityX *= friction
        particle.velocityY *= friction
        particle.x += particle.velocityX
        particle.y += particle.velocityY
      }

      draw()
      frame = window.requestAnimationFrame(animate)
    }

    const handlePointerMove = (event: PointerEvent) => {
      const bounds = root.getBoundingClientRect()
      mouse.x = event.clientX - bounds.left
      mouse.y = event.clientY - bounds.top
    }

    const clearPointer = () => {
      mouse.x = Number.NEGATIVE_INFINITY
      mouse.y = Number.NEGATIVE_INFINITY
    }

    const observer = new ResizeObserver(() => {
      window.cancelAnimationFrame(resizeFrame)
      resizeFrame = window.requestAnimationFrame(buildParticles)
    })

    observer.observe(root)
    root.addEventListener('pointermove', handlePointerMove)
    root.addEventListener('pointerleave', clearPointer)
    buildParticles()
    if (!reducedMotion) frame = window.requestAnimationFrame(animate)

    return () => {
      observer.disconnect()
      root.removeEventListener('pointermove', handlePointerMove)
      root.removeEventListener('pointerleave', clearPointer)
      window.cancelAnimationFrame(frame)
      window.cancelAnimationFrame(resizeFrame)
    }
  }, [colors, ease, friction, mouseRadius, mouseStrength, particleGap, particleSize, text])

  return (
    <span
      ref={rootRef}
      className={`particle-text${ready ? ' is-ready' : ''}${className ? ` ${className}` : ''}`}
      role="img"
      aria-label={text}
    >
      <span className="particle-text-fallback" aria-hidden="true">{text}</span>
      <canvas ref={canvasRef} aria-hidden="true" />
    </span>
  )
}
