import { useEffect, useMemo, useRef, useState } from 'react'
import type { Judgement, PlayedEvent, ScoreNote } from '../judge/types'
import type { RunSummary } from '../report/summary'
import { noteName } from '../score/pitch'
import { listPitchStats, listTrainRuns, rememberPitches, saveTrainRun, type PitchStatRecord, type TrainRunRecord } from '../storage/db'
import { MASTERY_TAKES, PITCH_GATE, TIME_GATE, levelStars, migratedSightLevel, qualifyingCount, unlockedThrough, weaknessMap, type TakeScore } from '../train/mastery'
import { afterExercise, bankFileName, exerciseFromBank, nextHand } from '../train/bank'
import { generateFlash, generateSightPhrase, SIGHT_LEVELS, sightLevel } from '../train/sight'
import { BankBar } from './BankBar'
import { ContinueBar } from './ContinueBar'
import { bankNumber, useQuestionBank } from './useQuestionBank'
import { DrillHint, HeatKeys, LevelInfo, LevelRail, StartStop } from './TrainBits'
import { DemoBar } from './DemoBar'
import { describeNotes } from './format'
import { ScoreView, type ScoreHandle } from './ScoreView'
import { useDrill } from './useDrill'

interface SightPanelProps {
  active: boolean
  latencyOffsetMs: number
  onBind: (push: (event: PlayedEvent) => void) => void
  onSaved: () => void
  onCheckpoint: (pieceId: string) => void
  continuous: boolean
  onContinuous: (value: boolean) => void
}

const CARDS = 8

