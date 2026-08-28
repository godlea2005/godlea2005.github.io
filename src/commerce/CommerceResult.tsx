import { useEffect, useRef, useState } from 'react'
import type { CommerceResult as CommerceResultData, Confidence, HeroDirection } from './types'

type CopyState = { key: string; kind: 'success' | 'error'; message: string } | null

export type CommerceResultProps = {
  result: CommerceResultData
  onRerunDirection?: (direction: HeroDirection, index: number) => void
  onPrint?: () => void
}

const confidenceLabels: Record<Confidence, string> = {
  confirmed: '已确认',
  inferred: 'AI 推测',
  'needs-confirmation': '待确认',
}

const lines = (values: string[], empty = '无') => values.length > 0 ? values.map((value) => `- ${value}`).join('\n') : `- ${empty}`

/** Serializes only the public result contract. Unknown object keys can never leak into clipboard output. */
export const commerceResultToMarkdown = (result: CommerceResultData): string => {
  const sections = [
    '# AI 电商视觉方案',
    '',
    result.productSummary,
    '',
    '## 信息可信度',
    ...result.facts.map((fact) => `- **${fact.label}**：${fact.value}（${confidenceLabels[fact.confidence]}）`),
    '',
    '## 用户与动机',
    ...result.audiences.map((audience) => `- **${audience.segment}**：${audience.motivation}`),
    '',
    '## 卖点优先级',
    ...result.sellingPoints.map((item) => `${item.rank}. **${item.point}**：${item.reason}（${confidenceLabels[item.confidence]}）`),
    '',
    '## 平台策略',
    `- 策略：${result.platformStrategy.overview}`,
    `- 信息密度：${result.platformStrategy.contentDensity}`,
    `- 语气：${result.platformStrategy.tone}`,
    `- 合规注意：\n${lines(result.platformStrategy.complianceNotes)}`,
    '',
    '## 三套主图方向',
    ...result.heroDirections.flatMap((direction, index) => [
      `### ${index + 1}. ${direction.title}`,
      `- 策略依据：${direction.rationale}`,
      `- 构图：${direction.composition}`,
      `- 背景：${direction.background}`,
      `- 色彩：${direction.palette.join(' / ')}`,
      `- 光线：${direction.lighting}`,
      `- 道具：${direction.props.join(' / ') || '无'}`,
      `- 文案位置：${direction.copyPlacement}`,
      `- 视觉焦点：${direction.visualFocus}`,
      `- 图片提示词：${direction.imagePrompt}`,
      `- 负面提示词：${direction.negativePrompt}`,
      '',
    ]),
    '## 详情分镜',
    ...result.detailFrames.flatMap((frame) => [
      `### ${frame.order}. ${frame.purpose}`,
      `- 画面：${frame.visual}`,
      `- 画面文案：${frame.copy}`,
      ...(frame.copyTranslation ? [`- 中文解释：${frame.copyTranslation}`] : []),
      `- 转场：${frame.transition}`,
      '',
    ]),
    '## 尺寸与安全区',
    ...result.recommendedCanvas.map((canvas) => `- **${canvas.usage}**：${canvas.ratio} / ${canvas.pixels} / 安全区 ${canvas.safeZone}`),
    '',
    '## 保真规则',
    lines(result.fidelityRules),
    '',
    '## 待确认项',
    lines(result.pendingConfirmations),
  ]
  return sections.join('\n').trim()
}

