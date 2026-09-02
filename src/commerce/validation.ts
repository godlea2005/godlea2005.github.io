import type {
  CommercePlatform,
  CommerceProjectInput,
  CommerceResult,
  Confidence,
  DetailFrame,
  HeroDirection,
  ProjectMode,
} from './types'

export type ValidationResult = {
  ok: boolean
  errors: string[]
}

const MAX_FILE_SIZE = 8 * 1024 * 1024
const MAX_NAME_LENGTH = 80
const MAX_TEXT_LENGTH = 2000
const MIN_DETAIL_FRAMES = 8
const MAX_DETAIL_FRAMES = 12
const ALLOWED_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp'])
const PLATFORMS = new Set<CommercePlatform>(['ozon', 'wildberries', 'douyin', 'taobao-tmall'])
const MODES = new Set<ProjectMode>(['quick', 'professional'])
const CONFIDENCES = new Set<Confidence>(['confirmed', 'inferred', 'needs-confirmation'])
const PROFESSIONAL_TEXT_FIELDS = [
  'category',
  'specifications',
  'priceRange',
  'sellingPoints',
  'audience',
  'brandTone',
  'competitorLinks',
  'prohibitedWords',
  'desiredStyle',
  'notes',
] as const

const validString = (value: unknown): value is string => typeof value === 'string'

const validStringArray = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every(validString)

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

const hasStrings = (value: Record<string, unknown>, fields: readonly string[]): boolean =>
  fields.every((field) => validString(value[field]))

const isHeroDirection = (value: unknown): value is HeroDirection => {
  if (!isRecord(value)) return false
  return (
    hasStrings(value, [
      'title',
      'rationale',
      'composition',
      'background',
      'lighting',
      'copyPlacement',
      'visualFocus',
      'imagePrompt',
      'negativePrompt',
    ]) &&
    validStringArray(value.palette) &&
    validStringArray(value.props)
  )
}

const isDetailFrame = (value: unknown): value is DetailFrame => {
  if (!isRecord(value)) return false
  return (
    typeof value.order === 'number' &&
    Number.isFinite(value.order) &&
    hasStrings(value, ['purpose', 'visual', 'copy', 'transition']) &&
    (value.copyTranslation === null || validString(value.copyTranslation))
  )
}

const isCommerceFact = (value: unknown): boolean => {
  if (!isRecord(value)) return false
  return hasStrings(value, ['label', 'value']) && typeof value.confidence === 'string' && CONFIDENCES.has(value.confidence as Confidence)
}

const isAudience = (value: unknown): boolean =>
  isRecord(value) && hasStrings(value, ['segment', 'motivation'])

const isSellingPoint = (value: unknown): boolean => {
  if (!isRecord(value)) return false
  return (
    typeof value.rank === 'number' &&
    Number.isFinite(value.rank) &&
    hasStrings(value, ['point', 'reason']) &&
    typeof value.confidence === 'string' &&
    CONFIDENCES.has(value.confidence as Confidence)
  )
}

const isPlatformStrategy = (value: unknown): boolean => {
  if (!isRecord(value)) return false
  return (
    hasStrings(value, ['overview', 'contentDensity', 'tone']) &&
    validStringArray(value.complianceNotes)
  )
}

const isRecommendedCanvas = (value: unknown): boolean =>
  isRecord(value) && hasStrings(value, ['usage', 'ratio', 'pixels', 'safeZone'])

export const validateProductFile = (file: File): ValidationResult => {
  const errors: string[] = []

  const fileConstructor = typeof File === 'undefined' ? undefined : File
  if (!fileConstructor || !(file instanceof fileConstructor)) {
    errors.push('文件无效')
  } else {
    if (!ALLOWED_MIME_TYPES.has(file.type)) {
      errors.push('仅支持 JPEG、PNG 或 WebP 图片')
    }
    if (file.size < 1) {
      errors.push('图片文件不能为空')
    }
    if (file.size > MAX_FILE_SIZE) {
      errors.push('单个文件不能超过 8 MB')
    }
  }

  return { ok: errors.length === 0, errors }
}

export const validateProjectInput = (input: CommerceProjectInput): ValidationResult => {
  const errors: string[] = []

  if (!isRecord(input)) {
    return { ok: false, errors: ['项目输入无效'] }
  }

  const normalizedName = typeof input.name === 'string' ? input.name.replace(/\s/g, '') : ''
  if (normalizedName.length < 1 || normalizedName.length > MAX_NAME_LENGTH) {
    errors.push('商品名称去空格后必须为 1–80 字')
  }

  if (typeof input.mode !== 'string' || !MODES.has(input.mode as ProjectMode)) {
    errors.push('项目模式无效')
  }

  if (typeof input.platform !== 'string' || !PLATFORMS.has(input.platform as CommercePlatform)) {
    errors.push('电商平台无效')
  }

  if (!Array.isArray(input.files) || input.files.length < 1 || input.files.length > 6) {
    errors.push('图片数量必须为 1–6 张')
  } else {
    input.files.forEach((file, index) => {
      const result = validateProductFile(file)
      result.errors.forEach((error) => errors.push(`第 ${index + 1} 个文件：${error}`))
    })
  }

  PROFESSIONAL_TEXT_FIELDS.forEach((field) => {
    const value = input[field]
    if (value !== undefined && (typeof value !== 'string' || value.length > MAX_TEXT_LENGTH)) {
      errors.push(`${field} 不能超过 2000 字`)
    }
  })

  return { ok: errors.length === 0, errors }
}

export const isCommerceResult = (value: unknown): value is CommerceResult => {
  if (!isRecord(value)) return false

  return (
    validString(value.productSummary) &&
    Array.isArray(value.facts) &&
    value.facts.every(isCommerceFact) &&
    Array.isArray(value.audiences) &&
    value.audiences.every(isAudience) &&
    Array.isArray(value.sellingPoints) &&
    value.sellingPoints.every(isSellingPoint) &&
    isPlatformStrategy(value.platformStrategy) &&
    Array.isArray(value.heroDirections) &&
    value.heroDirections.length === 3 &&
    value.heroDirections.every(isHeroDirection) &&
    Array.isArray(value.detailFrames) &&
    value.detailFrames.length >= MIN_DETAIL_FRAMES &&
    value.detailFrames.length <= MAX_DETAIL_FRAMES &&
    value.detailFrames.every(isDetailFrame) &&
    Array.isArray(value.recommendedCanvas) &&
    value.recommendedCanvas.every(isRecommendedCanvas) &&
    validStringArray(value.fidelityRules) &&
    validStringArray(value.pendingConfirmations)
  )
}
