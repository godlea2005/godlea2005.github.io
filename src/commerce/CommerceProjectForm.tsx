import { useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent } from 'react'
import type { AssetUploadProgress, CommercePlatform, CommerceProjectInput, ProjectMode } from './types'
import { validateProductFile, validateProjectInput } from './validation'
import { CommerceRunPanel } from './CommerceRunPanel'
import { CommerceStepRail, type CommerceStep } from './CommerceStepRail'
import { initialCommerceRunState, type CommerceRunState } from './commerceRunMachine'
import { CommerceRepositoryError } from './commerceErrors'

type PreviewFile = {
  id: string
  file: File
  url: string
}

export type CommerceProjectFormProps = {
  onSubmitted: (input: CommerceProjectInput) => void | Promise<void>
  busy?: boolean
  runState?: CommerceRunState
  status?: CommerceFormStatus
  progress?: AssetUploadProgress | null
  error?: string
  creditsLabel?: string
  onRetry?: () => void
  onRecoverAuthentication?: () => void
  onMaterialChange?: () => void
  onDraftChange?: (input: CommerceProjectInput) => void
  initialDraft?: Partial<CommerceProjectInput>
  initialFileNotice?: string
  draftKey?: string | number
}

export type CommerceFormStatus = 'idle' | 'creating' | 'uploading' | 'starting' | 'queued' | 'processing' | 'completed' | 'failed' | 'cancelled'

type TextValues = Omit<CommerceProjectInput, 'files'>

const platforms: Array<{ value: CommercePlatform; name: string; context: string }> = [
  { value: 'ozon', name: 'Ozon', context: '俄罗斯市场 · 结构清晰、规格先行' },
  { value: 'wildberries', name: 'Wildberries', context: '俄罗斯市场 · 强视觉、快速决策' },
  { value: 'douyin', name: '抖音电商', context: '内容电商 · 卖点要在一屏内被看懂' },
  { value: 'taobao-tmall', name: '淘宝/天猫', context: '货架电商 · 品牌感与信息密度并重' },
]

const professionalFields: Array<{
  key: keyof Pick<TextValues, 'category' | 'specifications' | 'priceRange' | 'sellingPoints' | 'audience' | 'brandTone' | 'competitorLinks' | 'prohibitedWords' | 'desiredStyle' | 'notes'>
  label: string
  placeholder: string
  step: 1 | 2
  multiline?: boolean
}> = [
  { key: 'category', label: '产品类目', placeholder: '例如：户外保温杯', step: 1 },
  { key: 'specifications', label: '规格参数', placeholder: '材质、尺寸、容量、颜色等', step: 1, multiline: true },
  { key: 'priceRange', label: '价格区间', placeholder: '例如：1,990–2,490 ₽', step: 1 },
  { key: 'sellingPoints', label: '核心卖点', placeholder: '按重要性写下已确认的卖点', step: 1, multiline: true },
  { key: 'audience', label: '目标人群', placeholder: '谁会买、在什么场景使用', step: 2, multiline: true },
  { key: 'brandTone', label: '品牌语气', placeholder: '克制、专业、年轻或其他方向', step: 2 },
  { key: 'competitorLinks', label: '竞品链接', placeholder: '每行一个链接，可留空', step: 2, multiline: true },
  { key: 'prohibitedWords', label: '禁用词与禁改细节', placeholder: '不能出现的表述、不可改变的结构或颜色', step: 2, multiline: true },
  { key: 'desiredStyle', label: '期望视觉风格', placeholder: '可描述氛围、材质与参考方向', step: 2, multiline: true },
  { key: 'notes', label: '补充说明', placeholder: '其他需要 AI 了解的信息', step: 2, multiline: true },
]

const initialValues: TextValues = {
  mode: 'quick',
  name: '',
  platform: 'ozon',
  category: '',
  specifications: '',
  priceRange: '',
  sellingPoints: '',
  audience: '',
  brandTone: '',
  competitorLinks: '',
  prohibitedWords: '',
  desiredStyle: '',
  notes: '',
}