export function SightPanel({ active, latencyOffsetMs, onBind, onSaved, onCheckpoint, continuous, onContinuous }: SightPanelProps) {
  const [level, setLevel] = useState(1)
  const [kind, setKind] = useState<'flash' | 'phrase' | 'weak'>('phrase')
  const [hand, setHand] = useState<'R' | 'L' | 'both'>('R')
  const [bpm, setBpm] = useState(72)
  const [metronome, setMetronome] = useState(true)
  const [hints, setHints] = useState(false)
  const [timing, setTiming] = useState<'wait' | 'strict'>('strict')
  const [octave, setOctave] = useState<'any' | 'exact'>('any')
  const [timerSeconds, setTimerSeconds] = useState(0)
  const [seed, setSeed] = useState(1)
  const [runs, setRuns] = useState<TrainRunRecord[]>([])
  const [stats, setStats] = useState<PitchStatRecord[]>([])
  const [cardIndex, setCardIndex] = useState(0)
  const [cardResults, setCardResults] = useState<{ hit: boolean; ms: number }[]>([])
  const [flashing, setFlashing] = useState(false)
  const [flashNote, setFlashNote] = useState('')
  const [report, setReport] = useState<RunSummary | null>(null)
  const [hold, setHold] = useState<number | null>(null)
  const [session, setSession] = useState({ done: 0, clean: 0 })
  const [offer, setOffer] = useState(false)
  const scoreRef = useRef<ScoreHandle>(null)
  const declined = useRef<Set<number>>(new Set())
  const attempted = useRef<Set<string>>(new Set())
  const retrying = useRef(false)
  const continuousRef = useRef(continuous)
  continuousRef.current = continuous
  const goNextRef = useRef<() => void>(() => {})
  const holdFired = useRef(false)
  const shownAt = useRef(0)
  const lock = useRef(false)
  const weaknessRef = useRef(weaknessMap([]))

  const reload = () => {
    void listTrainRuns().then(setRuns)
    void listPitchStats().then((rows) => {
      setStats(rows)
      weaknessRef.current = weaknessMap(rows.map((stat) => ({ pitch: stat.pitch, seen: stat.seen, errors: stat.errors, reactionMs: stat.reactionMs })))
    })
  }
  useEffect(reload, [])

  const takes: TakeScore[] = runs
    .filter((run) => run.mode === 'sight-flash' || run.mode === 'sight-phrase')
    .map((run) => ({
      level: migratedSightLevel(run.level, run.curriculum),
      pitchAccuracy: run.pitchAccuracy,
      onTimeRate: run.onTimeRate,
      scoredTiming: run.scoredTiming,
      hand: run.hand,
      seed: run.seed,
      itemId: run.itemId,
      firstAttempt: run.firstAttempt,
    }))
  const unlocked = unlockedThrough(takes, SIGHT_LEVELS.length)
  const spec = sightLevel(Math.min(level, unlocked))
  const phraseLike = kind !== 'flash'
  const bank = useQuestionBank(bankFileName('s', spec.id, hand), phraseLike)

  const phrase = useMemo(() => {
    if (phraseLike && bank.current) {
      const number = bankNumber(bank.current.id)
      const built = exerciseFromBank(bank.current, `视奏 S${spec.id} · 第 ${number} 题`, hand)
      return { ...built, itemId: bank.current.id, seed: number }
    }
    const built = generateSightPhrase({ level: spec.id, seed, hand, weakness: weaknessRef.current, focusWeak: kind === 'weak' })
    return { ...built, itemId: '', seed }
  }, [phraseLike, bank.current, spec.id, hand, seed, kind])
  const cards = useMemo(() => {
    if (phraseLike) return []
    return Array.from({ length: CARDS }, (_, index) =>
      generateFlash({ level: spec.id, seed: seed + index + 1, hand: hand === 'both' ? 'R' : hand, weakness: weaknessRef.current, focusWeak: false }),
    )
  }, [phraseLike, spec.id, seed, hand])
  const card = cards[cardIndex] ?? null
  const shown = phraseLike ? phrase : card

  const drill = useDrill({
    active: active && phraseLike,
    notes: phrase.notes,
    bpm,
    timing,
    metronome,
    latencyOffsetMs,
    time: phrase.time,
    level: spec.id,
    scoreRef,
    match: (played) => played,
    onDone: (summary, judgements) => {
      setReport(summary)
      const onTime = summary.expected === 0 ? 0 : summary.perfects / summary.expected
      const accuracy = summary.expected === 0 ? 0 : summary.hits / summary.expected
      const itemId = phrase.itemId
      const retry = retrying.current
      retrying.current = false
      const firstAttempt = Boolean(itemId) && !retry && !attempted.current.has(itemId) && !bank.marks[itemId]
      if (itemId) attempted.current.add(itemId)
      const clean = accuracy >= PITCH_GATE && (timing === 'wait' || onTime >= TIME_GATE)
      void saveTrainRun({
        mode: 'sight-phrase',
        level: spec.id,
        createdAt: Date.now(),
        pitchAccuracy: accuracy,
        onTimeRate: timing === 'wait' ? 1 : onTime,
        meanOffsetMs: summary.meanOffsetMs,
        spreadMs: summary.timingSpreadMs,
        bpm,
        scoredTiming: timing === 'strict',
        hand,
        seed: phrase.seed,
        itemId: itemId || undefined,
        firstAttempt,
        curriculum: 2,
      }).then(() => {
        reload()
        onSaved()
      })
      if (itemId) bank.finish(clean)
      setSession((value) => ({ done: value.done + 1, clean: value.clean + (clean ? 1 : 0) }))
      if (firstAttempt && clean && !declined.current.has(spec.id) && spec.id < SIGHT_LEVELS.length) {
        const take: TakeScore = { level: spec.id, pitchAccuracy: accuracy, onTimeRate: timing === 'wait' ? 1 : onTime, scoredTiming: timing === 'strict', hand, itemId, firstAttempt: true }
        const before = qualifyingCount(takes, spec.id)
        const after = qualifyingCount([...takes, take], spec.id)
        if (before < MASTERY_TAKES && after >= MASTERY_TAKES) setOffer(true)
      }
      if (continuousRef.current) setHold(3)
      void rememberPitches(phrase.notes.map((note) => ({ pitch: note.pitch, hit: hitNote(note, judgements) }))).then(reload)
    },
  })

  const answerRef = useRef<(pitch: number, at: number) => void>(() => {})
  answerRef.current = (pitch: number, at: number) => {
    if (!flashing || lock.current || !card) return
    const expected = card.notes[0]?.pitch
    if (expected == null) return
    lock.current = true
    const hit = pitch >= 0 && (octave === 'exact' ? pitch === expected : pitchMod(pitch) === pitchMod(expected))
    const ms = Math.max(0, at - shownAt.current)
    const nextResults = [...cardResults, { hit, ms }]
    setCardResults(nextResults)
    setFlashNote(hit ? `${noteName(expected)} · ${ms} ms` : `是 ${noteName(expected)}`)
    void rememberPitches([{ pitch: expected, hit, reactionMs: ms }]).then(reload)
    window.setTimeout(() => {
      lock.current = false
      if (nextResults.length >= CARDS) {
        setFlashing(false)
        const accuracy = nextResults.filter((item) => item.hit).length / nextResults.length
        const timed = nextResults.filter((item) => item.hit && item.ms <= timerSeconds * 1000).length / nextResults.length
        void saveTrainRun({
          mode: 'sight-flash',
          level: spec.id,
          createdAt: Date.now(),
          pitchAccuracy: accuracy,
          onTimeRate: timerSeconds === 0 ? 1 : timed,
          meanOffsetMs: average(nextResults.map((item) => item.ms)),
          spreadMs: null,
          bpm,
          scoredTiming: timerSeconds > 0,
        }).then(() => {
          reload()
          onSaved()
        })
      } else {
        setCardIndex((index) => index + 1)
        setFlashNote('')
        shownAt.current = performance.now()
      }
    }, 650)
  }

  useEffect(() => {
    onBind((event) => {
      if (phraseLike) drill.push(event)
      else if (event.type !== 'on') return
      // Flash cards: the first key deals the cards instead of answering one.
      else if (!flashing) startFlash()
      else answerRef.current(event.pitch, event.timeMs)
    })
  })

  const goNext = () => {
    setHold(null)
    setReport(null)
    if (!bank.current) {
      bank.advance()
      return
    }
    const plan = afterExercise({
      items: bank.items,
      seen: new Set(Object.keys(bank.marks)),
      recent: bank.recentIds(),
      currentId: bank.current.id,
      retry: false,
      level: spec.id,
      hand,
      cycleHands: true,
    })
    bank.commitRecent(plan.recent)
    if (plan.hand !== hand) setHand(plan.hand)
    else if (plan.itemId) bank.select(plan.itemId)
  }
  const retryItem = () => {
    retrying.current = true
    setHold(null)
    setReport(null)
    void drill.start()
  }
  goNextRef.current = goNext

  useEffect(() => {
    setSession({ done: 0, clean: 0 })
    setOffer(false)
  }, [spec.id])

  useEffect(() => {
    if (hold == null) return
    if (hold <= 0) {
      if (holdFired.current) return
      holdFired.current = true
      setHold(null)
      goNextRef.current()
      return
    }
    holdFired.current = false
    const id = window.setTimeout(() => setHold((value) => (value == null ? null : value - 1)), 1000)
    return () => window.clearTimeout(id)
  }, [hold])

  useEffect(() => {
    if (!active || !phraseLike) return
    const down = (event: KeyboardEvent) => {
      if (event.repeat || event.metaKey || event.ctrlKey || event.altKey) return
      if (event.target instanceof HTMLElement && ['INPUT', 'SELECT', 'TEXTAREA'].includes(event.target.tagName)) return
      if (drill.status === 'playing' || drill.status === 'countin') return
      if (!report && hold == null) return
      if (event.key === 'Enter') {
        event.preventDefault()
        goNextRef.current()
      }
    }
    window.addEventListener('keydown', down)
    return () => window.removeEventListener('keydown', down)
  }, [active, phraseLike, drill.status, report, hold])

  useEffect(() => {
    if (!flashing || timerSeconds <= 0) return
    const id = window.setTimeout(() => answerRef.current(-1, shownAt.current + timerSeconds * 1000), timerSeconds * 1000)
    return () => window.clearTimeout(id)
  }, [flashing, cardIndex, timerSeconds])

  const startFlash = () => {
    setCardIndex(0)
    setCardResults([])
    setFlashNote('')
    setFlashing(true)
    lock.current = false
    shownAt.current = performance.now()
  }

  const hintList = phraseLike ? drill.current : shown?.notes ?? []
  const busy = drill.status === 'playing' || drill.status === 'countin'

  return (
    <div className="train-pane">
      <LevelRail count={SIGHT_LEVELS.length} prefix="S" value={spec.id} unlocked={unlocked} stars={(id) => levelStars(takes, id)} onChange={setLevel} />
      <div className="train-bar">
        <div className="segmented" role="group" aria-label="视奏题型">
          <button type="button" aria-pressed={kind === 'phrase'} onClick={() => setKind('phrase')}>短句</button>
          <button type="button" aria-pressed={kind === 'flash'} onClick={() => setKind('flash')}>单音卡片</button>
          <button type="button" aria-pressed={kind === 'weak'} onClick={() => setKind('weak')} title="多出你常错的音">弱点</button>
        </div>
        <div className="segmented" role="group" aria-label="哪只手">
          <button type="button" aria-pressed={hand === 'R'} onClick={() => setHand('R')}>右手</button>
          <button type="button" aria-pressed={hand === 'L'} onClick={() => setHand('L')}>左手</button>
          <button type="button" aria-pressed={hand === 'both'} onClick={() => setHand('both')}>{spec.together ? '双手' : '交替'}</button>
        </div>
      </div>
      <div className="train-bar">
        {phraseLike ? (
          <StartStop status={drill.status} onStart={drill.status === 'finished' ? retryItem : () => void drill.start()} onStop={drill.stop} />
        ) : (
          <button type="button" className="button primary" onClick={startFlash} disabled={flashing}>
            {flashing ? `第 ${cardIndex + 1} / ${CARDS} 张` : `开始 ${CARDS} 张`}
          </button>
        )}
        {phraseLike ? (
          <>
            <div className="segmented" role="group" aria-label="判定">
              <button type="button" aria-pressed={timing === 'wait'} onClick={() => setTiming('wait')} title="弹对了才往前走">等我</button>
              <button type="button" aria-pressed={timing === 'strict'} onClick={() => setTiming('strict')} title="跟节拍器">跟拍</button>
            </div>
            <label className="field">速度 {bpm}
              <input type="range" min={48} max={132} value={bpm} onChange={(event) => setBpm(Number(event.target.value))} />
            </label>
          </>
        ) : (
          <div className="segmented" role="group" aria-label="八度">
            <button type="button" aria-pressed={octave === 'any'} onClick={() => setOctave('any')}>任意八度</button>
            <button type="button" aria-pressed={octave === 'exact'} onClick={() => setOctave('exact')}>原位</button>
          </div>
        )}
        <details className="train-more">
          <summary>更多</summary>
          <label className="check"><input type="checkbox" checked={hints} onChange={(event) => setHints(event.target.checked)} />显示音名</label>
          {phraseLike && <label className="check"><input type="checkbox" checked={metronome} onChange={(event) => setMetronome(event.target.checked)} />节拍器</label>}
          {!phraseLike && (
            <label className="field">限时
              <select value={timerSeconds} onChange={(event) => setTimerSeconds(Number(event.target.value))}>
                <option value={0}>不限时</option>
                <option value={3}>3 秒</option>
                <option value={5}>5 秒</option>
                <option value={8}>8 秒</option>
              </select>
            </label>
          )}
          {!phraseLike && <button type="button" className="button ghost" onClick={() => setSeed((value) => value + 17)}>换一组</button>}
        </details>
      </div>
      {phraseLike ? (
        <DrillHint status={drill.status} timing={timing} countBeat={drill.countBeat} />
      ) : (
        <p className="train-hint">{flashNote || (flashing ? '弹出这个音' : '弹任意键发牌')}</p>
      )}
      {hints && hintList.length > 0 && <span className="note-hint">{describeNotes(hintList)}</span>}
      {shown && (
        <div className="score-frame train-score">
          <ScoreView xml={shown.xml} notes={shown.notes} ref={phraseLike ? scoreRef : undefined} onReady={() => {}} onError={() => {}} />
        </div>
      )}
      {phraseLike && report && <ResultLine summary={report} timing={timing === 'strict'} />}
      {!phraseLike && cardResults.length > 0 && (
        <p className="train-result">
          这组 {cardResults.filter((item) => item.hit).length}/{cardResults.length} 正确
          {`，平均 ${Math.round(average(cardResults.map((item) => item.ms)) ?? 0)} ms`}
        </p>
      )}
      {phraseLike && (
        <ContinueBar
          continuous={continuous}
          onContinuous={onContinuous}
          onRetry={retryItem}
          onNext={goNext}
          busy={busy}
          sessionDone={session.done}
          sessionClean={session.clean}
          itemId={bank.current?.id}
          hold={hold}
          nextHandLabel={handName(nextHand(hand), spec.together)}
          offer={offer}
          onAccept={() => {
            setOffer(false)
            setHold(null)
            setReport(null)
            if (bank.current) bank.commitRecent([...bank.recentIds(), bank.current.id].slice(-8))
            setLevel((value) => Math.min(SIGHT_LEVELS.length, value + 1))
          }}
          onStay={() => {
            declined.current.add(spec.id)
            setOffer(false)
          }}
        />
      )}
      {phraseLike && phrase.notes.length > 0 && (
        <DemoBar
          notes={phrase.notes}
          bpm={bpm}
          startBeat={0}
          endBeat={Math.max(...phrase.notes.map((note) => note.beat + note.duration))}
          practiceHands={hand}
          loop={false}
          disabled={busy}
          onBeat={(beat) => scoreRef.current?.setBeat(beat)}
        />
      )}
      {phraseLike && (
        <BankBar
          items={bank.items}
          currentId={bank.current?.id}
          marks={bank.marks}
          open={bank.open}
          onToggle={() => bank.setOpen((value) => !value)}
          onPick={(id) => { setReport(null); bank.pick(id) }}
        />
      )}
      {phraseLike && bank.current && <p className="device-note">第 {bankNumber(bank.current.id)} 题 · {bank.current.source}</p>}
      {spec.id === 3 || spec.id === 6 || spec.id === 10 ? (
        <div className="omr-actions">
          <span className="device-note">过关试奏，只读一遍：</span>
          {spec.id >= 3 && <button type="button" className="button ghost" onClick={() => onCheckpoint('os-twinkle-twinkle-little-star')}>小星星</button>}
          {spec.id >= 6 && <button type="button" className="button ghost" onClick={() => onCheckpoint('os-ode-to-joy')}>欢乐颂</button>}
          {spec.id >= 10 && <button type="button" className="button ghost" onClick={() => onCheckpoint('noc-bach-menuet-bwv-anh-113')}>小步舞曲</button>}
        </div>
      ) : null}
      <HeatKeys stats={stats} />
      <LevelInfo
        title={`S${spec.id} · ${spec.title}`}
        detail={spec.detail}
        source={spec.source}
        rule="同一级先右手、再左手、再双手。连续练习按这个顺序换题，不自动升级。3 条不同的曲子第一次就干净通过，才算过关。"
      />
    </div>
  )
}

