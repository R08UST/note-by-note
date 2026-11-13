import { useEffect, useImperativeHandle, useRef, useState, type ReactNode, type Ref } from 'react'
import { createPortal } from 'react-dom'
import type { ScoreNote } from '../judge/types'
import { compilePerformance, type Expression } from '../audio/performance'
import { seekPlayback, type PlaybackSpan } from '../audio/seek'
import { keyboardBounds, Keyboard } from './Keyboard'

/** What the practice toolbar can ask of the demo without taking over its controls. */
export interface ListenHandle {
  /** True while the demo is playing or paused. */
  playing(): boolean
  /** Jump the running demo to `beat`. Returns false when nothing is playing. */
  seek(beat: number): boolean
  /** Silence the demo, for a piece that is about to be replaced. */
  stop(): void
}

interface ListenBarProps {
  notes: readonly ScoreNote[]
  /** Identifies the piece. Changing it ends the demo of the piece it replaced. */
  pieceId?: string
  /** Where playback starts when loop is off: the cursor. */
  startBeat: number
  /** Selected range, used when loop is on. */
  rangeStart: number
  rangeEnd: number
  bpm: number
  onBpm: (bpm: number) => void
  disabled?: boolean
  /** Dynamics, hairpins, pedal and tempo printed on the score. */
  expression?: Expression
  /** Follow the score's own tempo changes instead of the flat BPM. */
  scoreTempo?: boolean
  onBeat: (beat: number) => void
  onPractice: () => void
  /** Next item in the shelf. Continuous play calls this when a piece ends. */
  onNext?: () => void
  /** Practice draws these on its own keyboard. Train keeps a keyboard here. */
  showKeyboard?: boolean
  onSounding?: (hands: Readonly<Record<number, 'L' | 'R'>>) => void
  /** Practice toolbar: only the play button stays inline. Extras go into this host. */
  toolbar?: boolean
  menuHost?: HTMLElement | null
  ref?: Ref<ListenHandle>
}