const uniqueId = () => globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`
const fileFingerprint = (file: File) => `${file.name}\u0000${file.size}\u0000${file.type}\u0000${file.lastModified}`

const legacyRunState = (status: CommerceFormStatus, progress: AssetUploadProgress | null, error: string): CommerceRunState => {
  const phase = {
    idle: 'editing', creating: 'creating-project', uploading: 'uploading', starting: 'starting-generation',
    queued: 'generating', processing: 'generating', completed: 'completed', failed: 'recoverable-error', cancelled: 'terminal-error',
  }[status] as CommerceRunState['phase']
  return {
    ...initialCommerceRunState,
    phase,
    progress,
    error: error ? new CommerceRepositoryError('SERVICE_ERROR', error) : null,
  }
}

export function CommerceProjectForm({
  onSubmitted,
  busy = false,
  runState,
  status = 'idle',
  progress = null,
  error = '',
  creditsLabel = '登录后查看',
  onRetry,
  onRecoverAuthentication,
  onMaterialChange,
  onDraftChange,
  initialDraft,
  initialFileNotice = '',
  draftKey = 0,
}: CommerceProjectFormProps) {
  const [values, setValues] = useState<TextValues>(initialValues)
  const [previews, setPreviews] = useState<PreviewFile[]>([])
  const [consented, setConsented] = useState(false)
  const [fileError, setFileError] = useState('')
  const [fileNotice, setFileNotice] = useState('')
  const [currentStep, setCurrentStep] = useState<CommerceStep>(1)
  const [furthestStep, setFurthestStep] = useState<CommerceStep>(1)
  const [stepError, setStepError] = useState('')
  const livePreviews = useRef(new Map<string, string>())
  const draftRef = useRef(initialDraft)
  draftRef.current = initialDraft

  useEffect(() => () => {
    livePreviews.current.forEach((url) => URL.revokeObjectURL(url))
    livePreviews.current.clear()
  }, [])

  useEffect(() => {
    const draft = draftRef.current
    livePreviews.current.forEach((url) => URL.revokeObjectURL(url))
    livePreviews.current.clear()
    const { files = [], ...draftValues } = draft ?? {}
    setValues({ ...initialValues, ...draftValues })
    const nextPreviews = files.map((file) => {
      const id = uniqueId()
      const url = URL.createObjectURL(file)
      livePreviews.current.set(id, url)
      return { id, file, url }
    })
    setPreviews(nextPreviews)
    setConsented(false)
    setFileError('')
    setFileNotice(initialFileNotice)
    setCurrentStep(1)
    setFurthestStep(1)
    setStepError('')
  }, [draftKey, initialFileNotice])

  const input = useMemo<CommerceProjectInput>(() => ({
    ...values,
    files: previews.map((preview) => preview.file),
  }), [previews, values])
  useEffect(() => { onDraftChange?.(input) }, [input, onDraftChange])
  const effectiveRunState = runState ?? legacyRunState(status, progress, error)
  const authRecovery = effectiveRunState.phase === 'auth-recovery'
  const validation = useMemo(() => validateProjectInput(input), [input])
  const canSubmit = validation.ok && consented && !busy
  const missingRequirements = [
    values.name.replace(/\s/g, '') ? '' : '产品名称',
    previews.length > 0 ? '' : '至少 1 张产品图',
    consented ? '' : '素材权利与 AI 处理确认',
  ].filter(Boolean)
  const selectedPlatform = platforms.find((platform) => platform.value === values.platform) ?? platforms[0]
  const productStepReady = Boolean(values.name.trim()) && previews.length > 0

  const selectStep = (step: CommerceStep) => {
    if (step > furthestStep) return
    setStepError('')
    setCurrentStep(step)
  }

  const nextStep = () => {
    if (currentStep === 1 && !productStepReady) {
      setStepError('请先填写产品名称并上传至少 1 张产品图。')
      return
    }
    const next = Math.min(3, currentStep + 1) as CommerceStep
    setStepError('')
    setFurthestStep((current) => Math.max(current, next) as CommerceStep)
    setCurrentStep(next)
  }

  const updateValue = (key: keyof TextValues, value: string) => {
    onMaterialChange?.()
    setValues((current) => ({ ...current, [key]: value }))
  }

  const setMode = (mode: ProjectMode) => {
    onMaterialChange?.()
    setValues((current) => ({ ...current, mode }))
  }

  const addFiles = (event: ChangeEvent<HTMLInputElement>) => {
    const incoming = Array.from(event.target.files ?? [])
    event.target.value = ''
    setFileError('')
    setFileNotice('')
    if (incoming.length === 0) return
    const knownFingerprints = new Set(previews.map((preview) => fileFingerprint(preview.file)))
    const uniqueIncoming: File[] = []
    const duplicateNames: string[] = []
    incoming.forEach((file) => {
      const fingerprint = fileFingerprint(file)
      if (knownFingerprints.has(fingerprint)) {
        duplicateNames.push(file.name)
        return
      }
      knownFingerprints.add(fingerprint)
      uniqueIncoming.push(file)
    })
    if (previews.length + uniqueIncoming.length > 6) {
      setFileError('最多上传 6 张产品图，请移除后再添加。')
      return
    }
    const errors = uniqueIncoming.flatMap((file) => validateProductFile(file).errors.map((message) => `${file.name}：${message}`))
    if (errors.length > 0) {
      setFileError(errors.join('；'))
      return
    }
    if (uniqueIncoming.length === 0) {
      setFileNotice(`已跳过重复图片：${duplicateNames.join('、')}`)
      return
    }
    const additions = uniqueIncoming.map((file) => {
      const id = uniqueId()
      const url = URL.createObjectURL(file)
      livePreviews.current.set(id, url)
      return { id, file, url }
    })
    onMaterialChange?.()
    setPreviews((current) => [...current, ...additions])
    if (duplicateNames.length > 0) setFileNotice(`已跳过重复图片：${duplicateNames.join('、')}`)
  }

  const removeFile = (id: string) => {
    const url = livePreviews.current.get(id)
    if (url) URL.revokeObjectURL(url)
    livePreviews.current.delete(id)
    onMaterialChange?.()
    setPreviews((current) => current.filter((preview) => preview.id !== id))
    setFileError('')
    setFileNotice('')
  }

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!canSubmit || effectiveRunState.phase !== 'editing') return
    void onSubmitted(input)
  }

  const renderProfessionalFields = (step: 1 | 2) => (
    <div className="commerce-professional-fields commerce-professional-group" data-professional-step={step}>
      {professionalFields.filter((field) => field.step === step).map((field) => (
        <label className="commerce-field" key={field.key}>
          <span>{field.label}</span>
          {field.multiline ? (
            <textarea
              disabled={busy}
              value={values[field.key] ?? ''}
              onChange={(event) => updateValue(field.key, event.target.value)}
              placeholder={field.placeholder}
              maxLength={2000}
              rows={3}
            />
          ) : (
            <input
              disabled={busy}
              value={values[field.key] ?? ''}
              onChange={(event) => updateValue(field.key, event.target.value)}
              placeholder={field.placeholder}
              maxLength={2000}
            />
          )}
        </label>
      ))}
    </div>
  )

  return (
    <form className="commerce-workspace" data-current-step={currentStep} onSubmit={submit} noValidate>
      <div className="commerce-form-column">
        <CommerceStepRail currentStep={currentStep} furthestStep={furthestStep} onSelect={selectStep} />

        <section className="commerce-form-section commerce-product-section" data-step="1" hidden={currentStep !== 1} aria-labelledby="commerce-product-heading">
          <header><span>01 / PRODUCT</span><h2 id="commerce-product-heading">先看产品本身</h2></header>
          <div className="commerce-mode-block" aria-labelledby="commerce-mode-heading">
            <h3 id="commerce-mode-heading">分析深度</h3>
            <div className="commerce-mode-tabs" role="group" aria-label="分析模式">
              {(['quick', 'professional'] as const).map((mode) => <button type="button" aria-pressed={values.mode === mode} aria-label={mode === 'quick' ? '快速模式' : '专业模式'} disabled={busy} className={values.mode === mode ? 'is-active' : ''} onClick={() => setMode(mode)} key={mode}>{mode === 'quick' ? '快速模式' : '专业模式'}<small>{mode === 'quick' ? '只填必要信息' : '补充完整营销语境'}</small></button>)}
            </div>
          </div>
          <label className="commerce-field">
            <span>产品名称</span>
            <input disabled={busy} value={values.name} onChange={(event) => updateValue('name', event.target.value)} aria-label="产品名称" aria-describedby="commerce-name-requirement" maxLength={80} placeholder="例如：真空不锈钢保温杯" required />
            <small id="commerce-name-requirement">必填，去除空格后不超过 80 字。</small>
          </label>
          <div className="commerce-upload-field">
            <div><span>产品图片</span><small>JPEG / PNG / WebP，单张不超过 8 MB，最多 6 张</small></div>
            <label className="commerce-upload-trigger">
              <input aria-label="上传产品图" aria-describedby={fileError ? 'commerce-file-error' : fileNotice ? 'commerce-file-notice' : undefined} aria-invalid={fileError ? true : undefined} disabled={busy || authRecovery} type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={addFiles} />
              <span>选择图片</span><i>{previews.length} / 6</i>
            </label>
          </div>
          {fileError && <p className="commerce-inline-error" id="commerce-file-error" role="alert">{fileError}</p>}
          {fileNotice && <p className="commerce-inline-notice" id="commerce-file-notice" role="status" aria-label="文件提示">{fileNotice}</p>}
          {previews.length > 0 && <ul className="commerce-previews" aria-label="已选产品图">
            {previews.map((preview, index) => <li key={preview.id}>
              <img src={preview.url} alt={`${preview.file.name} 预览`} />
              <span><b>0{index + 1}</b>{preview.file.name}<small>{(preview.file.size / 1024 / 1024).toFixed(2)} MB</small></span>
              <button type="button" disabled={busy || authRecovery} onClick={() => removeFile(preview.id)} aria-label={`移除 ${preview.file.name}`}>×</button>
            </li>)}
          </ul>}
          {values.mode === 'professional' && renderProfessionalFields(1)}
          {stepError && <p className="commerce-step-error" role="alert">{stepError}</p>}
        </section>

        <section className="commerce-form-section commerce-market-section" data-step="2" hidden={currentStep !== 2} data-testid="market-step" aria-labelledby="commerce-market-heading">
          <header><span>02 / MARKET</span><h2 id="commerce-market-heading">选择销售语境</h2></header>
          <fieldset className="commerce-platforms">
            <legend>目标平台</legend>
            {platforms.map((platform) => <label key={platform.value} className={values.platform === platform.value ? 'is-selected' : ''}>
              <input disabled={busy} type="radio" name="platform" value={platform.value} checked={values.platform === platform.value} onChange={() => updateValue('platform', platform.value)} />
              <span><strong>{platform.name}</strong><small>{platform.context}</small></span><i aria-hidden="true" />
            </label>)}
          </fieldset>
          {values.mode === 'professional' && renderProfessionalFields(2)}
        </section>

        <section className="commerce-form-section commerce-confirm-section" data-step="3" hidden={currentStep !== 3} data-testid="confirm-step" aria-labelledby="commerce-confirm-heading">
          <header><span>03 / CONFIRM</span><h2 id="commerce-confirm-heading">核对并确认</h2></header>
          <dl className="commerce-confirm-summary">
            <div><dt>产品</dt><dd>{values.name || '尚未命名'}</dd></div><div><dt>目标平台</dt><dd>{selectedPlatform.name}</dd></div><div><dt>分析模式</dt><dd>{values.mode === 'quick' ? '快速模式' : '专业模式'}</dd></div><div><dt>图片</dt><dd>{previews.length} 张</dd></div>
          </dl>
          <label className="commerce-consent">
            <input disabled={busy || authRecovery} type="checkbox" checked={consented} aria-describedby="commerce-consent-requirement" onChange={(event) => setConsented(event.target.checked)} required />
            <span><strong>我确认拥有这些素材的使用权，并同意本次 AI 处理。</strong>图片会通过短期签名地址发送给当前 AI 服务商进行分析；原图默认保留 7 天，之后自动清理。</span>
          </label>
          <small id="commerce-consent-requirement" className="commerce-required-note">此项为提交分析前的必要确认。</small>
        </section>

        <div className="commerce-step-actions" aria-label="步骤操作">
          {currentStep > 1 && <button type="button" onClick={() => selectStep((currentStep - 1) as CommerceStep)}>上一步</button>}
        </div>
      </div>

      <CommerceRunPanel step={currentStep} productName={values.name} platformName={selectedPlatform.name} modeName={values.mode === 'quick' ? '快速' : '专业'} imageCount={previews.length} creditsLabel={creditsLabel} state={effectiveRunState} formValidity={validation.ok && consented} requirements={missingRequirements} onNext={nextStep} onRetry={onRetry} onRecoverAuthentication={onRecoverAuthentication} onRecovery={() => selectStep(1)} />
    </form>
  )
}
