import type { RunSummary } from '../report/summary'

interface SummaryPanelProps {
  summary: RunSummary
  saved: boolean
  passes?: RunSummary[]
  collapsed?: boolean
  onToggleCollapsed?: () => void
  onClose?: () => void
  onJump?: (measure: number) => void
  onPracticeAround?: (measure: number) => void
}

function heatColor(errors: number, expected: number): string {
  if (expected <= 0 || errors <= 0) return '#7dbea4'
  const ratio = errors / expected
  if (ratio < 0.34) return '#e0b15a'
  return '#d4533a'
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
}: SummaryPanelProps) {
  const percent = Math.round(summary.hitRate * 100)
  const mean =
    summary.meanOffsetMs == null
      ? '—'
      : `${summary.meanOffsetMs > 0 ? '+' : ''}${Math.round(summary.meanOffsetMs)} ms`
  return (
    <section className={collapsed ? 'summary is-collapsed' : 'summary'} aria-label="这次成绩">
      <div className="summary-head">
        <p className="summary-kicker">命中率</p>
        <p className="summary-percent">{percent}%</p>
        {!collapsed && (
          <p className="summary-sub">
            {summary.hits}/{summary.judged || 0} 命中
            {summary.timedHits > 0 ? ` · 平均 ${mean}` : ''}
            {` · 错 ${summary.wrongs} · 错过 ${summary.misses}`}
            {saved ? ' · 已保存' : ''}
          </p>
        )}
        <div className="summary-actions">
          <button type="button" className="button ghost" onClick={onToggleCollapsed}>
            {collapsed ? '展开' : '收起'}
          </button>
          <button type="button" className="button ghost" onClick={onClose}>
            关闭
          </button>
        </div>
      </div>
      {!collapsed && (
        <>
          <div className="heat-strip" aria-label="每小节结果">
            {summary.errorsPerMeasure.map((measure) => (
              <button
                key={measure.measure}
                type="button"
                className="heat-cell"
                style={{ background: heatColor(measure.errors, measure.expected) }}
                title={`第 ${measure.measure} 小节，错 ${measure.errors}/${measure.expected}。点一下跳过去，按住 Shift 再点就循环这一段。`}
                aria-label={`第 ${measure.measure} 小节，错 ${measure.errors} 个`}
                onClick={(event) => {
                  if (event.shiftKey) onPracticeAround?.(measure.measure)
                  else onJump?.(measure.measure)
                }}
              />
            ))}
          </div>
          <p className="summary-note">
            绿是干净，黄是有错，红是错得多。点一下跳到该小节，按住 Shift 再点就循环前后一小节。
            {passes.length > 1 ? ` 共 ${passes.length} 遍：${passes.map((pass) => `${Math.round(pass.hitRate * 100)}%`).join('、')}。` : ''}
          </p>
        </>
      )}
    </section>
  )
}
