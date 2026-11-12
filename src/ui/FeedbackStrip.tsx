import type { Judgement, ScoreNote } from '../judge/types'
import { noteName } from '../score/pitch'
import { PERFECT_BAND, describeJudgement, describeNotes, judgementTone, meterPercent } from './format'
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
  const waiting = current.length > 0 ? describeNotes(current) : null
  const measure = current[0]?.measure
  const tone = last ? judgementTone(last) : 'idle'
  const showMeter = last?.result === 'hit' && typeof last.offsetMs === 'number'

  let headline = '下面的键盘已经接上。准备好再开始，乐谱才会听。'
  if (status === 'countin') headline = '预备。数完就从当前音进入。'
  else if (status === 'playing' && waiting) headline = `下一个：${waiting}`
  else if (status === 'playing') headline = '继续。'
  else if (status === 'finished') headline = '这次练完了。'
  else if (waiting && status === 'idle') headline = `开头：${waiting}`

  return (
    <section className="feedback" aria-live="polite">
      <div className="feedback-copy">
        <p className="feedback-kicker">
          {modeLabel}
          {measure ? ` · 第 ${measure} 小节` : ''}
        </p>
        <p className="feedback-headline">{headline}</p>
        <p className={`feedback-last tone-${tone}`}>{last ? describeJudgement(last) : ' '}</p>
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