function handName(hand: 'R' | 'L' | 'both', together: boolean): string {
  if (hand === 'R') return '右手'
  if (hand === 'L') return '左手'
  return together ? '双手' : '交替'
}

function ResultLine({ summary, timing }: { summary: RunSummary; timing: boolean }) {
  const accuracy = summary.expected === 0 ? 0 : Math.round((summary.hits / summary.expected) * 100)
  const onTime = summary.expected === 0 ? 0 : Math.round((summary.perfects / summary.expected) * 100)
  return (
    <p className="train-result">
      音高 {accuracy}%{timing ? ` · 准时 ${onTime}%` : ''}
      {summary.meanOffsetMs != null ? ` · 平均 ${Math.round(summary.meanOffsetMs)} ms` : ''}
      {summary.timingSpreadMs != null ? ` · 分散 ${Math.round(summary.timingSpreadMs)} ms` : ''}
    </p>
  )
}

function hitNote(note: ScoreNote, judgements: readonly Judgement[]): boolean {
  return judgements.some((item) => item.noteId === note.id && item.result === 'hit')
}

function pitchMod(pitch: number): number {
  return ((pitch % 12) + 12) % 12
}

function average(values: number[]): number | null {
  if (values.length === 0) return null
  return values.reduce((sum, value) => sum + value, 0) / values.length
}
