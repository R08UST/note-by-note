import type { Judgement, ScoreNote } from '../judge/types'
import { noteName } from '../score/pitch'
import { PERFECT_BAND, describeJudgement, describeNotes, judgementTone, meterPercent } from './format'
import type { RunStatus } from './usePractice'

interface FeedbackStripProps {
  status: RunStatus
  modeLabel: string
  liveBpm?: number | null
  last: Judgement | null
  recent: Judgement[]
  current: ScoreNote[]
  hits: number
  wrongs: number
  misses: number
  extras: number
  /** The last bar reached when a run stopped before the end, so the strip does not claim the piece was finished. */
  stoppedAt?: number | null
  /** How to begin in the current mode, shown before the first key of a run. */
  hint?: string
}

export function FeedbackStrip({
  status,
  modeLabel,
  liveBpm = null,
  last,
  recent,
  current,
  hits,
  wrongs,
  misses,
  extras,
  stoppedAt = null,
  hint = '',
}: FeedbackStripProps) {
  const waiting = current.length > 0 ? describeNotes(current) : null
  const measure = current[0]?.measure
  const tone = last ? judgementTone(last) : 'idle'
  const showMeter = last?.result === 'hit' && typeof last.offsetMs === 'number'

  let headline = '准备好就开始，乐谱才会听。'
  if (status === 'countin') headline = '预备。数完就从当前音进入。'
  else if (status === 'playing' && waiting) headline = `下一个：${waiting}`
  else if (status === 'playing') headline = '继续。'
  else if (status === 'finished') headline = stoppedAt != null ? `停在第 ${stoppedAt} 小节。` : '这次练完了。'
  else if (waiting && status === 'idle') headline = `开头：${waiting}`

  return (
    <section className="feedback" aria-live="polite">
      <div className="feedback-copy">
        <p className="feedback-kicker">
          {modeLabel}
          {status === 'playing' && liveBpm != null ? ` · 约 ${liveBpm} BPM` : ''}
          {measure ? ` · 第 ${measure} 小节` : ''}
        </p>
        <p className="feedback-headline">{headline}</p>
        {last || status !== 'idle' || !hint ? (
          <p className={`feedback-last tone-${tone}`}>{last ? describeJudgement(last) : ' '}</p>
        ) : (
          <p className="feedback-last feedback-hint">{hint}</p>
        )}
      </div>
      <div className="feedback-meter" hidden={!showMeter}>
        <div className="meter">
          <span className="meter-perfect" style={{ left: `${PERFECT_BAND.start}%`, width: `${PERFECT_BAND.end - PERFECT_BAND.start}%` }} />
          {showMeter && last?.offsetMs != null && <span className="meter-mark" style={{ left: `${meterPercent(last.offsetMs)}%` }} />}
        </div>
        <div className="meter-labels">
          <span>抢拍</span>
          <span>准时</span>
          <span>拖拍</span>
        </div>
      </div>
      <ol className="history">
        {recent.length === 0 ? (
          <li className="history-spacer" aria-hidden="true">
            {' '}
          </li>
        ) : (
          recent.map((item, index) => (
            <li key={`${item.noteId ?? 'x'}-${index}`} className={`tone-${judgementTone(item)}`}>
              {noteName(item.pitch)}
            </li>
          ))
        )}
      </ol>
      <dl className="tally">
        <div>
          <dt>命中</dt>
          <dd>{hits}</dd>
        </div>
        <div>
          <dt>错音</dt>
          <dd>{wrongs}</dd>
        </div>
        <div>
          <dt>错过</dt>
          <dd>{misses}</dd>
        </div>
        <div>
          <dt>多弹</dt>
          <dd>{extras}</dd>
        </div>
      </dl>
    </section>
  )
}
