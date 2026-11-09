import { useEffect, useMemo, useRef, useState } from 'react'
import type { Judgement, PlayedEvent, ScoreNote } from '../judge/types'
import { pitchForCode } from '../midi/keyboardMap'
import type { RunSummary } from '../report/summary'
import { noteName } from '../score/pitch'
import { listPitchStats, listTrainRuns, rememberPitches, saveTrainRun, type PitchStatRecord, type TrainRunRecord } from '../storage/db'
import { levelStars, unlockedThrough, weaknessMap, type TakeScore } from '../train/mastery'
import { generateFlash, generateSightPhrase, SIGHT_LEVELS, sightLevel, type ClefChoice, type RangeChoice } from '../train/sight'
import { HeatKeys, LevelRail } from './TrainBits'
import { ScoreView, type ScoreHandle } from './ScoreView'
import { useDrill } from './useDrill'

interface SightPanelProps {
  active: boolean
  keyboardEnabled: boolean
  latencyOffsetMs: number
  onBind: (push: (event: PlayedEvent) => void) => void
  onSaved: () => void
}

const CARDS = 8

export function SightPanel({ active, keyboardEnabled, latencyOffsetMs, onBind, onSaved }: SightPanelProps) {
  const [level, setLevel] = useState(1)
  const [kind, setKind] = useState<'flash' | 'phrase' | 'weak'>('phrase')
  const [clef, setClef] = useState<ClefChoice>('auto')
  const [range, setRange] = useState<RangeChoice>('level')
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
  const scoreRef = useRef<ScoreHandle>(null)
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
    .map((run) => ({ level: run.level, pitchAccuracy: run.pitchAccuracy, onTimeRate: run.onTimeRate, scoredTiming: run.scoredTiming }))
  const unlocked = unlockedThrough(takes, SIGHT_LEVELS.length)
  const spec = sightLevel(Math.min(level, unlocked))
  const phraseLike = kind !== 'flash'

  const phrase = useMemo(
    () => generateSightPhrase({ level: spec.id, seed, clef, range, weakness: weaknessRef.current, focusWeak: kind === 'weak' }),
    [spec.id, seed, clef, range, kind],
  )
  const cards = useMemo(() => {
    if (phraseLike) return []
    return Array.from({ length: CARDS }, (_, index) =>
      generateFlash({ level: spec.id, seed: seed + index + 1, clef, range, weakness: weaknessRef.current, focusWeak: false }),
    )
  }, [phraseLike, spec.id, seed, clef, range])
  const card = cards[cardIndex] ?? null
  const shown = phraseLike ? phrase : card

  const drill = useDrill({
    active: active && phraseLike,
    keyboardEnabled,
    notes: phrase.notes,
    bpm,
    timing,
    metronome,
    latencyOffsetMs,
    time: phrase.time,
    scoreRef,
    match: (played) => played,
    onDone: (summary, judgements) => {
      setReport(summary)
      const onTime = summary.expected === 0 ? 0 : summary.perfects / summary.expected
      void saveTrainRun({
        mode: 'sight-phrase',
        level: spec.id,
        createdAt: Date.now(),
        pitchAccuracy: summary.expected === 0 ? 0 : summary.hits / summary.expected,
        onTimeRate: timing === 'wait' ? 1 : onTime,
        meanOffsetMs: summary.meanOffsetMs,
        spreadMs: summary.timingSpreadMs,
        bpm,
        scoredTiming: timing === 'strict',
      }).then(() => {
        reload()
        onSaved()
      })
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
      if (event.type !== 'on') return
      if (phraseLike) drill.push(event)
      else answerRef.current(event.pitch, event.timeMs)
    })
  })

  useEffect(() => {
    if (!active || !keyboardEnabled || phraseLike) return
    const down = (event: KeyboardEvent) => {
      if (event.repeat || event.metaKey || event.ctrlKey || event.altKey) return
      if (event.target instanceof HTMLElement && ['INPUT', 'SELECT', 'TEXTAREA'].includes(event.target.tagName)) return
      const pitch = pitchForCode(event.code)
      if (pitch == null) return
      event.preventDefault()
      answerRef.current(pitch, performance.now())
    }
    window.addEventListener('keydown', down)
    return () => window.removeEventListener('keydown', down)
  }, [active, keyboardEnabled, phraseLike])

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

  const hintPitch = phraseLike ? drill.current[0]?.pitch : shown?.notes[0]?.pitch
  const timeGate = timing === 'strict' || timerSeconds > 0

  return (
    <div className="train-pane">
      <LevelRail count={SIGHT_LEVELS.length} value={spec.id} unlocked={unlocked} stars={(id) => levelStars(takes, id)} onChange={setLevel} />
      <p className="device-note">
        L{spec.id} {spec.title}。{spec.detail}。累计 3 次音高 ≥90%{timeGate ? '、准时 ≥80%' : ''} 解锁下一级。
      </p>
      <div className="segmented" role="group" aria-label="视奏题型">
        <button type="button" aria-pressed={kind === 'flash'} onClick={() => setKind('flash')}>单音认谱</button>
        <button type="button" aria-pressed={kind === 'phrase'} onClick={() => setKind('phrase')}>短句视奏</button>
        <button type="button" aria-pressed={kind === 'weak'} onClick={() => setKind('weak')}>弱点</button>
      </div>
      <div className="train-settings">
        <label className="field">谱表
          <select value={clef} onChange={(event) => setClef(event.target.value as ClefChoice)}>
            <option value="auto">按级别</option>
            <option value="treble">高音</option>
            <option value="bass">低音</option>
            <option value="grand">大谱表</option>
          </select>
        </label>
        <label className="field">音域
          <select value={range} onChange={(event) => setRange(event.target.value as RangeChoice)}>
            <option value="narrow">窄</option>
            <option value="level">本级</option>
            <option value="wide">宽</option>
          </select>
        </label>
        <label className="field">速度 {bpm}
          <input type="range" min={48} max={132} value={bpm} onChange={(event) => setBpm(Number(event.target.value))} />
        </label>
        <label className="check"><input type="checkbox" checked={metronome} onChange={(event) => setMetronome(event.target.checked)} />节拍器</label>
        <label className="check"><input type="checkbox" checked={hints} onChange={(event) => setHints(event.target.checked)} />显示音名</label>
        {phraseLike ? (
          <div className="segmented" role="group" aria-label="判定">
            <button type="button" aria-pressed={timing === 'wait'} onClick={() => setTiming('wait')}>只看音高</button>
            <button type="button" aria-pressed={timing === 'strict'} onClick={() => setTiming('strict')}>按拍子</button>
          </div>
        ) : (
          <>
            <div className="segmented" role="group" aria-label="八度">
              <button type="button" aria-pressed={octave === 'any'} onClick={() => setOctave('any')}>任意八度</button>
              <button type="button" aria-pressed={octave === 'exact'} onClick={() => setOctave('exact')}>原位</button>
            </div>
            <label className="field">限时
              <select value={timerSeconds} onChange={(event) => setTimerSeconds(Number(event.target.value))}>
                <option value={0}>不限时</option>
                <option value={3}>3 秒</option>
                <option value={5}>5 秒</option>
                <option value={8}>8 秒</option>
              </select>
            </label>
          </>
        )}
      </div>
      <div className="omr-actions">
        {phraseLike ? (
          <>
            <button type="button" className="button primary" onClick={() => void drill.start()} disabled={drill.status === 'playing' || drill.status === 'countin'}>
              {drill.status === 'countin' ? '预备…' : '开始'}
            </button>
            <button type="button" className="button stop" onClick={drill.stop}>停止</button>
          </>
        ) : (
          <button type="button" className="button primary" onClick={startFlash} disabled={flashing}>
            {flashing ? `第 ${cardIndex + 1} / ${CARDS} 张` : '开始 8 张'}
          </button>
        )}
        <button type="button" className="button ghost" onClick={() => { setReport(null); setSeed((value) => value + 17) }}>换一题</button>
        {hints && hintPitch != null && <span className="note-hint">{noteName(hintPitch)}</span>}
        {flashNote && <span className="device-note">{flashNote}</span>}
      </div>
      {drill.countBeat != null && phraseLike && <div className="count-in">{drill.countBeat}</div>}
      {shown && (
        <div className="score-frame train-score">
          <ScoreView xml={shown.xml} notes={shown.notes} ref={phraseLike ? scoreRef : undefined} onReady={() => {}} onError={() => {}} />
        </div>
      )}
      {phraseLike && report && <ResultLine summary={report} timing={timing === 'strict'} />}
      {!phraseLike && cardResults.length > 0 && (
        <p className="device-note">
          这组 {cardResults.filter((item) => item.hit).length}/{cardResults.length} 正确
          {`，平均 ${Math.round(average(cardResults.map((item) => item.ms)) ?? 0)} ms`}
        </p>
      )}
      <HeatKeys stats={stats} />
    </div>
  )
}

function ResultLine({ summary, timing }: { summary: RunSummary; timing: boolean }) {
  const accuracy = summary.expected === 0 ? 0 : Math.round((summary.hits / summary.expected) * 100)
  const onTime = summary.expected === 0 ? 0 : Math.round((summary.perfects / summary.expected) * 100)
  return (
    <p className="device-note">
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
