import { useEffect, useRef, useState } from 'react'
import type { ScoreNote } from '../judge/types'
import { keyboardBounds, Keyboard } from './Keyboard'

interface ListenBarProps {
  notes: readonly ScoreNote[]
  /** Where playback starts when loop is off: the cursor. */
  startBeat: number
  /** Selected range, used when loop is on. */
  rangeStart: number
  rangeEnd: number
  bpm: number
  onBpm: (bpm: number) => void
  disabled?: boolean
  onBeat: (beat: number) => void
  onPractice: () => void
  /** Next item in the shelf. Continuous play calls this when a piece ends. */
  onNext?: () => void
  /** Practice draws these on its own keyboard. Train keeps a keyboard here. */
  showKeyboard?: boolean
  onSounding?: (hands: Readonly<Record<number, 'L' | 'R'>>) => void
}

export function ListenBar({ notes, startBeat, rangeStart, rangeEnd, bpm, onBpm, disabled, onBeat, onPractice, onNext, showKeyboard = true, onSounding }: ListenBarProps) {
  const [playing, setPlaying] = useState(false)
  const [paused, setPaused] = useState(false)
  const [loop, setLoop] = useState(false)
  const [continuous, setContinuous] = useState(false)
  const [offer, setOffer] = useState(false)
  const [sounding, setSounding] = useState<Record<number, 'L' | 'R'>>({})
  const engineRef = useRef<typeof import('../audio/engine') | null>(null)
  const continuousRef = useRef(false)
  const armNext = useRef(false)
  const pieceKey = `${notes.length}:${notes[0]?.pitch ?? 0}:${notes[notes.length - 1]?.beat ?? 0}`
  const last = notes.reduce((max, note) => Math.max(max, note.beat + note.duration), startBeat)
  const bounds = keyboardBounds([...notes])

  const begin = async (fromLoop: boolean) => {
    const engine = engineRef.current ?? (await import('../audio/engine'))
    engineRef.current = engine
    const low = fromLoop ? Math.min(rangeStart, rangeEnd) : startBeat
    const high = fromLoop ? Math.max(rangeStart, rangeEnd) : last
    const selected = notes.filter((note) => note.beat >= low - 1e-3 && note.beat <= high + 1e-3)
    if (selected.length === 0) return
    setOffer(false)
    setPlaying(true)
    setPaused(false)
    await engine.startDemo({
      notes: selected,
      bpm,
      startBeat: low,
      endBeat: high,
      loop: fromLoop,
      countInBeats: 0,
      onBeat,
      onSounding: (active) => {
        const next: Record<number, 'L' | 'R'> = {}
        for (const note of active) next[note.pitch] = note.hand
        setSounding(next)
        onSounding?.(next)
      },
      onEnded: () => {
        setPlaying(false)
        setPaused(false)
        setSounding({})
        onSounding?.({})
        if (continuousRef.current && onNext) {
          armNext.current = true
          onNext()
        } else setOffer(true)
      },
    })
  }

  useEffect(() => {
    if (!armNext.current) return
    armNext.current = false
    void begin(false)
    // Restart after the shelf advances to the next piece.
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

  return (
    <div className="listen-bar">
      <button type="button" className="button primary listen-play" disabled={disabled && !playing} onClick={() => void toggle()}>
        {playing && !paused ? '暂停' : '播放'}
      </button>
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
      <label className="check">
        <input type="checkbox" checked={loop} onChange={(event) => setLoop(event.target.checked)} />
        循环选区
      </label>
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
      <button
        type="button"
        className="button ghost"
        onClick={() => {
          engineRef.current?.stopDemo()
          setPlaying(false)
          setPaused(false)
          setSounding({})
          onSounding?.({})
        }}
      >
        停止
      </button>
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
      {offer && (
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
      )}
    </div>
  )
}
