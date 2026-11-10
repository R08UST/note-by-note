import { useEffect, useMemo, useRef, useState } from 'react'
import type { Judgement, PlayedEvent, ScoreNote } from '../judge/types'
import type { RunSummary } from '../report/summary'
import { noteName } from '../score/pitch'
import type { TimeSignature } from '../score/parseMusicXml'
import { latestRun, listTrainRuns, saveTrainRun, type TrainRunRecord } from '../storage/db'
import { levelStars, unlockedThrough, type TakeScore } from '../train/mastery'
import {
  generateHandsRhythm,
  generatePulse,
  generatePulseAndRhythm,
  generateRhythm,
  matchRhythmPitch,
  onTimeRate,
  pitchAccuracy,
  rhythmFromPiece,
  RHYTHM_LEVELS,
  rhythmLevel,
  worstMeasures,
  type RhythmMatch,
} from '../train/rhythm'
import { LevelRail } from './TrainBits'
import { ScoreView, type ScoreHandle } from './ScoreView'
import { useDrill } from './useDrill'

interface RhythmPanelProps {
  active: boolean
  keyboardEnabled: boolean
  latencyOffsetMs: number
  piece: { id: string; title: string; notes: ScoreNote[]; time: TimeSignature } | null
  onBind: (push: (event: PlayedEvent) => void) => void
  onSaved: () => void
}

type RhythmKind = 'line' | 'hands' | 'pulse' | 'beat' | 'piece'