export function CommerceResult({ result, onRerunDirection, onPrint }: CommerceResultProps) {
  const [copyState, setCopyState] = useState<CopyState>(null)
  const feedbackTimer = useRef<number | null>(null)

  useEffect(() => () => {
    if (feedbackTimer.current !== null) window.clearTimeout(feedbackTimer.current)
  }, [])

  const copy = async (key: string, value: string) => {
    if (feedbackTimer.current !== null) window.clearTimeout(feedbackTimer.current)
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable')
      await navigator.clipboard.writeText(value)
      setCopyState({ key, kind: 'success', message: '已复制' })
    } catch {
      setCopyState({ key, kind: 'error', message: '复制失败，请手动选择并复制内容。' })
    }
    feedbackTimer.current = window.setTimeout(() => setCopyState((current) => current?.key === key ? null : current), 2200)
  }

  const feedback = (key: string) => copyState?.key === key
    ? <span className="commerce-copy-feedback" role={copyState.kind === 'error' ? 'alert' : 'status'}>{copyState.message}</span>
    : null

  return <article className="commerce-result commerce-result-printable" aria-label="AI 电商视觉方案">
    <header className="commerce-result-header">
      <div><span>OUTPUT / STRATEGY FILE</span><h2>{result.productSummary}</h2></div>
      <div className="commerce-result-actions commerce-print-hidden">
        <button type="button" onClick={() => void copy('whole', commerceResultToMarkdown(result))}>复制整套方案</button>
        <button type="button" onClick={onPrint ?? (() => window.print())}>打印方案</button>
        {feedback('whole')}
      </div>
    </header>

    <section className="commerce-result-section" data-result-section="confidence" aria-labelledby="result-confidence">
      <header><span>01 / FACT SIGNAL</span><h3 id="result-confidence">信息可信度</h3></header>
      <dl className="commerce-facts">{result.facts.map((fact, index) => <div key={`${fact.label}-${index}`}>
        <dt>{fact.label}</dt><dd>{fact.value}</dd><span data-confidence={fact.confidence}>{confidenceLabels[fact.confidence]}</span>
      </div>)}</dl>
    </section>

    <section className="commerce-result-section" data-result-section="audiences" aria-labelledby="result-audiences">
      <header><span>02 / AUDIENCE</span><h3 id="result-audiences">用户与动机</h3></header>
      <div className="commerce-audiences">{result.audiences.map((audience, index) => <article key={`${audience.segment}-${index}`}>
        <strong>{audience.segment}</strong><p>{audience.motivation}</p>
      </article>)}</div>
    </section>

    <section className="commerce-result-section" data-result-section="selling-points" aria-labelledby="result-selling-points">
      <header><span>03 / PRIORITY</span><h3 id="result-selling-points">卖点优先级</h3></header>
      <ol className="commerce-selling-points">{result.sellingPoints.map((item, index) => <li key={`${item.rank}-${item.point}-${index}`}>
        <span>{String(item.rank).padStart(2, '0')}</span><div><strong>{item.point}</strong><p>{item.reason}</p></div><em data-confidence={item.confidence}>{confidenceLabels[item.confidence]}</em>
      </li>)}</ol>
    </section>

    <section className="commerce-result-section" data-result-section="platform-strategy" aria-labelledby="result-platform">
      <header><span>04 / PLATFORM</span><h3 id="result-platform">平台策略</h3></header>
      <p className="commerce-strategy-lead">{result.platformStrategy.overview}</p>
      <dl className="commerce-strategy-meta"><div><dt>信息密度</dt><dd>{result.platformStrategy.contentDensity}</dd></div><div><dt>内容语气</dt><dd>{result.platformStrategy.tone}</dd></div></dl>
      <ul>{result.platformStrategy.complianceNotes.map((note, index) => <li key={`${note}-${index}`}>{note}</li>)}</ul>
    </section>

    <section className="commerce-result-section" data-result-section="hero-directions" aria-labelledby="result-heroes">
      <header><span>05 / HERO SYSTEM</span><h3 id="result-heroes">三套主图方向</h3></header>
      <div className="commerce-hero-directions">{result.heroDirections.map((direction, index) => {
        const promptKey = `hero-${index}-prompt`
        const negativeKey = `hero-${index}-negative`
        return <article key={`${direction.title}-${index}`} aria-label={`主图方向 ${index + 1}：${direction.title}`}>
          <div className="commerce-direction-index"><span>0{index + 1}</span><i /></div>
          <h4>{direction.title}</h4><p className="commerce-direction-rationale">{direction.rationale}</p>
          <dl>
            <div><dt>构图</dt><dd>{direction.composition}</dd></div><div><dt>背景</dt><dd>{direction.background}</dd></div>
            <div><dt>光线</dt><dd>{direction.lighting}</dd></div><div><dt>视觉焦点</dt><dd>{direction.visualFocus}</dd></div>
            <div><dt>文案位置</dt><dd>{direction.copyPlacement}</dd></div><div><dt>色彩</dt><dd>{direction.palette.join(' / ')}</dd></div>
            <div><dt>道具</dt><dd>{direction.props.join(' / ') || '无'}</dd></div>
          </dl>
          <div className="commerce-prompt-block"><span>IMAGE PROMPT</span><p>{direction.imagePrompt}</p><div className="commerce-copy-row commerce-print-hidden"><button type="button" onClick={() => void copy(promptKey, direction.imagePrompt)}>复制提示词</button>{feedback(promptKey)}</div></div>
          <div className="commerce-prompt-block"><span>NEGATIVE PROMPT</span><p>{direction.negativePrompt}</p><div className="commerce-copy-row commerce-print-hidden"><button type="button" onClick={() => void copy(negativeKey, direction.negativePrompt)}>复制负面提示词</button>{feedback(negativeKey)}</div></div>
          {onRerunDirection ? <button className="commerce-rerun commerce-print-hidden" type="button" onClick={() => onRerunDirection(direction, index)}>基于此方向重做 <i aria-hidden="true">↗</i></button> : null}
        </article>
      })}</div>
    </section>

    <section className="commerce-result-section" data-result-section="detail-frames" aria-labelledby="result-frames">
      <header><span>06 / STORYBOARD</span><h3 id="result-frames">详情分镜</h3></header>
      <div className="commerce-detail-frames">{result.detailFrames.map((frame, index) => <article key={`${frame.order}-${index}`} aria-label={`详情分镜 ${frame.order}`}>
        <span>{String(frame.order).padStart(2, '0')}</span><div><h4>{frame.purpose}</h4><p>{frame.visual}</p>
          <div className="commerce-frame-copy"><div><small>{frame.copyTranslation ? '俄文文案' : '画面文案'}</small><strong lang={frame.copyTranslation ? 'ru' : undefined}>{frame.copy}</strong></div>
          {frame.copyTranslation ? <div><small>中文解释</small><strong>{frame.copyTranslation}</strong></div> : null}</div>
          <em>{frame.transition}</em>
        </div>
      </article>)}</div>
    </section>

    <section className="commerce-result-section" data-result-section="canvas" aria-labelledby="result-canvas">
      <header><span>07 / SAFE AREA</span><h3 id="result-canvas">尺寸与安全区</h3></header>
      <div className="commerce-canvas-list">{result.recommendedCanvas.map((canvas, index) => <article key={`${canvas.usage}-${index}`}><strong>{canvas.usage}</strong><span>{canvas.ratio}</span><span>{canvas.pixels}</span><p>{canvas.safeZone}</p></article>)}</div>
    </section>

    <section className="commerce-result-section" data-result-section="fidelity" aria-labelledby="result-fidelity">
      <header><span>08 / FIDELITY</span><h3 id="result-fidelity">保真规则</h3></header>
      <ul className="commerce-rule-list">{result.fidelityRules.map((rule, index) => <li key={`${rule}-${index}`}>{rule}</li>)}</ul>
    </section>

    <section className="commerce-result-section" data-result-section="confirmations" aria-labelledby="result-confirmations">
      <header><span>09 / OPEN ITEMS</span><h3 id="result-confirmations">待确认项</h3></header>
      {result.pendingConfirmations.length ? <ul className="commerce-rule-list commerce-confirmation-list">{result.pendingConfirmations.map((item, index) => <li key={`${item}-${index}`}>{item}</li>)}</ul> : <p className="commerce-empty-line">当前没有待确认项。</p>}
    </section>
  </article>
}
