import type { RunSummary } from '../report/summary'

interface SummaryPanelProps {
  summary: RunSummary
  saved: boolean
  passes?: RunSummary[]
  onJump?: (measure: number) => void
  onPracticeAround?: (measure: number) => void
}

export function SummaryPanel({ summary, saved, passes = [], onJump, onPracticeAround }: SummaryPanelProps) {
  const percent = Math.round(summary.hitRate * 100)
  const mean =
    summary.meanOffsetMs == null
      ? '—'
      : `${summary.meanOffsetMs > 0 ? '+' : ''}${Math.round(summary.meanOffsetMs)} ms`
  const spread = summary.timingSpreadMs == null ? '—' : `${Math.round(summary.timingSpreadMs)} ms`
  return (
    <section className="summary" aria-label="这次成绩">
      <div className="summary-score">
        <p className="summary-kicker">命中率</p>
        <p className="summary-percent">{percent}%</p>
        <p className="summary-sub">
          已判定 {summary.judged || 0} 个音，命中 {summary.hits}
          {summary.unplayed > 0 ? ` · 还没弹到 ${summary.unplayed}` : ''}
        </p>
      </div>
      <div className="summary-stats">
        <p>
          <span>平均偏差</span>
          <strong>{mean}</strong>
        </p>
        <p>
          <span>分散</span>
          <strong>{spread}</strong>
        </p>
        <p>
          <span>准时</span>
          <strong>{summary.timedHits === 0 ? '—' : `${summary.perfects}/${summary.timedHits}`}</strong>
        </p>
        <p>
          <span>错音 / 错过 / 多弹</span>
          <strong>
            {summary.wrongs} / {summary.misses} / {summary.extras}
          </strong>
        </p>
      </div>
      <div className="summary-measures">
        <p className="summary-kicker">每小节错音</p>
        <ol>
          {summary.errorsPerMeasure.map((measure) => (
            <li key={measure.measure} className={measure.errors > 0 ? 'has-error' : ''}>
              <button type="button" onClick={() => onJump?.(measure.measure)}>
                <strong>{measure.errors}</strong>
                <span>第 {measure.measure} 小节</span>
              </button>
              {measure.errors > 0 && onPracticeAround && (
                <button type="button" className="button ghost" onClick={() => onPracticeAround(measure.measure)}>
                  练前后一小节
                </button>
              )}
            </li>
          ))}
        </ol>
        {passes.length > 1 && (
          <p className="device-note">
            共 {passes.length} 遍，各遍命中 {passes.map((pass) => `${Math.round(pass.hitRate * 100)}%`).join('、')}
          </p>
        )}
      </div>
      <p className="summary-note">
        {summary.timedHits === 0
          ? '等待模式只看音高。要给抢拍和拖拍打分，请换成节奏模式。'
          : '平均偏差为负是抢拍，为正是拖拍。分散是这些偏差散得有多开。'}
        {summary.unplayed > 0 ? ' 没弹到的音不算错过。' : ''}
        {summary.untiedWrongs > 0 ? ` ${summary.untiedWrongs} 个错键没有换成谱上的音。` : ''}
        {saved ? ' 已保存在这个浏览器里。' : ''}
      </p>
    </section>
  )
}