export function RhythmPanel({ active, keyboardEnabled, latencyOffsetMs, piece, onBind, onSaved }: RhythmPanelProps) {
  const [level, setLevel] = useState(1)
  const [kind, setKind] = useState<RhythmKind>('line')
  const [bpm, setBpm] = useState(72)
  const [autoTempo, setAutoTempo] = useState(true)
  const [metronome, setMetronome] = useState(true)
  const [rule, setRule] = useState<RhythmMatch>('any')
  const [chosen, setChosen] = useState(60)
  const [subdivision, setSubdivision] = useState<'quarter' | 'eighth'>('quarter')
  const [seed, setSeed] = useState(4)
  const [fromMeasure, setFromMeasure] = useState(1)
  const [toMeasure, setToMeasure] = useState(4)
  const [useWorst, setUseWorst] = useState(false)
  const [worst, setWorst] = useState<number[]>([])
  const [runs, setRuns] = useState<TrainRunRecord[]>([])
  const [report, setReport] = useState<RunSummary | null>(null)
  const [offsets, setOffsets] = useState<Judgement[]>([])
  const scoreRef = useRef<ScoreHandle>(null)

  const reload = () => {
    void listTrainRuns().then(setRuns)
  }
  useEffect(reload, [])
  useEffect(() => {
    if (!piece) return
    void latestRun(piece.id).then((run) => setWorst(worstMeasures(run?.errorsPerMeasure ?? [])))
  }, [piece])

  const takes: TakeScore[] = runs
    .filter((run) => run.mode === 'rhythm' || run.mode === 'rhythm-hands')
    .map((run) => ({ level: run.level, pitchAccuracy: run.pitchAccuracy, onTimeRate: run.onTimeRate, scoredTiming: true }))
  const unlocked = unlockedThrough(takes, RHYTHM_LEVELS.length)
  const spec = rhythmLevel(Math.min(level, unlocked))

  const exercise = useMemo(() => {
    if (kind === 'hands') return generateHandsRhythm(seed)
    if (kind === 'beat') return generatePulseAndRhythm(spec.id, seed)
    if (kind === 'pulse') return generatePulse(subdivision)
    if (kind === 'piece') {
      const measures = useWorst && worst.length > 0 ? worst : rangeMeasures(fromMeasure, toMeasure)
      return rhythmFromPiece({ notes: piece?.notes ?? [], measures, time: piece?.time ?? { beats: 4, beatType: 4 } })
    }
    return generateRhythm(spec.id, seed)
  }, [kind, seed, spec.id, subdivision, useWorst, worst, fromMeasure, toMeasure, piece])

  const matchRule: RhythmMatch = kind === 'hands' ? 'hands' : rule
  const drill = useDrill({
    active,
    keyboardEnabled,
    notes: exercise.notes,
    bpm,
    timing: 'strict',
    metronome,
    latencyOffsetMs,
    time: exercise.time,
    level: spec.id,
    countInBars: 2,
    scoreRef,
    match: (played, upcoming) => matchRhythmPitch(played, upcoming, matchRule, chosen),
    onDone: (summary, judgements) => {
      setReport(summary)
      setOffsets([...judgements])
      const accuracy = pitchAccuracy(summary)
      const timing = onTimeRate(summary)
      const mode = kind === 'hands' ? 'rhythm-hands' : kind === 'pulse' ? 'pulse' : kind === 'piece' ? 'rhythm-piece' : 'rhythm'
      void saveTrainRun({
        mode,
        level: kind === 'line' ? spec.id : 0,
        createdAt: Date.now(),
        pitchAccuracy: accuracy,
        onTimeRate: timing,
        meanOffsetMs: summary.meanOffsetMs,
        spreadMs: summary.timingSpreadMs,
        bpm,
        scoredTiming: true,
      }).then(() => {
        reload()
        onSaved()
      })
      if (autoTempo && accuracy >= 0.9 && timing >= 0.8) setBpm((value) => Math.min(Math.round(spec.startBpm * 1.5), value + 5))
    },
  })

  useEffect(() => {
    onBind((event) => drill.push(event))
  })

  return (
    <div className="train-pane">
      <LevelRail count={RHYTHM_LEVELS.length} prefix="R" value={spec.id} unlocked={unlocked} stars={(id) => levelStars(takes, id)} onChange={setLevel} />
      <p className="device-note">R{spec.id} {spec.title}。{spec.detail}</p>
      <p className="device-note">依据：{spec.source}</p>
      <p className="device-note">先跟稳拍子，再打节奏。干净通过后速度加 5。预备是两小节。</p>
      <div className="segmented" role="group" aria-label="节奏题型">
        <button type="button" aria-pressed={kind === 'line'} onClick={() => setKind('line')}>单行</button>
        <button type="button" aria-pressed={kind === 'hands'} onClick={() => setKind('hands')}>双手</button>
        <button type="button" aria-pressed={kind === 'beat'} onClick={() => setKind('beat')}>拍加节奏</button>
        <button type="button" aria-pressed={kind === 'pulse'} onClick={() => setKind('pulse')}>跟拍</button>
        <button type="button" aria-pressed={kind === 'piece'} onClick={() => setKind('piece')}>从曲目</button>
      </div>
      <div className="train-settings">
        <label className="field">速度 {bpm}
          <input type="range" min={48} max={144} value={bpm} onChange={(event) => setBpm(Number(event.target.value))} />
        </label>
        <label className="check"><input type="checkbox" checked={autoTempo} onChange={(event) => setAutoTempo(event.target.checked)} />通过后加速</label>
        <label className="check"><input type="checkbox" checked={metronome} onChange={(event) => setMetronome(event.target.checked)} />节拍器</label>
        {kind !== 'hands' && (
          <div className="segmented" role="group" aria-label="哪一个键算对">
            <button type="button" aria-pressed={rule === 'any'} onClick={() => setRule('any')}>任意键</button>
            <button type="button" aria-pressed={rule === 'chosen'} onClick={() => setRule('chosen')}>指定音</button>
          </div>
        )}
        {kind !== 'hands' && rule === 'chosen' && (
          <label className="field">音
            <select value={chosen} onChange={(event) => setChosen(Number(event.target.value))}>
              {[48, 50, 52, 53, 55, 57, 59, 60, 62, 64, 65, 67, 69, 71, 72].map((pitch) => (
                <option key={pitch} value={pitch}>{noteName(pitch)}</option>
              ))}
            </select>
          </label>
        )}
        {kind === 'pulse' && (
          <div className="segmented" role="group" aria-label="跟拍密度">
            <button type="button" aria-pressed={subdivision === 'quarter'} onClick={() => setSubdivision('quarter')}>四分</button>
            <button type="button" aria-pressed={subdivision === 'eighth'} onClick={() => setSubdivision('eighth')}>八分</button>
          </div>
        )}
        {kind === 'piece' && (
          <>
            <label className="field">从
              <input type="number" min={1} value={fromMeasure} onChange={(event) => setFromMeasure(Number(event.target.value) || 1)} />
            </label>
            <label className="field">到
              <input type="number" min={1} value={toMeasure} onChange={(event) => setToMeasure(Number(event.target.value) || 1)} />
            </label>
            <label className="check">
              <input type="checkbox" checked={useWorst} onChange={(event) => setUseWorst(event.target.checked)} />
              上次最弱的小节{worst.length > 0 ? `（${worst.join('、')}）` : ''}
            </label>
          </>
        )}
      </div>
      {kind === 'piece' && !piece && <p className="score-status">先在练习里打开一首曲子，再抽它的节奏。</p>}
      {kind === 'hands' && <p className="device-note">中央 C 以上算右手，以下算左手。</p>}
      <div className="omr-actions">
        <button type="button" className="button primary" disabled={exercise.notes.length === 0 || drill.status === 'playing' || drill.status === 'countin'} onClick={() => void drill.start()}>
          {drill.status === 'countin' ? '预备…' : '开始'}
        </button>
        <button type="button" className="button stop" onClick={drill.stop}>停止</button>
        <button type="button" className="button ghost" onClick={() => { setReport(null); setSeed((value) => value + 9) }}>换一题</button>
      </div>
      {drill.countBeat != null && <div className="count-in">{drill.countBeat}</div>}
      <div className="score-frame train-score">
        <ScoreView xml={exercise.xml} notes={exercise.notes} ref={scoreRef} onReady={() => {}} onError={() => {}} />
      </div>
      {report && (
        <div className="rhythm-report">
          <p className="device-note">
            打中 {Math.round(pitchAccuracy(report) * 100)}% · 准时 {Math.round(onTimeRate(report) * 100)}%
            {report.meanOffsetMs != null ? ` · 平均 ${Math.round(report.meanOffsetMs)} ms` : ''}
            {report.timingSpreadMs != null ? ` · 分散 ${Math.round(report.timingSpreadMs)} ms` : ''}
          </p>
          <ul className="timing-bars">
            {exercise.notes.map((note) => {
              const judgement = offsets.find((item) => item.noteId === note.id)
              const offset = judgement?.offsetMs
              return (
                <li key={note.id}>
                  <span>第 {note.measure} 小节</span>
                  <span className={barClass(judgement)}>{offset == null ? '错过' : `${Math.round(offset)} ms`}</span>
                  <i style={{ left: offset == null ? '50%' : `${clamp(((offset + 200) / 450) * 100, 0, 100)}%` }} />
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </div>
  )
}

function rangeMeasures(from: number, to: number): number[] {
  const low = Math.max(1, Math.min(from, to))
  const high = Math.max(from, to)
  const measures: number[] = []
  for (let measure = low; measure <= high && measures.length < 8; measure += 1) measures.push(measure)
  return measures
}

function barClass(judgement: Judgement | undefined): string {
  if (!judgement || judgement.result !== 'hit' || judgement.offsetMs == null) return 'tone-bad'
  return Math.abs(judgement.offsetMs) <= 80 ? 'tone-good' : 'tone-warn'
}

function clamp(value: number, low: number, high: number): number {
  return Math.min(high, Math.max(low, value))
}
