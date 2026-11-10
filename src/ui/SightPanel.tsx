import { useEffect, useMemo, useRef, useState } from 'react'
import type { Judgement, PlayedEvent, ScoreNote } from '../judge/types'
import { pitchForCode } from '../midi/keyboardMap'
import type { RunSummary } from '../report/summary'
import { noteName } from '../score/pitch'
import { listPitchStats, listTrainRuns, rememberPitches, saveTrainRun, type PitchStatRecord, type TrainRunRecord } from '../storage/db'
import { PITCH_GATE, TIME_GATE, levelStars, migratedSightLevel, unlockedThrough, weaknessMap, type TakeScore } from '../train/mastery'
import { bankFileName, exerciseFromBank } from '../train/bank'
import { generateFlash, generateSightPhrase, SIGHT_LEVELS, sightLevel } from '../train/sight'
import { BankBar } from './BankBar'
import { bankNumber, useQuestionBank } from './useQuestionBank'
import { HeatKeys, LevelRail, PreviewGate } from './TrainBits'
import { ScoreView, type ScoreHandle } from './ScoreView'
import { useDrill } from './useDrill'

interface SightPanelProps {
  active: boolean
  keyboardEnabled: boolean
  latencyOffsetMs: number
  onBind: (push: (event: PlayedEvent) => void) => void
  onSaved: () => void
  onCheckpoint: (pieceId: string) => void
}

const CARDS = 8

export function SightPanel({ active, keyboardEnabled, latencyOffsetMs, onBind, onSaved, onCheckpoint }: SightPanelProps) {
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
  const [preview, setPreview] = useState<number | null>(null)
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
    keyboardEnabled,
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
        hand,
        seed: phrase.seed,
        itemId: phrase.itemId || undefined,
        firstAttempt: phrase.itemId ? !bank.marks[phrase.itemId] : true,
        curriculum: 2,
      }).then(() => {
        reload()
        onSaved()
      })
      if (phrase.itemId) {
        const clean = (summary.expected === 0 ? 0 : summary.hits / summary.expected) >= PITCH_GATE && (timing === 'wait' || onTime >= TIME_GATE)
        bank.finish(clean)
      }
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
    if (preview == null || preview <= 0) return
    const id = window.setTimeout(() => setPreview((value) => (value == null ? null : value - 1)), 1000)
    return () => window.clearTimeout(id)
  }, [preview])

  const startDrill = useRef(drill.start)
  startDrill.current = drill.start
  useEffect(() => {
    if (preview !== 0) return
    setPreview(null)
    void startDrill.current()
  }, [preview])

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

  return (
    <div className="train-pane">
      <LevelRail count={SIGHT_LEVELS.length} prefix="S" value={spec.id} unlocked={unlocked} stars={(id) => levelStars(takes, id)} onChange={setLevel} />
      <p className="device-note">
        S{spec.id} {spec.title}。{spec.detail}
      </p>
      <p className="device-note">依据：{spec.source}</p>
      <p className="device-note">同一级先右手、再左手、再双手。3 条不同的曲子第一次就干净通过，才算过关。先看 30 秒。</p>
      <div className="segmented" role="group" aria-label="视奏题型">
        <button type="button" aria-pressed={kind === 'flash'} onClick={() => setKind('flash')}>单音认谱</button>
        <button type="button" aria-pressed={kind === 'phrase'} onClick={() => setKind('phrase')}>短句视奏</button>
        <button type="button" aria-pressed={kind === 'weak'} onClick={() => setKind('weak')}>弱点</button>
      </div>
      {spec.id === 3 || spec.id === 6 || spec.id === 10 ? (
        <div className="omr-actions">
          <span className="device-note">过关试奏，只读一遍：</span>
          {spec.id >= 3 && <button type="button" className="button ghost" onClick={() => onCheckpoint('os-twinkle-twinkle-little-star')}>小星星</button>}
          {spec.id >= 6 && <button type="button" className="button ghost" onClick={() => onCheckpoint('os-ode-to-joy')}>欢乐颂</button>}
          {spec.id >= 10 && <button type="button" className="button ghost" onClick={() => onCheckpoint('noc-bach-menuet-bwv-anh-113')}>小步舞曲</button>}
        </div>
      ) : null}
      <div className="train-settings">
        <div className="segmented" role="group" aria-label="哪只手">
          <button type="button" aria-pressed={hand === 'R'} onClick={() => setHand('R')}>右手</button>
          <button type="button" aria-pressed={hand === 'L'} onClick={() => setHand('L')}>左手</button>
          <button type="button" aria-pressed={hand === 'both'} onClick={() => setHand('both')}>{spec.together ? '双手' : '交替'}</button>
        </div>
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
            {preview != null && preview > 0 && <PreviewGate seconds={preview} onSkip={() => { setPreview(null); void drill.start() }} />}
            <button type="button" className="button primary" onClick={() => setPreview(30)} disabled={drill.status === 'playing' || drill.status === 'countin' || (preview != null && preview > 0)}>
              {drill.status === 'countin' ? '预备…' : preview != null && preview > 0 ? `预习 ${preview}` : '开始'}
            </button>
            <button type="button" className="button stop" onClick={drill.stop}>停止</button>
          </>
        ) : (
          <button type="button" className="button primary" onClick={startFlash} disabled={flashing}>
            {flashing ? `第 ${cardIndex + 1} / ${CARDS} 张` : '开始 8 张'}
          </button>
        )}
        <button type="button" className="button ghost" onClick={() => { setReport(null); if (phraseLike && bank.items.length > 0) bank.advance(); else setSeed((value) => value + 17) }}>换一题</button>
        {hints && hintPitch != null && <span className="note-hint">{noteName(hintPitch)}</span>}
        {flashNote && <span className="device-note">{flashNote}</span>}
      </div>
      {drill.countBeat != null && phraseLike && <div className="count-in">{drill.countBeat}</div>}
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
