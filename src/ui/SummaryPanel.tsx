import { measureReach, measureTone, type RunSummary } from '../report/summary'

interface SummaryPanelProps {
  summary: RunSummary
  saved: boolean
  passes?: RunSummary[]
  collapsed?: boolean
  onToggleCollapsed?: () => void
  onClose?: () => void
  onJump?: (measure: number) => void
  onPracticeAround?: (measure: number) => void
  onUseTempo?: (bpm: number) => void
  /** Wait mode sends a wrong key back to the start of its bar, which drops that bar's hits. */
  rewindsOnError?: boolean
}

function formatDrift(driftBpm: number | null): string | null {
  if (driftBpm == null || Math.abs(driftBpm) < 5) return null
  return driftBpm > 0 ? `后半段偏快 +${driftBpm}` : `后半段偏慢 ${driftBpm}`
}

export function SummaryPanel({
  summary,
  saved,
  passes = [],
  collapsed = false,
  onToggleCollapsed,
  onClose,
  onJump,
  onPracticeAround,
  onUseTempo,
  rewindsOnError = false,
}: SummaryPanelProps) {
  const percent = Math.round(summary.hitRate * 100)
  const mean =
    summary.meanOffsetMs == null
      ? '—'
      : `${summary.meanOffsetMs > 0 ? '+' : ''}${Math.round(summary.meanOffsetMs)} ms`
  const free = summary.freeTempo
  const stallsByMeasure = new Map(free?.perMeasure.map((item) => [item.measure, item.stalls]) ?? [])
  const driftText = formatDrift(free?.driftBpm ?? null)
  const clampedBpm = free?.bpm != null ? Math.min(160, Math.max(40, free.bpm)) : null
  const reach = measureReach(summary.errorsPerMeasure)
  const stoppedEarly = reach.total > 0 && reach.reached < reach.total
  return (
    <section className={collapsed ? 'summary is-collapsed' : 'summary'} aria-label="这次成绩">
      <div className="summary-head">
        <p className="summary-kicker">{stoppedEarly && reach.last != null ? `停在第 ${reach.last} 小节 · 命中率` : '命中率'}</p>
        <p className="summary-percent">{percent}%</p>
        {!collapsed && (
          <p className="summary-sub">
            {stoppedEarly ? `弹了 ${reach.reached}/${reach.total} 小节 · ` : ''}
            {summary.hits}/{summary.hits + summary.wrongs + summary.misses} 命中
            {summary.timedHits > 0 ? ` · 平均 ${mean}` : ''}
            {free?.bpm != null ? ` · 约 ${free.bpm} BPM` : ''}
            {` · 错 ${summary.wrongs} · 错过 ${summary.misses}`}
            {saved ? ' · 已保存' : ''}
          </p>
        )}
        <div className="summary-actions">
          {!collapsed && clampedBpm != null && onUseTempo && (
            <button type="button" className="button ghost summary-tempo-btn" onClick={() => onUseTempo(clampedBpm)}>
              按 {clampedBpm} BPM 跟拍
            </button>
          )}
          <button type="button" className="button ghost" onClick={onToggleCollapsed}>
            {collapsed ? '展开' : '收起'}
          </button>
          <button type="button" className="button ghost" onClick={onClose}>
            关闭
          </button>
        </div>
      </div>
      {!collapsed && free && (
        <div className="free-summary" aria-label="自由拍评估">
          {free.bpm == null ? (
            <p className="free-empty">再多弹几个音（至少 4 个起音点），就会自动算出自发拍速、连贯度与节奏稳定性。</p>
          ) : (
            <div className="free-metrics">
              <p>
                <span>自发拍速</span>
                <strong>约 {free.bpm} BPM</strong>
                <small>
                  {free.bpmRange && free.bpmRange.high - free.bpmRange.low >= 4
                    ? `常用区间 ${free.bpmRange.low}–${free.bpmRange.high}`
                    : '整体速度一致'}
                  {driftText ? ` · ${driftText}` : ''}
                </small>
              </p>
              <p>
                <span>连贯度</span>
                <strong>{free.fluency == null ? '—' : `${Math.round(free.fluency * 100)}%`}</strong>
                <small>
                  {free.stalls === 0
                    ? `全程流畅 · 最长 ${free.longestFlowBeats} 拍`
                    : `卡顿 ${free.stalls} 处 · 最长流畅 ${free.longestFlowBeats} 拍`}
                </small>
              </p>
              <p>
                <span>节奏稳定</span>
                <strong>{free.stability == null ? '—' : `${Math.round(free.stability * 100)}%`}</strong>
                <small>
                  {free.unevenPct == null ? '流畅段落不足' : `时值波动 ${Math.round(free.unevenPct)}%`}
                </small>
              </p>
            </div>
          )}
        </div>
      )}
      {!collapsed && (
        <>
          <div className="heat-strip" aria-label="每小节结果">
            {summary.errorsPerMeasure.map((measure) => {
              const stalls = stallsByMeasure.get(measure.measure) ?? 0
              const stallText = stalls > 0 ? `，卡顿 ${stalls} 处` : ''
              const tone = measureTone(measure, stalls)
              const what = tone === 'unplayed' ? '没弹到' : `错 ${measure.errors}/${measure.expected}${stallText}`
              return (
                <button
                  key={measure.measure}
                  type="button"
                  className={`heat-cell is-${tone}`}
                  title={`第 ${measure.measure} 小节，${what}。点一下跳过去，按住 Shift 再点就循环这一段。`}
                  aria-label={`第 ${measure.measure} 小节，${what}`}
                  onClick={(event) => {
                    if (event.shiftKey) onPracticeAround?.(measure.measure)
                    else onJump?.(measure.measure)
                  }}
                />
              )
            })}
          </div>
          <p className="summary-note">
            {free
              ? '绿是干净流畅，黄是有少量错音或卡顿，红是错得多。'
              : '绿是干净，黄是有错，红是错得多。'}
            {stoppedEarly ? '空框是没弹到的小节。' : ''}
            {rewindsOnError && summary.wrongs > 0 ? '弹错会回到这一小节开头，那一小节已弹对的音重新计。' : ''}
            点一下跳到该小节，按住 Shift 再点就循环前后一小节。
            {free && free.stallMeasures.length > 0 ? ` 卡顿小节：第 ${free.stallMeasures.join('、')} 小节。` : ''}
            {passes.length > 1 ? ` 共 ${passes.length} 遍：${passes.map((pass) => `${Math.round(pass.hitRate * 100)}%`).join('、')}。` : ''}
          </p>
        </>
      )}
    </section>
  )
}
