import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'
import type { Judgement, PlayedEvent, ScoreNote } from '../judge/types'
import { pitchForCode } from '../midi/keyboardMap'
import { selectHands, type HandSelection } from '../modes/hands'
import type { PracticeMode } from '../modes/practiceMode'
import { RhythmMode } from '../modes/rhythmMode'
import { WaitMode } from '../modes/waitMode'
import { entryClock, notesInBeats, shiftNotes, type BeatSpan } from '../modes/span'
import { summarize, type RunSummary } from '../report/summary'
import type { TimeSignature } from '../score/parseMusicXml'
import { quarterBeatsPerMeasure } from '../score/parseMusicXml'
import { latestRun, saveRun, type RunRecord } from '../storage/db'
import { timingForExercise } from '../train/timing'
import { MISS_CUSHION_MS, mapPerformanceToTransportMs, toScoreTimeMs } from '../transport/clock'
import { startMetronome, stopMetronome, transportSeconds } from '../transport/metronome'
import { scoreColor } from './format'
import type { ScoreHandle } from './ScoreView'

export type RunStatus = 'idle' | 'countin' | 'playing' | 'finished'

interface PracticeOptions {
  notes: ScoreNote[]
  pieceId: string
  pieceTitle: string
  bpm: number
  hands: HandSelection
  mode: PracticeMode
  latencyOffsetMs: number
  timeSignature: TimeSignature
  scoreRef: RefObject<ScoreHandle | null>
  loop: boolean
  /** Inclusive onset span. Both hands at one beat are one step. */
  span: BeatSpan
  /** 0 keeps looping until Stop. */
  loopLimit: number
  ramp: boolean
  onRamp: () => void
  keyboardEnabled: boolean
  listenKeyboard?: boolean
}

type Engine = WaitMode | RhythmMode

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  const tag = target.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable
}

