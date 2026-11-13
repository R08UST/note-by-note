import { useEffect, useMemo, useRef, useState } from 'react'
import type { Judgement, PlayedEvent } from '../judge/types'
import { noteName } from '../score/pitch'
import { listTrainRuns, saveTrainRun, type TrainRunRecord } from '../storage/db'
import { MASTERY_TAKES, PITCH_GATE, TIME_GATE, levelStars, qualifyingCount, unlockedThrough, type TakeScore } from '../train/mastery'
import { EMPTY_STREAK, LADDER_RUN, LADDER_STEP, bestCleanBpm, nextBpm, startBpm, type LadderStreak } from '../train/ladder'
import { techLevels, type TechKind } from '../train/technique'
import { analyzeTouch, touchLine, type TouchReport } from '../train/touch'
import { ContinueBar } from './ContinueBar'
import { DemoBar } from './DemoBar'
import { ListenBar } from './ListenBar'
import { ScoreView, type ScoreHandle } from './ScoreView'
import { LevelRail } from './TrainBits'
import { useDrill } from './useDrill'

interface TechniquePanelProps {
  kind: TechKind
  active: boolean
  keyboardEnabled: boolean
  latencyOffsetMs: number
  onBind: (push: (event: PlayedEvent) => void) => void
  onSaved: () => void
  onRange: (low: number, high: number) => void
  continuous: boolean
  onContinuous: (value: boolean) => void
}

