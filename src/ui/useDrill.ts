import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'
import type { Judgement, PlayedEvent, ScoreNote } from '../judge/types'
import { RhythmMode } from '../modes/rhythmMode'
import { WaitMode } from '../modes/waitMode'
import { summarize, type RunSummary } from '../report/summary'
import type { TimeSignature } from '../score/parseMusicXml'
import { quarterBeatsPerMeasure } from '../score/parseMusicXml'
import { MISS_CUSHION_MS, mapPerformanceToTransportMs, toScoreTimeMs } from '../transport/clock'
import { startMetronome, stopMetronome, transportSeconds } from '../transport/metronome'
import { timingForExercise } from '../train/timing'
import type { Touch } from '../train/touch'
import type { ScoreHandle } from './ScoreView'

type Engine = WaitMode | RhythmMode
export type DrillTiming = 'wait' | 'strict'

interface DrillOptions {
  /** The panel is on screen. Only then does the first key start a take. */
  active: boolean
  notes: ScoreNote[]
  bpm: number
  timing: DrillTiming
  metronome: boolean
  latencyOffsetMs: number
  time: TimeSignature
  level?: number
  countInBars?: number
  scoreRef: RefObject<ScoreHandle | null>
  /** Rewrite a played pitch before the judge sees it. Rhythm drills use this so any key can count. */
  match: (played: number, upcoming: ScoreNote[]) => number
  /** `touches` holds one press per hit note: when, how hard, and when it came up. */
  onDone: (summary: RunSummary, judgements: Judgement[], touches: Touch[]) => void
}

