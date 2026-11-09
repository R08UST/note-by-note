import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'
import type { Judgement, PlayedEvent, ScoreNote } from '../judge/types'
import { pitchForCode } from '../midi/keyboardMap'
import { RhythmMode } from '../modes/rhythmMode'
import { WaitMode } from '../modes/waitMode'
import { summarize, type RunSummary } from '../report/summary'
import type { TimeSignature } from '../score/parseMusicXml'
import { quarterBeatsPerMeasure } from '../score/parseMusicXml'
import { MISS_CUSHION_MS, mapPerformanceToTransportMs, toScoreTimeMs } from '../transport/clock'
import { startMetronome, stopMetronome, transportSeconds } from '../transport/metronome'
import type { ScoreHandle } from './ScoreView'

type Engine = WaitMode | RhythmMode
export type DrillTiming = 'wait' | 'strict'

interface DrillOptions {
  active: boolean
  keyboardEnabled: boolean
  notes: ScoreNote[]
  bpm: number
  timing: DrillTiming
  metronome: boolean
  latencyOffsetMs: number
  time: TimeSignature
  scoreRef: RefObject<ScoreHandle | null>
  /** Rewrite a played pitch before the judge sees it. Rhythm drills use this so any key can count. */
  match: (played: number, upcoming: ScoreNote[]) => number
  onDone: (summary: RunSummary, judgements: Judgement[]) => void
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  const tag = target.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable
}

export function useDrill({
  active,
  keyboardEnabled,
  notes,
  bpm,
  timing,
  metronome,
  latencyOffsetMs,
  time,
  scoreRef,
  match,
  onDone,
}: DrillOptions) {
  const [status, setStatus] = useState<'idle' | 'countin' | 'playing' | 'finished'>('idle')
  const [judgements, setJudgements] = useState<Judgement[]>([])
  const [summary, setSummary] = useState<RunSummary | null>(null)
  const [countBeat, setCountBeat] = useState<number | null>(null)
  const [pressed, setPressed] = useState<Set<number>>(() => new Set())
  const [current, setCurrent] = useState<ScoreNote[]>([])
  const statusRef = useRef(status)
  const engineRef = useRef<Engine | null>(null)
  const judgementsRef = useRef<Judgement[]>([])
  const rafRef = useRef(0)
  const held = useRef<Set<string>>(new Set())
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
    const report = summarize(runRef.current.notes, judgementsRef.current)
    setSummary(report)
    setCurrent([])
    setCountBeat(null)
    engineRef.current = null
    setRunStatus('finished')
    if (reason === 'done') onDoneRef.current(report, judgementsRef.current)
  }

  const finishRef = useRef(finish)
  finishRef.current = finish

  const push = useCallback((event: PlayedEvent) => {
    setPressed((prev) => {
      const down = event.type === 'on'
      if (down === prev.has(event.pitch)) return prev
      const next = new Set(prev)
      if (down) next.add(event.pitch)
      else next.delete(event.pitch)
      return next
    })
    if (event.type !== 'on' || statusRef.current !== 'playing') return
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
    judgementsRef.current = [...judgementsRef.current, ...produced]
    setJudgements(judgementsRef.current)
    setCurrent(engine.currentNotes())
    if (runRef.current.timing === 'wait') scoreRef.current?.setBeat(engine.cursorBeat() ?? 0)
    if (engine.done()) finishRef.current('done')
  }, [scoreRef])

  useEffect(() => {
    if (!active || !keyboardEnabled) return
    const down = (event: KeyboardEvent) => {
      if (event.repeat || event.metaKey || event.ctrlKey || event.altKey) return
      if (isTypingTarget(event.target)) return
      const pitch = pitchForCode(event.code)
      if (pitch == null || held.current.has(event.code)) return
      held.current.add(event.code)
      event.preventDefault()
      push({ pitch, velocity: 96, timeMs: performance.now(), type: 'on' })
    }
    const up = (event: KeyboardEvent) => {
      if (!held.current.has(event.code)) return
      held.current.delete(event.code)
      const pitch = pitchForCode(event.code)
      if (pitch == null) return
      push({ pitch, velocity: 0, timeMs: performance.now(), type: 'off' })
    }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
    }
  }, [active, keyboardEnabled, push])

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
    setJudgements([])
    setSummary(null)
    const countIn = quarterBeatsPerMeasure(time)
    runRef.current = { bpm, countIn, timing, notes }
    const engine: Engine = timing === 'wait' ? new WaitMode(notes) : new RhythmMode(notes, { bpm, latencyOffsetMs })
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

  const stop = () => finishRef.current('stop')

  return { status, judgements, summary, countBeat, pressed, current, push, start, stop }
}