export function ListenBar({ notes, pieceId = '', startBeat, rangeStart, rangeEnd, bpm, onBpm, disabled, expression, scoreTempo = true, onBeat, onPractice, onNext, showKeyboard = true, onSounding, toolbar = false, menuHost = null, ref }: ListenBarProps) {
  const [playing, setPlaying] = useState(false)
  const [paused, setPaused] = useState(false)
  const [loop, setLoop] = useState(false)
  const [continuous, setContinuous] = useState(false)
  const [followScoreTempo, setFollowScoreTempo] = useState(scoreTempo)
  const [offer, setOffer] = useState(false)
  const [sounding, setSounding] = useState<Record<number, 'L' | 'R'>>({})
  const engineRef = useRef<typeof import('../audio/engine') | null>(null)
  const continuousRef = useRef(false)
  const armNext = useRef(false)
  const last = notes.reduce((max, note) => Math.max(max, note.beat + note.duration), startBeat)
  /** End of the whole piece, so a jump to the last note still plays it out. */
  const lastBeat = notes.reduce((max, note) => Math.max(max, note.beat + note.duration), 0)
  /** First sounding beat of the piece, which is where continuous play resumes. */
  const firstBeat = notes.reduce((min, note) => Math.min(min, note.beat), lastBeat)
  // Callers that cannot name the piece still need continuous play to tell two
  // exercises apart, so fall back to a fingerprint of the notes themselves.
  const pieceKey = pieceId || `${notes.length}:${notes[0]?.pitch ?? 0}:${notes[notes.length - 1]?.beat ?? 0}`
  const bounds = keyboardBounds([...notes])
  const hasScoreTempo = (expression?.tempos?.length ?? 0) > 0
  /** The span the running demo covers. Kept in a ref so a seek need not re-render. */
  const spanRef = useRef<PlaybackSpan>({ startBeat, endBeat: last, loop: false })
  const playingRef = useRef(false)
  /** The piece the current demo belongs to. A new piece must not inherit it. */
  const demoPieceRef = useRef(pieceKey)
  const stopRef = useRef<() => void>(() => {})

  const play = async (span: PlaybackSpan) => {
    const engine = engineRef.current ?? (await import('../audio/engine'))
    engineRef.current = engine
    const selected = notes.filter((note) => note.beat >= span.startBeat - 1e-3 && note.beat <= span.endBeat + 1e-3)
    // Nothing to sound from here: leaving the old span in place would keep the demo
    // running past a spot the player asked for, so give up rather than guess.
    if (selected.length === 0) return false
    spanRef.current = span
    demoPieceRef.current = pieceKey
    setOffer(false)
    setPlaying(true)
    playingRef.current = true
    setPaused(false)
    await engine.startDemo({
      notes: compilePerformance(selected, expression),
      bpm,
      startBeat: span.startBeat,
      endBeat: span.endBeat,
      loop: span.loop,
      countInBeats: 0,
      tempos: followScoreTempo ? expression?.tempos : undefined,
      onBeat,
      onSounding: (active) => {
        const next: Record<number, 'L' | 'R'> = {}
        for (const note of active) next[note.pitch] = note.hand
        setSounding(next)
        onSounding?.(next)
      },
      onEnded: () => {
        setPlaying(false)
        playingRef.current = false
        setPaused(false)
        setSounding({})
        onSounding?.({})
        if (continuousRef.current && onNext) {
          // The shelf is about to swap the piece in. Ask for the new one to start
          // from its own beginning rather than the beat the old piece stopped on.
          armNext.current = true
          onNext()
        } else setOffer(true)
      },
    })
    return true
  }

  const begin = async (fromLoop: boolean) => {
    const low = fromLoop ? Math.min(rangeStart, rangeEnd) : startBeat
    const high = fromLoop ? Math.max(rangeStart, rangeEnd) : last
    return play({ startBeat: low, endBeat: high, loop: fromLoop })
  }

  useEffect(() => {
    if (demoPieceRef.current === pieceKey) return
    demoPieceRef.current = pieceKey
    // Continuous play advances the shelf on its own; the next piece should be heard
    // from its first note. Any other switch means the player chose a different piece,
    // so the demo of the old one has to fall silent instead of carrying on.
    if (armNext.current) {
      armNext.current = false
      void play({ startBeat: firstBeat, endBeat: lastBeat, loop: false })
      return
    }
    stopRef.current()
    // Restart or silence only when the piece itself changes, not on every re-render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pieceKey])

  const toggle = async () => {
    const engine = engineRef.current
    if (playing && !paused) {
      engine?.pauseDemo()
      setPaused(true)
      return
    }
    if (playing && paused) {
      engine?.resumeDemo()
      setPaused(false)
      return
    }
    await begin(loop)
  }

  const stop = () => {
    engineRef.current?.stopDemo()
    setPlaying(false)
    playingRef.current = false
    setPaused(false)
    setOffer(false)
    setSounding({})
    onSounding?.({})
  }
  stopRef.current = stop

  /** Jump the running demo to `beat`; a paused demo starts from there again. */
  const seekTo = (beat: number): boolean => {
    if (!playingRef.current) return false
    // Use the loop box as it stands now, not as it stood when playback began, so
    // ticking it mid-listen makes the next click repeat the selection.
    const span = loop
      ? { startBeat: Math.min(rangeStart, rangeEnd), endBeat: Math.max(rangeStart, rangeEnd), loop: true }
      : { ...spanRef.current, loop: false }
    const next = seekPlayback(span, beat, lastBeat)
    void play(next)
    return true
  }
  useImperativeHandle(ref, () => ({
    playing: () => playingRef.current,
    seek: seekTo,
    stop,
  }))
  const extras: ReactNode = (
    <>
      {!toolbar && (
        <label className="field bpm">
          <span>速度 {bpm}</span>
          <input
            type="range"
            min={40}
            max={160}
            value={bpm}
            onChange={(event) => {
              const next = Number(event.target.value)
              onBpm(next)
              void engineRef.current?.setDemoTempo(next)
            }}
          />
        </label>
      )}
      <label className="check">
        <input type="checkbox" checked={loop} onChange={(event) => setLoop(event.target.checked)} />
        循环选区
      </label>
      {hasScoreTempo && (
        <label className="check">
          <input
            type="checkbox"
            checked={followScoreTempo}
            onChange={(event) => setFollowScoreTempo(event.target.checked)}
          />
          按谱面速度
        </label>
      )}
      <label className="check">
        <input
          type="checkbox"
          checked={continuous}
          onChange={(event) => {
            continuousRef.current = event.target.checked
            setContinuous(event.target.checked)
          }}
        />
        连续播放
      </label>
    </>
  )
  const offerBox = offer ? (
    <div className="promote-offer" role="status">
      <p>听完了。要练这一段吗？</p>
      <button
        type="button"
        className="button primary"
        onClick={() => {
          setOffer(false)
          onBeat(loop ? Math.min(rangeStart, rangeEnd) : startBeat)
          onPractice()
        }}
      >
        开始练习
      </button>
      <button type="button" className="button ghost" onClick={() => setOffer(false)}>先不练</button>
    </div>
  ) : null

  return (
    <div className={toolbar ? 'listen-bar is-toolbar' : 'listen-bar'}>
      <button type="button" className="button primary listen-play" title="从当前位置播放" disabled={disabled && !playing} onClick={() => void toggle()}>
        {playing && !paused ? '暂停' : '播放'}
      </button>
      <button type="button" className="button ghost" title="停止播放" onClick={stop}>停止</button>
      {toolbar && menuHost ? createPortal(<div className="listen-menu">{extras}</div>, menuHost) : extras}
      {showKeyboard && (
        <Keyboard
          low={bounds.low}
          high={bounds.high}
          pressed={new Set()}
          flashes={{}}
          targets={[]}
          hints={[]}
          hands={sounding}
          onEvent={() => {}}
        />
      )}
      {offerBox}
    </div>
  )
}