export function TechniquePanel({ kind, active, keyboardEnabled, latencyOffsetMs, onBind, onSaved, onRange, continuous, onContinuous }: TechniquePanelProps) {
  const levels = techLevels(kind)
  const [level, setLevel] = useState(1)
  const [index, setIndex] = useState(0)
  const [bpm, setBpm] = useState(66)
  const [timing, setTiming] = useState<'wait' | 'strict'>('strict')
  const [metronome, setMetronome] = useState(true)
  const [loop, setLoop] = useState(false)
  const [runs, setRuns] = useState<TrainRunRecord[]>([])
  const [report, setReport] = useState<string>('')
  const [hold, setHold] = useState<number | null>(null)
  const [offer, setOffer] = useState(false)
  const [session, setSession] = useState({ done: 0, clean: 0 })
  const [ladder, setLadder] = useState(true)
  const [touch, setTouch] = useState<TouchReport | null>(null)
  const [ladderNote, setLadderNote] = useState('')
  const streak = useRef<LadderStreak>(EMPTY_STREAK)
  const runsRef = useRef<TrainRunRecord[]>([])
  const loadedRef = useRef(false)
  const exerciseIdRef = useRef<string | undefined>(undefined)
  const ladderRef = useRef(ladder)
  ladderRef.current = ladder
  const scoreRef = useRef<ScoreHandle>(null)
  const attempted = useRef<Set<string>>(new Set())
  const retrying = useRef(false)
  const loopRef = useRef(loop)
  loopRef.current = loop
  const continuousRef = useRef(continuous)
  continuousRef.current = continuous
  const declined = useRef<Set<number>>(new Set())
  const goNextRef = useRef<() => void>(() => {})
  const retryRef = useRef<() => void>(() => {})

  const reload = () => {
    void listTrainRuns().then((rows) => {
      const first = !loadedRef.current
      loadedRef.current = true
      runsRef.current = rows
      setRuns(rows)
      // The first item on screen was chosen before the history arrived.
      const id = exerciseIdRef.current
      if (first && ladderRef.current && id) {
        const known = bestCleanBpm(rows.filter((run) => run.mode === kind), id)
        if (known != null) setBpm(startBpm(known, 66))
      }
    })
  }
  useEffect(reload, [])

  const takes: TakeScore[] = runs
    .filter((run) => run.mode === kind)
    .map((run) => ({
      level: run.level,
      pitchAccuracy: run.pitchAccuracy,
      onTimeRate: run.onTimeRate,
      scoredTiming: run.scoredTiming,
      itemId: run.itemId,
      firstAttempt: run.firstAttempt,
    }))
  const unlocked = unlockedThrough(takes, levels.length)
  const spec = levels[Math.min(level, unlocked) - 1] ?? levels[0]
  const item = spec?.items[index] ?? spec?.items[0]
  const exercise = useMemo(() => item, [item])
  const kindRuns = runs.filter((run) => run.mode === kind)
  const best = bestCleanBpm(kindRuns, exercise?.id)

  exerciseIdRef.current = exercise?.id

  // Each item picks up a little under its own fastest clean tempo.
  useEffect(() => {
    streak.current = EMPTY_STREAK
    setLadderNote('')
    setTouch(null)
    if (!ladderRef.current || !exercise) return
    const known = bestCleanBpm(runsRef.current.filter((run) => run.mode === kind), exercise.id)
    if (known != null) setBpm(startBpm(known, 66))
  }, [exercise?.id, kind])

  useEffect(() => {
    if (!exercise) return
    onRange(Math.max(36, exercise.low - 3), Math.min(96, exercise.high + 3))
  }, [exercise, onRange])

  const drill = useDrill({
    active,
    keyboardEnabled,
    notes: exercise?.notes ?? [],
    bpm,
    timing,
    metronome,
    latencyOffsetMs,
    time: exercise?.time ?? { beats: 4, beatType: 4 },
    level: spec?.id ?? 1,
    countInBars: 1,
    scoreRef,
    match: (played) => played,
    onDone: (summary, judgements, touches) => {
      if (!exercise || !spec) return
      const feel = analyzeTouch(exercise.notes, touches)
      setTouch(feel)
      const onTime = summary.expected === 0 ? 0 : summary.perfects / summary.expected
      const accuracy = summary.expected === 0 ? 0 : summary.hits / summary.expected
      const retry = retrying.current
      retrying.current = false
      const firstAttempt = !retry && !attempted.current.has(exercise.id)
      attempted.current.add(exercise.id)
      const clean = accuracy >= PITCH_GATE && (timing === 'wait' || onTime >= TIME_GATE)
      void saveTrainRun({
        mode: kind,
        level: spec.id,
        createdAt: Date.now(),
        pitchAccuracy: accuracy,
        onTimeRate: timing === 'wait' ? 1 : onTime,
        meanOffsetMs: summary.meanOffsetMs,
        spreadMs: summary.timingSpreadMs,
        bpm,
        scoredTiming: timing === 'strict',
        itemId: exercise.id,
        firstAttempt,
        curriculum: 2,
        unevenPct: feel.unevenPct,
        velocitySpread: feel.velocitySpread,
      }).then(() => {
        reload()
        onSaved()
      })
      setSession((value) => ({ done: value.done + 1, clean: value.clean + (clean ? 1 : 0) }))
      setReport(resultLine(summary, judgements, timing === 'strict'))
      if (ladderRef.current && timing === 'strict') {
        const step = nextBpm(bpm, streak.current, clean)
        streak.current = step.streak
        if (step.change > 0) setLadderNote(`连续 ${LADDER_RUN} 遍干净，速度升到 ${step.bpm}。`)
        else if (step.change < 0) setLadderNote(`连续 ${LADDER_RUN} 遍没过，速度降到 ${step.bpm}。`)
        else setLadderNote(clean ? `干净。再干净一遍就加 ${LADDER_STEP}。` : `没过。再没过一遍就减 ${LADDER_STEP}。`)
        if (step.change !== 0) setBpm(step.bpm)
      } else {
        setLadderNote('')
      }
      if (firstAttempt && clean && !declined.current.has(spec.id) && spec.id < levels.length) {
        const take: TakeScore = { level: spec.id, pitchAccuracy: accuracy, onTimeRate: timing === 'wait' ? 1 : onTime, scoredTiming: timing === 'strict', itemId: exercise.id, firstAttempt: true }
        if (qualifyingCount(takes, spec.id) < MASTERY_TAKES && qualifyingCount([...takes, take], spec.id) >= MASTERY_TAKES) setOffer(true)
      }
      if (loopRef.current || continuousRef.current) setHold(3)
    },
  })

  useEffect(() => {
    onBind(drill.push)
  }, [drill.push, onBind])

  const startRef = useRef(drill.start)
  startRef.current = drill.start
  const pendingStart = useRef(false)
  const goNext = (auto = false) => {
    setReport('')
    setHold(null)
    setOffer(false)
    if (loopRef.current) {
      if (auto) void startRef.current()
      return
    }
    pendingStart.current = auto
    setIndex((value) => ((value + 1) % (spec?.items.length ?? 1)))
  }
  const retryItem = () => {
    retrying.current = true
    setReport('')
    setHold(null)
    void drill.start()
  }
  goNextRef.current = () => goNext(false)
  retryRef.current = retryItem

  useEffect(() => {
    if (!pendingStart.current) return
    pendingStart.current = false
    void startRef.current()
  }, [exercise?.id])

  useEffect(() => {
    if (hold == null) return
    if (hold <= 0) {
      setHold(null)
      goNext(true)
      return
    }
    const id = window.setTimeout(() => setHold((value) => (value == null ? null : value - 1)), 1000)
    return () => window.clearTimeout(id)
  }, [hold])

  useEffect(() => {
    if (!active) return
    const down = (event: KeyboardEvent) => {
      if (event.repeat || event.metaKey || event.ctrlKey || event.altKey) return
      if (event.target instanceof HTMLElement && ['INPUT', 'SELECT', 'TEXTAREA'].includes(event.target.tagName)) return
      if (drill.status === 'playing' || drill.status === 'countin') return
      if (!report && hold == null) return
      if (event.key === 'Enter') {
        event.preventDefault()
        goNextRef.current()
      } else if (event.code === 'KeyR') {
        event.preventDefault()
        retryRef.current()
      }
    }
    window.addEventListener('keydown', down)
    return () => window.removeEventListener('keydown', down)
  }, [active, drill.status, report, hold])

  if (!spec || !exercise) return null
  const noun = kind === 'scale' ? '音阶' : '和弦'

  return (
    <div className="train-pane">
      <LevelRail count={levels.length} prefix={kind === 'scale' ? '音' : '和'} value={spec.id} unlocked={unlocked} stars={(id) => levelStars(takes, id)} onChange={(next) => { setLevel(next); setIndex(0); setReport(''); setHold(null) }} />
      <p className="device-note">{noun} {spec.id} {spec.title}。{spec.detail}</p>
      <p className="device-note">依据：{spec.source}</p>
      <p className="device-note">3 条不同的练习第一次就干净通过，才算过关。连续练习留在这一级。{kind === 'scale' ? '节奏模式按拍子看每个音准不准、匀不匀。' : '和弦要一起下键。缺的音和多出来的音会单独写出来。'}</p>
      <div className="train-settings">
        <label className="field">速度 {bpm}
          <input type="range" min={48} max={144} value={bpm} onChange={(event) => setBpm(Number(event.target.value))} />
        </label>
        <label className="check"><input type="checkbox" checked={metronome} onChange={(event) => setMetronome(event.target.checked)} />节拍器</label>
        <label className="check"><input type="checkbox" checked={loop} onChange={(event) => setLoop(event.target.checked)} />循环</label>
        <label className="check" title={`节奏模式下连续 ${LADDER_RUN} 遍干净加 ${LADDER_STEP}，连续 ${LADDER_RUN} 遍没过减 ${LADDER_STEP}`}><input type="checkbox" checked={ladder} onChange={(event) => setLadder(event.target.checked)} />自动加速</label>
        <span className="device-note">{best == null ? '这一条还没有干净的节奏记录' : `这一条最快干净 ${best}`}</span>
        <div className="segmented" role="group" aria-label="判定">
          <button type="button" aria-pressed={timing === 'wait'} onClick={() => setTiming('wait')}>等待</button>
          <button type="button" aria-pressed={timing === 'strict'} onClick={() => setTiming('strict')}>节奏</button>
        </div>
      </div>
      <div className="omr-actions">
        <button type="button" className="button primary" onClick={() => void drill.start()} disabled={drill.status === 'playing' || drill.status === 'countin'}>
          {drill.status === 'countin' ? '预备…' : '开始'}
        </button>
        <button type="button" className="button stop" onClick={drill.stop}>停止</button>
        <button type="button" className="button ghost" onClick={() => { drill.stop(); scoreRef.current?.setBeat(exercise.notes[0]?.beat ?? 0) }}>回到开头</button>
      </div>
      {drill.countBeat != null && <div className="count-in">{drill.countBeat}</div>}
      <div className="recent" aria-label="这一级的条目">
        {spec.items.map((entry, entryIndex) => (
          <button key={entry.id} type="button" aria-pressed={entry.id === exercise.id} onClick={() => { setIndex(entryIndex); setReport(''); setHold(null) }}>
            {entry.title}
          </button>
        ))}
      </div>
      <ContinueBar
        continuous={continuous}
        onContinuous={onContinuous}
        onRetry={retryItem}
        onNext={goNext}
        busy={drill.status === 'playing' || drill.status === 'countin'}
        sessionDone={session.done}
        sessionClean={session.clean}
        itemId={exercise.id}
        hold={hold}
        offer={offer}
        onAccept={() => {
          setOffer(false)
          setHold(null)
          setReport('')
          setLevel((value) => Math.min(levels.length, value + 1))
          setIndex(0)
        }}
        onStay={() => {
          declined.current.add(spec.id)
          setOffer(false)
        }}
      />
      {exercise.notes.length > 0 && (
        <DemoBar
          notes={exercise.notes}
          bpm={bpm}
          startBeat={exercise.notes[0]?.beat ?? 0}
          endBeat={Math.max(...exercise.notes.map((note) => note.beat + note.duration))}
          practiceHands="both"
          loop={loop}
          disabled={drill.status === 'playing' || drill.status === 'countin'}
          onBeat={(beat) => scoreRef.current?.setBeat(beat)}
        />
      )}
      {exercise.notes.length > 0 && (
        <ListenBar
          showKeyboard={false}
          notes={exercise.notes}
          startBeat={exercise.notes[0]?.beat ?? 0}
          rangeStart={exercise.notes[0]?.beat ?? 0}
          rangeEnd={Math.max(...exercise.notes.map((note) => note.beat + note.duration))}
          bpm={bpm}
          onBpm={setBpm}
          disabled={drill.status === 'playing' || drill.status === 'countin'}
          onBeat={(beat) => scoreRef.current?.setBeat(beat)}
          onPractice={() => void drill.start()}
          onNext={() => setIndex((value) => (value + 1) % spec.items.length)}
        />
      )}
      <div className="score-frame train-score">
        <ScoreView xml={exercise.xml} notes={exercise.notes} ref={scoreRef} onReady={() => {}} onError={() => {}} />
      </div>
      {report && <p className="device-note">{report}</p>}
      {report && touch && touchLine(touch) && <p className="device-note">{touchLine(touch)}</p>}
      {report && touch && touch.tips.length > 0 && (
        <ul className="device-note touch-tips">
          {touch.tips.map((tip) => <li key={tip}>{tip}</li>)}
        </ul>
      )}
      {report && ladderNote && <p className="device-note">{ladderNote}</p>}
    </div>
  )
}

