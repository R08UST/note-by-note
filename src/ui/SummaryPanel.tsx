import type { RunSummary } from '../report/summary'

interface SummaryPanelProps {
  summary: RunSummary
  saved: boolean
}

export function SummaryPanel({ summary, saved }: SummaryPanelProps) {
  const percent = Math.round(summary.hitRate * 100)
  const mean =
    summary.meanOffsetMs == null
      ? '—'
      : `${summary.meanOffsetMs > 0 ? '+' : ''}${Math.round(summary.meanOffsetMs)} ms`
  const spread = summary.timingSpreadMs == null ? '—' : `${Math.round(summary.timingSpreadMs)} ms`
  return (
    <section className="summary" aria-label="Run summary">
      <div className="summary-score">
        <p className="summary-kicker">Hit rate</p>
        <p className="summary-percent">{percent}%</p>
        <p className="summary-sub">
          {summary.hits} of {summary.judged || 0} judged notes
          {summary.unplayed > 0 ? ` · ${summary.unplayed} not reached` : ''}
        </p>
      </div>
      <div className="summary-stats">
        <p>
          <span>Mean offset</span>
          <strong>{mean}</strong>
        </p>
        <p>
          <span>Timing spread</span>
          <strong>{spread}</strong>
        </p>
        <p>
          <span>On time</span>
          <strong>{summary.timedHits === 0 ? '—' : `${summary.perfects}/${summary.timedHits}`}</strong>
        </p>
        <p>
          <span>Wrong / missed / extra</span>
          <strong>
            {summary.wrongs} / {summary.misses} / {summary.extras}
          </strong>
        </p>
      </div>
      <div className="summary-measures">
        <p className="summary-kicker">Errors per measure</p>
        <ol>
          {summary.errorsPerMeasure.map((measure) => (
            <li key={measure.measure} className={measure.errors > 0 ? 'has-error' : ''}>
              <strong>{measure.errors}</strong>
              <span>bar {measure.measure}</span>
            </li>
          ))}
        </ol>
      </div>
      <p className="summary-note">
        {summary.timedHits === 0
          ? 'Wait mode checks pitches. Switch to Rhythm to score early and late.'
          : 'Mean offset is negative when you rush and positive when you drag. Spread is how widely those offsets scatter.'}
        {summary.unplayed > 0 ? ' Unplayed notes were not marked as misses.' : ''}
        {summary.untiedWrongs > 0 ? ` ${summary.untiedWrongs} wrong key${summary.untiedWrongs === 1 ? '' : 's'} did not replace a written note.` : ''}
        {saved ? ' Saved in this browser.' : ''}
      </p>
    </section>
  )
}
