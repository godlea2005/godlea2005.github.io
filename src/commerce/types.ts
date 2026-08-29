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

export type CommerceProjectDetails = Pick<
  CommerceProjectInput,
  | 'category'
  | 'specifications'
  | 'priceRange'
  | 'sellingPoints'
  | 'audience'
  | 'brandTone'
  | 'competitorLinks'
  | 'prohibitedWords'
  | 'desiredStyle'
  | 'notes'
>

export type CommerceAssetState = 'uploading' | 'ready' | 'processing' | 'deleted' | 'failed'

export type CommerceGenerationStatus = 'queued' | 'processing' | 'completed' | 'failed' | 'cancelled'

export type CommerceAsset = {
  id: string
  projectId: string
  userId: string
  storagePath: string
  mimeType: 'image/jpeg' | 'image/png' | 'image/webp'
  sizeBytes: number
  expiresAt: string
  state: CommerceAssetState
  deletedAt: string | null
  createdAt: string
}

export type CommerceProject = {
  id: string
  userId: string
  name: string
  platform: CommercePlatform
  mode: ProjectMode
  inputData: CommerceProjectDetails
  locked: boolean
  createdAt: string
  updatedAt: string
  assets: CommerceAsset[]
}

export type CommerceEntitlement = {
  userId: string
  credits: number
  unlimited: boolean
  disabled: boolean
  dailyLimit: number
  updatedAt: string
}

export type CommerceGeneration = {
  id: string
  projectId: string | null
  userId: string
  idempotencyKey: string
  status: CommerceGenerationStatus
  resultData: CommerceResult | null
  provider: string | null
  model: string | null
  usage: Record<string, unknown> | null
  errorCode: string | null
  errorMessage: string | null
  creditCharged: boolean
  refundedAt: string | null
  createdAt: string
  startedAt: string | null
  completedAt: string | null
}

export type AssetUploadProgress = {
  completedFiles: number
  totalFiles: number
  currentFile: { name: string; state: Extract<CommerceAssetState, 'uploading' | 'ready' | 'failed'> }
}

export type GenerationStartResult = {
  generationId: string
  status: CommerceGenerationStatus
}

export type CommerceAdminSettings = {
  newUserCredits: number
  defaultDailyLimit: number
  maxProjectImages: number
  storageSoftLimitBytes: number
  storageTargetBytes: number
}

export type CommerceAdminOverview = {
  totalUsers: number
  todayGenerations: number
  todayFailures: number
  todayFailureRate: number
  creditsConsumed: number
  storageBytes: number
  latestCleanup: Record<string, unknown> | null
}

export type CommerceAdminUser = {
  userId: string
  email: string | null
  provider: string
  createdAt: string
  credits: number
  unlimited: boolean
  disabled: boolean
  dailyLimit: number
  generationCount: number
  creditsUsed: number
}

export type CommerceAdminGeneration = {
  generationId: string
  projectId: string | null
  projectName: string
  userId: string
  userEmail: string | null
  platform: CommercePlatform | null
  status: CommerceGenerationStatus
  provider: string | null
  model: string | null
  errorCode: string | null
  errorMessage: string | null
  creditCharged: boolean
  refundedAt: string | null
  createdAt: string
  startedAt: string | null
  completedAt: string | null
}

export type CommerceAdminDashboard = {
  overview: CommerceAdminOverview
  users: CommerceAdminUser[]
  generations: CommerceAdminGeneration[]
  settings: CommerceAdminSettings
}

export type SetUserEntitlementInput = {
  userId: string
  credits: number
  unlimited: boolean
  disabled: boolean
  dailyLimit: number
  reason: string
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
