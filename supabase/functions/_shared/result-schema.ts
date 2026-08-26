const stringSchema = { type: 'string' } as const
const stringArraySchema = { type: 'array', items: stringSchema } as const

const objectSchema = <T extends Record<string, unknown>>(properties: T) => ({
  type: 'object',
  properties,
  required: Object.keys(properties),
  additionalProperties: false,
}) as const

const factSchema = objectSchema({
  label: stringSchema,
  value: stringSchema,
  confidence: { type: 'string', enum: ['confirmed', 'inferred', 'needs-confirmation'] },
})

const audienceSchema = objectSchema({
  segment: stringSchema,
  motivation: stringSchema,
})

const sellingPointSchema = objectSchema({
  rank: { type: 'integer' },
  point: stringSchema,
  reason: stringSchema,
  confidence: { type: 'string', enum: ['confirmed', 'inferred', 'needs-confirmation'] },
})

const platformStrategySchema = objectSchema({
  overview: stringSchema,
  contentDensity: stringSchema,
  tone: stringSchema,
  complianceNotes: stringArraySchema,
})

const heroDirectionSchema = objectSchema({
  title: stringSchema,
  rationale: stringSchema,
  composition: stringSchema,
  background: stringSchema,
  palette: stringArraySchema,
  lighting: stringSchema,
  props: stringArraySchema,
  copyPlacement: stringSchema,
  visualFocus: stringSchema,
  imagePrompt: stringSchema,
  negativePrompt: stringSchema,
})

const detailFrameSchema = objectSchema({
  order: { type: 'integer' },
  purpose: stringSchema,
  visual: stringSchema,
  copy: stringSchema,
  copyTranslation: { anyOf: [stringSchema, { type: 'null' }] },
  transition: stringSchema,
})

const recommendedCanvasSchema = objectSchema({
  usage: stringSchema,
  ratio: stringSchema,
  pixels: stringSchema,
  safeZone: stringSchema,
})

export const COMMERCE_RESULT_SCHEMA = {
  type: 'object',
  properties: {
    productSummary: stringSchema,
    facts: { type: 'array', items: factSchema },
    audiences: { type: 'array', items: audienceSchema },
    sellingPoints: { type: 'array', items: sellingPointSchema },
    platformStrategy: platformStrategySchema,
    heroDirections: { type: 'array', items: heroDirectionSchema, minItems: 3, maxItems: 3 },
    detailFrames: { type: 'array', items: detailFrameSchema, minItems: 8, maxItems: 12 },
    recommendedCanvas: { type: 'array', items: recommendedCanvasSchema },
    fidelityRules: stringArraySchema,
    pendingConfirmations: stringArraySchema,
  },
  required: [
    'productSummary',
    'facts',
    'audiences',
    'sellingPoints',
    'platformStrategy',
    'heroDirections',
    'detailFrames',
    'recommendedCanvas',
    'fidelityRules',
    'pendingConfirmations',
  ],
  additionalProperties: false,
} as const

export type ValidationResult = { ok: boolean; errors: string[] }

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const hasExactKeys = (value: Record<string, unknown>, keys: readonly string[]) => {
  const actual = Object.keys(value)
  return actual.length === keys.length && keys.every((key) => Object.hasOwn(value, key))
}

const isString = (value: unknown): value is string => typeof value === 'string'
const isStringArray = (value: unknown): value is string[] => Array.isArray(value) && value.every(isString)
const isInteger = (value: unknown): value is number => typeof value === 'number' && Number.isInteger(value)
const isConfidence = (value: unknown) =>
  value === 'confirmed' || value === 'inferred' || value === 'needs-confirmation'

const validatesObject = (
  value: unknown,
  keys: readonly string[],
  checks: Record<string, (field: unknown) => boolean>,
) => {
  if (!isRecord(value) || !hasExactKeys(value, keys)) return false
  return keys.every((key) => checks[key](value[key]))
}

const factKeys = ['label', 'value', 'confidence'] as const
const audienceKeys = ['segment', 'motivation'] as const
const sellingPointKeys = ['rank', 'point', 'reason', 'confidence'] as const
const strategyKeys = ['overview', 'contentDensity', 'tone', 'complianceNotes'] as const
const heroKeys = [
  'title', 'rationale', 'composition', 'background', 'palette', 'lighting', 'props',
  'copyPlacement', 'visualFocus', 'imagePrompt', 'negativePrompt',
] as const
const detailKeys = ['order', 'purpose', 'visual', 'copy', 'copyTranslation', 'transition'] as const
const canvasKeys = ['usage', 'ratio', 'pixels', 'safeZone'] as const
const rootKeys = COMMERCE_RESULT_SCHEMA.required

const isFact = (value: unknown) => validatesObject(value, factKeys, {
  label: isString,
  value: isString,
  confidence: isConfidence,
})

const isAudience = (value: unknown) => validatesObject(value, audienceKeys, {
  segment: isString,
  motivation: isString,
})

const isSellingPoint = (value: unknown) => validatesObject(value, sellingPointKeys, {
  rank: isInteger,
  point: isString,
  reason: isString,
  confidence: isConfidence,
})

const isStrategy = (value: unknown) => validatesObject(value, strategyKeys, {
  overview: isString,
  contentDensity: isString,
  tone: isString,
  complianceNotes: isStringArray,
})

const isHero = (value: unknown) => validatesObject(value, heroKeys, {
  title: isString,
  rationale: isString,
  composition: isString,
  background: isString,
  palette: isStringArray,
  lighting: isString,
  props: isStringArray,
  copyPlacement: isString,
  visualFocus: isString,
  imagePrompt: isString,
  negativePrompt: isString,
})

const isDetail = (value: unknown) => validatesObject(value, detailKeys, {
  order: isInteger,
  purpose: isString,
  visual: isString,
  copy: isString,
  copyTranslation: (field) => field === null || isString(field),
  transition: isString,
})

const isCanvas = (value: unknown) => validatesObject(value, canvasKeys, {
  usage: isString,
  ratio: isString,
  pixels: isString,
  safeZone: isString,
})

const arrayOf = (value: unknown, predicate: (item: unknown) => boolean) =>
  Array.isArray(value) && value.every(predicate)

export const validateCommerceResult = (value: unknown): ValidationResult => {
  const errors: string[] = []
  if (!isRecord(value) || !hasExactKeys(value, rootKeys)) {
    return { ok: false, errors: ['result field contract mismatch'] }
  }

  if (!isString(value.productSummary)) errors.push('productSummary')
  if (!arrayOf(value.facts, isFact)) errors.push('facts')
  if (!arrayOf(value.audiences, isAudience)) errors.push('audiences')
  if (!arrayOf(value.sellingPoints, isSellingPoint)) errors.push('sellingPoints')
  if (!isStrategy(value.platformStrategy)) errors.push('platformStrategy')
  if (!Array.isArray(value.heroDirections) || value.heroDirections.length !== 3 || !value.heroDirections.every(isHero)) {
    errors.push('heroDirections')
  }
  if (!Array.isArray(value.detailFrames) || value.detailFrames.length < 8 || value.detailFrames.length > 12 || !value.detailFrames.every(isDetail)) {
    errors.push('detailFrames')
  }
  if (!arrayOf(value.recommendedCanvas, isCanvas)) errors.push('recommendedCanvas')
  if (!isStringArray(value.fidelityRules)) errors.push('fidelityRules')
  if (!isStringArray(value.pendingConfirmations)) errors.push('pendingConfirmations')

  return { ok: errors.length === 0, errors }
}
