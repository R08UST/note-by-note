import type { Judgement, ScoreNote } from '../judge/types'
import { noteName } from '../score/pitch'
import { PERFECT_BAND, describeJudgement, judgementTone, meterPercent } from './format'
import type { RunStatus } from './usePractice'

interface FeedbackStripProps {
  status: RunStatus
  modeLabel: string
  last: Judgement | null
  recent: Judgement[]
  current: ScoreNote[]
  hits: number
  wrongs: number
  misses: number
  extras: number
}

export function FeedbackStrip({
  status,
  modeLabel,
  last,
  recent,
  current,
  hits,
  wrongs,
  misses,
  extras,
}: FeedbackStripProps) {
  const waiting = current.length > 0 ? current.map((note) => noteName(note.pitch)).join(' + ') : null
  const measure = current[0]?.measure
  const tone = last ? judgementTone(last) : 'idle'
  const showMeter = last?.result === 'hit' && typeof last.offsetMs === 'number'

  let headline = 'The keyboard below is live. Start when you want the score to listen.'
  if (status === 'countin') headline = 'Count-in. The bar begins on the next downbeat.'
  else if (status === 'playing' && waiting) headline = `Next: ${waiting}`
  else if (status === 'playing') headline = 'Keep going.'
  else if (status === 'finished') headline = 'Run finished.'
  else if (waiting && status === 'idle') headline = `First notes: ${waiting}`

  return (
    <section className="feedback" aria-live="polite">
      <div className="feedback-copy">
        <p className="feedback-kicker">
          {modeLabel}
          {measure ? ` · measure ${measure}` : ''}
        </p>
        <p className="feedback-headline">{headline}</p>
        {last && <p className={`feedback-last tone-${tone}`}>{describeJudgement(last)}</p>}
      </div>
      <div className="feedback-meter" hidden={!showMeter}>
        <div className="meter">
          <span className="meter-perfect" style={{ left: `${PERFECT_BAND.start}%`, width: `${PERFECT_BAND.end - PERFECT_BAND.start}%` }} />
          {showMeter && last?.offsetMs != null && <span className="meter-mark" style={{ left: `${meterPercent(last.offsetMs)}%` }} />}
        </div>
        <div className="meter-labels">
          <span>early</span>
          <span>on time</span>
          <span>late</span>
        </div>
      </div>
      {recent.length > 0 && (
        <ol className="history">
          {recent.map((item, index) => (
            <li key={`${item.noteId ?? 'x'}-${index}`} className={`tone-${judgementTone(item)}`}>
              {noteName(item.pitch)}
            </li>
          ))}
        </ol>
      )}
      <dl className="tally">
        <div>
          <dt>Hits</dt>
          <dd>{hits}</dd>
        </div>
        <div>
          <dt>Wrong</dt>
          <dd>{wrongs}</dd>
        </div>
        <div>
          <dt>Missed</dt>
          <dd>{misses}</dd>
        </div>
        <div>
          <dt>Extra</dt>
          <dd>{extras}</dd>
        </div>
      </dl>
    </section>
  )
}
