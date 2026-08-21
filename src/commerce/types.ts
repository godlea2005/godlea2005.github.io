export type CommercePlatform = 'ozon' | 'wildberries' | 'douyin' | 'taobao-tmall'

export type ProjectMode = 'quick' | 'professional'

export type Confidence = 'confirmed' | 'inferred' | 'needs-confirmation'

export type CommerceProjectInput = {
  mode: ProjectMode
  name: string
  platform: CommercePlatform
  files: File[]
  category?: string
  specifications?: string
  priceRange?: string
  sellingPoints?: string
  audience?: string
  brandTone?: string
  competitorLinks?: string
  prohibitedWords?: string
  desiredStyle?: string
  notes?: string
}

export type HeroDirection = {
  title: string
  rationale: string
  composition: string
  background: string
  palette: string[]
  lighting: string
  props: string[]
  copyPlacement: string
  visualFocus: string
  imagePrompt: string
  negativePrompt: string
}

export type DetailFrame = {
  order: number
  purpose: string
  visual: string
  copy: string
  copyTranslation: string | null
  transition: string
}

export type CommerceResult = {
  productSummary: string
  facts: Array<{ label: string; value: string; confidence: Confidence }>
  audiences: Array<{ segment: string; motivation: string }>
  sellingPoints: Array<{ rank: number; point: string; reason: string; confidence: Confidence }>
  platformStrategy: { overview: string; contentDensity: string; tone: string; complianceNotes: string[] }
  heroDirections: [HeroDirection, HeroDirection, HeroDirection]
  detailFrames: DetailFrame[]
  recommendedCanvas: Array<{ usage: string; ratio: string; pixels: string; safeZone: string }>
  fidelityRules: string[]
  pendingConfirmations: string[]
}