export function usePractice({
  notes,
  pieceId,
  pieceTitle,
  bpm,
  hands,
  mode,
  latencyOffsetMs,
  timeSignature,
  scoreRef,
  loop,
  span,
  loopLimit,
  ramp,
  onRamp,
  keyboardEnabled,
  listenKeyboard = true,
}: PracticeOptions) {
  const [status, setStatus] = useState<RunStatus>('idle')
  const [pressed, setPressed] = useState<Set<number>>(() => new Set())
  const [flashes, setFlashes] = useState<Record<number, 'hit' | 'wrong' | 'miss' | 'extra'>>({})
  const [current, setCurrent] = useState<ScoreNote[]>([])
  const [last, setLast] = useState<Judgement | null>(null)
  const [judgements, setJudgements] = useState<Judgement[]>([])
  const [summary, setSummary] = useState<RunSummary | null>(null)
  const [countBeat, setCountBeat] = useState<number | null>(null)
  const [previous, setPrevious] = useState<RunRecord | null>(null)

  const statusRef = useRef<RunStatus>('idle')
  const engineRef = useRef<Engine | null>(null)
  const judgementsRef = useRef<Judgement[]>([])
  const finishingRef = useRef(false)
  const rafRef = useRef(0)
  const flashTimers = useRef<number[]>([])
  const heldKeys = useRef<Set<string>>(new Set())
  const savedAtRef = useRef(0)
  const savedPieceRef = useRef('')
  const runRef = useRef({
    bpm,
    mode,
    countInBeats: 4,
    notes: [] as ScoreNote[],
    pieceId,
    perfectMs: 80,
    originBeat: 0,
    entryBeat: 0,
  })
  const passesRef = useRef<RunSummary[]>([])
  const [passes, setPasses] = useState<RunSummary[]>([])

  const optionsRef = useRef({
    notes,
    pieceId,
    pieceTitle,
    bpm,
    hands,
    mode,
    latencyOffsetMs,
    timeSignature,
    loop,
    span,
    loopLimit,
    ramp,
    onRamp,
  })
  optionsRef.current = { notes, pieceId, pieceTitle, bpm, hands, mode, latencyOffsetMs, timeSignature, loop, span, loopLimit, ramp, onRamp }
  const startRef = useRef<(keepPasses?: boolean) => Promise<void>>(async () => {})

  const setRunStatus = (next: RunStatus) => {
    statusRef.current = next
    setStatus(next)
  }

  const remember = (items: Judgement[]) => {
    if (items.length === 0) return
    judgementsRef.current = [...judgementsRef.current, ...items]
    setJudgements(judgementsRef.current)
    setLast(items[items.length - 1] ?? null)
    for (const item of items) {
      if (item.noteId) scoreRef.current?.colorNote(item.noteId, scoreColor(item))
      setFlashes((prev) => ({ ...prev, [item.pitch]: item.result }))
      const timer = window.setTimeout(() => {
        setFlashes((prev) => {
          if (prev[item.pitch] !== item.result) return prev
          const next = { ...prev }
          delete next[item.pitch]
          return next
        })
      }, 700)
      flashTimers.current.push(timer)
    }
    const engine = engineRef.current
    if (runRef.current.mode === 'wait' && engine) {
      const beat = engine.cursorBeat()
      if (beat != null) scoreRef.current?.setBeat(runRef.current.originBeat + beat)
    }
    setCurrent(engine?.currentNotes() ?? [])
  }

  const finish = (reason: 'done' | 'stop') => {
    if (finishingRef.current) return
    if (statusRef.current === 'idle' || statusRef.current === 'finished') return
    finishingRef.current = true
    const engine = engineRef.current
    if (engine && runRef.current.mode === 'rhythm') {
      const now = toScoreTimeMs(transportSeconds() * 1000, runRef.current.countInBeats, runRef.current.bpm)
      const flushed =
        reason === 'done' ? engine.advanceTo(Number.POSITIVE_INFINITY) : engine.advanceTo(Math.max(0, now))
      remember(flushed)
    }
    stopMetronome()
    if (rafRef.current) cancelAnimationFrame(rafRef.current)
    rafRef.current = 0
    const report = summarize(runRef.current.notes, judgementsRef.current, runRef.current.perfectMs)
    const options = optionsRef.current
    const continuing =
      reason === 'done' &&
      options.loop &&
      (options.loopLimit === 0 || passesRef.current.length + 1 < options.loopLimit)
    if (continuing) {
      const nextPasses = [...passesRef.current, report]
      passesRef.current = nextPasses
      setPasses(nextPasses)
      setSummary(report)
      if (options.ramp && report.hitRate >= 0.9) options.onRamp()
      finishingRef.current = false
      setRunStatus('idle')
      window.setTimeout(() => {
        void startRef.current(true)
      }, 280)
      return
    }
    if (passesRef.current.length > 0 || reason === 'done') {
      const nextPasses = [...passesRef.current, report]
      passesRef.current = nextPasses
      setPasses(nextPasses)
    }
    setSummary(report)
    setCurrent([])
    setCountBeat(null)
    engineRef.current = null
    setRunStatus('finished')
    finishingRef.current = false
    if (judgementsRef.current.length > 0) {
      const record: RunRecord = {
        pieceId: runRef.current.pieceId,
        title: optionsRef.current.pieceTitle,
        createdAt: Date.now(),
        hitRate: report.hitRate,
        meanOffsetMs: report.meanOffsetMs,
        mode: runRef.current.mode,
        errorsPerMeasure: report.errorsPerMeasure,
      }
      savedAtRef.current = record.createdAt
      savedPieceRef.current = record.pieceId
      void saveRun(record)
      setPrevious(record)
    }
    if (reason === 'done' && optionsRef.current.loop) {
      window.setTimeout(() => {
        if (statusRef.current === 'finished' && optionsRef.current.loop) void startRef.current()
      }, 350)
    }
  }

  const finishRef = useRef(finish)
  finishRef.current = finish
  const rememberRef = useRef(remember)
  rememberRef.current = remember

  const scoreNow = (eventPerformanceMs: number) => {
    const transportMs = mapPerformanceToTransportMs({
      eventPerformanceMs,
      performanceNowMs: performance.now(),
      transportSeconds: transportSeconds(),
    })
    return toScoreTimeMs(transportMs, runRef.current.countInBeats, runRef.current.bpm)
  }

  const onInputRef = useRef<(event: PlayedEvent) => void>(() => {})
  onInputRef.current = (event: PlayedEvent) => {
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
    const timeMs = runRef.current.mode === 'rhythm' ? scoreNow(event.timeMs) : 0
    if (runRef.current.mode === 'rhythm' && timeMs < 0) return
    const produced = engine.push({ ...event, timeMs })
    rememberRef.current(produced)
    if (engine.done()) finishRef.current('done')
  }

  const handleInput = useCallback((event: PlayedEvent) => {
    onInputRef.current(event)
  }, [])

  useEffect(() => {
    if (!listenKeyboard || !keyboardEnabled) return
    const down = (event: KeyboardEvent) => {
      if (event.repeat || event.metaKey || event.ctrlKey || event.altKey) return
      if (isTypingTarget(event.target)) return
      const pitch = pitchForCode(event.code)
      if (pitch == null) return
      event.preventDefault()
      if (heldKeys.current.has(event.code)) return
      heldKeys.current.add(event.code)
      handleInput({ pitch, velocity: 96, timeMs: performance.now(), type: 'on' })
    }
    const up = (event: KeyboardEvent) => {
      if (!heldKeys.current.has(event.code)) return
      heldKeys.current.delete(event.code)
      const pitch = pitchForCode(event.code)
      if (pitch == null) return
      handleInput({ pitch, velocity: 0, timeMs: performance.now(), type: 'off' })
    }
    const blur = () => {
      for (const code of heldKeys.current) {
        const pitch = pitchForCode(code)
        if (pitch != null) handleInput({ pitch, velocity: 0, timeMs: performance.now(), type: 'off' })
      }
      heldKeys.current.clear()
    }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    window.addEventListener('blur', blur)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
      window.removeEventListener('blur', blur)
    }
  }, [handleInput, keyboardEnabled, listenKeyboard])

  useEffect(() => {
    let cancel = false
    const requestedAt = Date.now()
    setPrevious(null)
    void latestRun(pieceId).then((run) => {
      if (cancel) return
      if (savedPieceRef.current === pieceId && savedAtRef.current >= requestedAt) return
      setPrevious(run ?? null)
    })
    statusRef.current = 'idle'
    engineRef.current = null
    judgementsRef.current = []
    finishingRef.current = false
    stopMetronome()
    if (rafRef.current) cancelAnimationFrame(rafRef.current)
    setStatus('idle')
    setJudgements([])
    setSummary(null)
    setLast(null)
    setCurrent([])
    setCountBeat(null)
    return () => {
      cancel = true
    }
  }, [pieceId])

  useEffect(() => {
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      stopMetronome()
      for (const timer of flashTimers.current) window.clearTimeout(timer)
    }
  }, [])

  const start = async (keepPasses = false) => {
    if (!keepPasses) {
      passesRef.current = []
      setPasses([])
    }
    const startingFrom = statusRef.current
    if (startingFrom === 'playing' || startingFrom === 'countin') return
    const options = optionsRef.current
    const selected = notesInBeats(selectHands(options.notes, options.hands), options.span)
    if (selected.length === 0) return
    const clock = entryClock(Math.min(options.span.startBeat, options.span.endBeat), quarterBeatsPerMeasure(options.timeSignature))
    const active = shiftNotes(selected, clock.downbeat)
    stopMetronome()
    if (rafRef.current) cancelAnimationFrame(rafRef.current)
    for (const timer of flashTimers.current) window.clearTimeout(timer)
    flashTimers.current = []
    setFlashes({})
    judgementsRef.current = []
    setJudgements([])
    setSummary(null)
    setLast(null)
    finishingRef.current = false
    const countInBeats = quarterBeatsPerMeasure(options.timeSignature)
    const windows = timingForExercise(active, options.bpm, 1)
    runRef.current = {
      bpm: options.bpm,
      mode: options.mode,
      countInBeats,
      notes: active,
      pieceId: options.pieceId,
      perfectMs: windows.perfectMs,
      originBeat: clock.downbeat,
      entryBeat: Math.min(options.span.startBeat, options.span.endBeat),
    }
    const engine: Engine =
      options.mode === 'wait'
        ? new WaitMode(active)
        : new RhythmMode(active, {
            bpm: options.bpm,
            latencyOffsetMs: options.latencyOffsetMs,
            earlyMs: windows.earlyMs,
            lateMs: windows.lateMs,
          })
    engineRef.current = engine
    scoreRef.current?.prepare(options.hands, runRef.current.entryBeat)
    setCurrent(engine.currentNotes())

    if (options.mode === 'rhythm') {
      setRunStatus('countin')
      setCountBeat(1)
      await startMetronome(options.bpm, countInBeats)
      if (statusRef.current !== 'countin') return
      const loop = () => {
        if (statusRef.current !== 'countin' && statusRef.current !== 'playing') return
        const scoreMs = toScoreTimeMs(transportSeconds() * 1000, runRef.current.countInBeats, runRef.current.bpm)
        if (scoreMs < 0) {
          const beatMs = 60_000 / runRef.current.bpm
          const elapsed = scoreMs + runRef.current.countInBeats * beatMs
          setCountBeat(Math.min(runRef.current.countInBeats, Math.floor(elapsed / beatMs) + 1))
          scoreRef.current?.setBeat(runRef.current.entryBeat)
        } else {
          if (statusRef.current === 'countin') {
            setRunStatus('playing')
            setCountBeat(null)
          }
          const live = engineRef.current
          if (live) {
            rememberRef.current(live.advanceTo(scoreMs - MISS_CUSHION_MS))
            const absolute = runRef.current.originBeat + scoreMs / (60_000 / runRef.current.bpm)
            scoreRef.current?.setBeat(Math.max(runRef.current.entryBeat, absolute))
            const lastBeat = runRef.current.notes.reduce((max, note) => Math.max(max, note.beat), 0)
            const endMs = (lastBeat * 60_000) / runRef.current.bpm + 250 + MISS_CUSHION_MS + 120
            if (scoreMs > endMs || live.done()) {
              finishRef.current('done')
              return
            }
          }
        }
        if (statusRef.current === 'countin' || statusRef.current === 'playing') {
          rafRef.current = requestAnimationFrame(loop)
        }
      }
      rafRef.current = requestAnimationFrame(loop)
      return
    }

    setRunStatus('playing')
  }

  startRef.current = start

  const stop = () => {
    if (statusRef.current === 'playing' || statusRef.current === 'countin') finishRef.current('stop')
  }

  const stepBack = () => {
    stepOnset(-1)
  }

  const stepOnset = (direction: -1 | 1): boolean => {
    const engine = engineRef.current
    if (!(engine instanceof WaitMode) || statusRef.current !== 'playing') return false
    if (direction < 0) engine.retreat()
    else engine.advance()
    judgementsRef.current = [...engine.judgements]
    setJudgements(judgementsRef.current)
    const beat = engine.cursorBeat()
    if (beat != null) scoreRef.current?.setBeat(runRef.current.originBeat + beat)
    const showing = engine.currentNotes()
    for (const note of showing) scoreRef.current?.colorNote(note.id, '#241c16')
    setCurrent(showing)
    return true
  }

  return {
    status,
    pressed,
    flashes,
    current,
    last,
    judgements,
    summary,
    passes,
    countBeat,
    previous,
    handleInput,
    start,
    stop,
    stepBack,
    stepOnset,
  }
}