function resultLine(summary: { hits: number; expected: number; perfects: number; misses: number; extras: number; wrongs: number; timingSpreadMs: number | null }, judgements: readonly Judgement[], timing: boolean): string {
  const accuracy = summary.expected === 0 ? 0 : Math.round((summary.hits / summary.expected) * 100)
  const onTime = summary.expected === 0 ? 0 : Math.round((summary.perfects / summary.expected) * 100)
  const missing = judgements.filter((item) => item.result === 'miss').map((item) => noteName(item.pitch))
  const extra = judgements.filter((item) => item.result === 'extra' || item.result === 'wrong').map((item) => noteName(item.pitch))
  const parts = [`音高 ${accuracy}%`]
  if (timing) parts.push(`准时 ${onTime}%`)
  if (summary.timingSpreadMs != null) parts.push(`与节拍的偏差分散 ${Math.round(summary.timingSpreadMs)} ms`)
  if (missing.length > 0) parts.push(`缺音 ${missing.join('、')}`)
  if (extra.length > 0) parts.push(`多音或错音 ${extra.join('、')}`)
  if (summary.misses === 0 && summary.extras === 0 && summary.wrongs === 0 && missing.length === 0) parts.push('没有缺音，也没有多出来的音')
  return parts.join(' · ')
}
