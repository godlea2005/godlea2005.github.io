import type { ComponentType } from 'react'

export type GradientWavesDetail = 'low' | 'medium' | 'high'

export interface GradientWavesProps {
  horizonColor?: string
  waveColor?: string
  crestColor?: string
  speed?: number
  amplitude?: number
  waveScale?: number
  waveRatio?: number
  swell?: number
  turbulence?: number
  tilt?: number
  zoom?: number
  height?: number
  fogDepth?: number
  detail?: GradientWavesDetail
  brightness?: number
  opacity?: number
  mouseInteraction?: boolean
  parallaxStrength?: number
  grain?: boolean
  grainIntensity?: number
  className?: string
}

declare const GradientWaves: ComponentType<GradientWavesProps>

export default GradientWaves