export function useDrill({
  active,
  notes,
  bpm,
  timing,
  metronome,
  latencyOffsetMs,
  time,
  level = 1,
  countInBars = 1,
  scoreRef,
  match,
  onDone,
}: DrillOptions) {
  const [status, setStatus] = useState<'idle' | 'countin' | 'playing' | 'finished'>('idle')
  const [judgements, setJudgements] = useState<Judgement[]>([])
  const [summary, setSummary] = useState<RunSummary | null>(null)
  const [countBeat, setCountBeat] = useState<number | null>(null)
  const [current, setCurrent] = useState<ScoreNote[]>([])
  const statusRef = useRef(status)
  const engineRef = useRef<Engine | null>(null)
  const judgementsRef = useRef<Judgement[]>([])
  const touchesRef = useRef<Touch[]>([])
  const downRef = useRef<Map<number, Touch>>(new Map())
  const rafRef = useRef(0)
  /** Which timing a key press would start, or null when this drill is off screen. */
  const autoStartRef = useRef<DrillTiming | null>(null)
  autoStartRef.current = active ? timing : null
  const startingRef = useRef(false)
  const perfectRef = useRef(80)
  const onDoneRef = useRef(onDone)
  onDoneRef.current = onDone
  const matchRef = useRef(match)
  matchRef.current = match
  const runRef = useRef({ bpm, countIn: 4, timing, notes })

  const setRunStatus = (next: typeof status) => {
    statusRef.current = next
    setStatus(next)
  }

  const finish = (reason: 'done' | 'stop') => {
    if (statusRef.current !== 'playing' && statusRef.current !== 'countin') return
    if (rafRef.current) cancelAnimationFrame(rafRef.current)
    stopMetronome()
    const engine = engineRef.current
    if (engine && timing === 'strict') engine.advanceTo(Number.POSITIVE_INFINITY)
    const report = summarize(runRef.current.notes, judgementsRef.current, perfectRef.current)
    setSummary(report)
    setCurrent([])
    setCountBeat(null)
    engineRef.current = null
    setRunStatus('finished')
    if (reason === 'done') onDoneRef.current(report, judgementsRef.current, touchesRef.current)
  }

  const finishRef = useRef(finish)
  finishRef.current = finish

  const push = useCallback((event: PlayedEvent) => {
    if (event.type === 'off') {
      const touch = downRef.current.get(event.pitch)
      if (touch && touch.offMs == null) touch.offMs = event.timeMs
      downRef.current.delete(event.pitch)
      return
    }
    // Strict mode runs on the audio clock, which the browser keeps frozen until the page has had a real
    // click. MIDI is not a user gesture, so before that click a key cannot start a strict take.
    const auto = autoStartRef.current
    if (statusRef.current === 'idle' && (auto === 'wait' || (auto === 'strict' && audioUnlocked()))) {
      // The metronome may still be loading. Keys pressed meanwhile must not start a second take.
      if (startingRef.current) return
      startingRef.current = true
      // The first key starts the drill, so hands can stay on the piano. Wait mode also judges that key;
      // strict mode counts in first, so the key that started it is not part of the take.
      void startRef.current().then(() => {
        startingRef.current = false
        if (runRef.current.timing === 'wait' && statusRef.current === 'playing') pushRef.current(event)
      })
      return
    }
    if (statusRef.current !== 'playing') return
    const engine = engineRef.current
    if (!engine) return
    let timeMs = 0
    if (runRef.current.timing === 'strict') {
      const transportMs = mapPerformanceToTransportMs({
        eventPerformanceMs: event.timeMs,
        performanceNowMs: performance.now(),
        transportSeconds: transportSeconds(),
      })
      timeMs = toScoreTimeMs(transportMs, runRef.current.countIn, runRef.current.bpm)
      if (timeMs < 0) return
    }
    const pitch = matchRef.current(event.pitch, engine.currentNotes())
    const produced = engine.push({ ...event, pitch, timeMs })
    if (produced.length === 0) return
    const hit = produced.find((item) => item.result === 'hit' && item.noteId)
    if (hit?.noteId) {
      const touch: Touch = { noteId: hit.noteId, onMs: event.timeMs, velocity: event.velocity }
      touchesRef.current = [...touchesRef.current, touch]
      downRef.current.set(event.pitch, touch)
    }
    judgementsRef.current = [...judgementsRef.current, ...produced]
    setJudgements(judgementsRef.current)
    setCurrent(engine.currentNotes())
    if (runRef.current.timing === 'wait') scoreRef.current?.setBeat(engine.cursorBeat() ?? 0)
    if (engine.done()) finishRef.current('done')
  }, [scoreRef])
  const pushRef = useRef(push)
  pushRef.current = push

  useEffect(() => {
    statusRef.current = 'idle'
    engineRef.current = null
    judgementsRef.current = []
    if (rafRef.current) cancelAnimationFrame(rafRef.current)
    stopMetronome()
    setStatus('idle')
    setJudgements([])
    setSummary(null)
    setCountBeat(null)
    setCurrent([])
  }, [notes])

  useEffect(() => {
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      stopMetronome()
    }
  }, [])

  const start = async () => {
    if (notes.length === 0 || statusRef.current === 'playing' || statusRef.current === 'countin') return
    stopMetronome()
    if (rafRef.current) cancelAnimationFrame(rafRef.current)
    judgementsRef.current = []
    touchesRef.current = []
    downRef.current = new Map()
    setJudgements([])
    setSummary(null)
    const windows = timingForExercise(notes, bpm, level)
    perfectRef.current = windows.perfectMs
    const countIn = quarterBeatsPerMeasure(time) * countInBars
    runRef.current = { bpm, countIn, timing, notes }
    const engine: Engine = timing === 'wait' ? new WaitMode(notes) : new RhythmMode(notes, { bpm, latencyOffsetMs, earlyMs: windows.earlyMs, lateMs: windows.lateMs })
    engineRef.current = engine
    scoreRef.current?.prepare('both', engine.cursorBeat() ?? 0)
    setCurrent(engine.currentNotes())
    if (timing === 'wait') {
      if (metronome) await startMetronome(bpm, countIn, true)
      setRunStatus('playing')
      return
    }
    setRunStatus('countin')
    setCountBeat(1)
    await startMetronome(bpm, countIn, metronome)
    const phase: string = statusRef.current
    if (phase !== 'countin') return
    const loop = () => {
      if (statusRef.current !== 'countin' && statusRef.current !== 'playing') return
      const scoreMs = toScoreTimeMs(transportSeconds() * 1000, runRef.current.countIn, runRef.current.bpm)
      if (scoreMs < 0) {
        const beatMs = 60_000 / runRef.current.bpm
        const elapsed = scoreMs + runRef.current.countIn * beatMs
        setCountBeat(Math.min(runRef.current.countIn, Math.floor(elapsed / beatMs) + 1))
      } else {
        if (statusRef.current === 'countin') {
          setRunStatus('playing')
          setCountBeat(null)
        }
        const live = engineRef.current
        if (live) {
          const produced = live.advanceTo(scoreMs - MISS_CUSHION_MS)
          if (produced.length > 0) {
            judgementsRef.current = [...judgementsRef.current, ...produced]
            setJudgements(judgementsRef.current)
          }
          scoreRef.current?.setBeat(scoreMs / (60_000 / runRef.current.bpm))
          const lastBeat = runRef.current.notes.reduce((max, note) => Math.max(max, note.beat + note.duration), 0)
          const endMs = (lastBeat * 60_000) / runRef.current.bpm + 400
          if (scoreMs > endMs || live.done()) {
            finishRef.current('done')
            return
          }
        }
      }
      rafRef.current = requestAnimationFrame(loop)
    }
    rafRef.current = requestAnimationFrame(loop)
  }

  const startRef = useRef(start)
  startRef.current = start
  const stop = () => finishRef.current('stop')

  return { status, judgements, summary, countBeat, current, push, start, stop }
}

/** False until the page has had a click or key press, so audio may still be blocked. */
export function audioUnlocked(): boolean {
  return typeof navigator === 'undefined' || !navigator.userActivation || navigator.userActivation.hasBeenActive
}
