import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react'
import type { PlayedEvent, ScoreNote } from '../judge/types'
import { pitchForCode } from '../midi/keyboardMap'
import type { TimeSignature } from '../score/parseMusicXml'
import { Keyboard } from './Keyboard'
import { RhythmPanel } from './RhythmPanel'
import { SightPanel } from './SightPanel'

const TechniquePanel = lazy(() => import('./TechniquePanel').then((mod) => ({ default: mod.TechniquePanel })))

interface TrainTabProps {
  active: boolean
  keyboardEnabled: boolean
  latencyOffsetMs: number
  piece: { id: string; title: string; notes: ScoreNote[]; time: TimeSignature } | null
  onSaved: () => void
  onCheckpoint: (pieceId: string) => void
  inputRef: { current: (event: PlayedEvent) => void }
  continuous: boolean
  onContinuous: (value: boolean) => void
}

type Pane = 'sight' | 'rhythm' | 'scale' | 'chord' | 'finger'
const PANES: [Pane, string][] = [
  ['finger', '指法'],
  ['scale', '音阶'],
  ['chord', '和弦'],
  ['sight', '视奏'],
  ['rhythm', '节奏'],
]

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  return ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || target.isContentEditable
}

export function TrainTab({ active, keyboardEnabled, latencyOffsetMs, piece, onSaved, onCheckpoint, inputRef, continuous, onContinuous }: TrainTabProps) {
  const [pane, setPane] = useState<Pane>('finger')
  const [keyRange, setKeyRange] = useState({ low: 48, high: 84 })
  const [pressed, setPressed] = useState<Set<number>>(() => new Set())
  const push = useRef<(event: PlayedEvent) => void>(() => {})
  const bind = useCallback((next: (event: PlayedEvent) => void) => {
    push.current = next
  }, [])
  const onRange = useCallback((low: number, high: number) => {
    setKeyRange((prev) => (prev.low === low && prev.high === high ? prev : { low, high }))
  }, [])

  // MIDI, the computer keyboard and the on-screen keys all come through here, so every pane hears every source.
  inputRef.current = (event) => {
    if (!active) return
    setPressed((prev) => {
      const down = event.type === 'on'
      if (down === prev.has(event.pitch)) return prev
      const next = new Set(prev)
      if (down) next.add(event.pitch)
      else next.delete(event.pitch)
      return next
    })
    push.current(event)
  }

  useEffect(() => {
    if (!active || !keyboardEnabled) return
    const held = new Set<string>()
    const down = (event: KeyboardEvent) => {
      if (event.repeat || event.metaKey || event.ctrlKey || event.altKey || isTypingTarget(event.target)) return
      const pitch = pitchForCode(event.code)
      if (pitch == null || held.has(event.code)) return
      held.add(event.code)
      event.preventDefault()
      inputRef.current({ pitch, velocity: 96, timeMs: performance.now(), type: 'on' })
    }
    const up = (event: KeyboardEvent) => {
      if (!held.delete(event.code)) return
      const pitch = pitchForCode(event.code)
      if (pitch != null) inputRef.current({ pitch, velocity: 0, timeMs: performance.now(), type: 'off' })
    }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
    }
  }, [active, keyboardEnabled, inputRef])

  const technique = pane === 'scale' || pane === 'chord' || pane === 'finger'
  const range = technique ? keyRange : { low: 48, high: 84 }
  const shared = { active, latencyOffsetMs, onBind: bind, onSaved, continuous, onContinuous }

  return (
    <section className="panel train">
      <div className="segmented train-switch" role="tablist" aria-label="训练">
        {PANES.map(([id, label]) => (
          <button key={id} type="button" role="tab" aria-selected={pane === id} onClick={() => setPane(id)}>{label}</button>
        ))}
      </div>
      {pane === 'sight' && <SightPanel {...shared} onCheckpoint={onCheckpoint} />}
      {pane === 'rhythm' && <RhythmPanel {...shared} piece={piece} />}
      {technique && (
        <Suspense fallback={<p className="device-note">正在打开…</p>}>
          <TechniquePanel key={pane} kind={pane} {...shared} onRange={onRange} />
        </Suspense>
      )}
      <Keyboard
        low={range.low}
        high={range.high}
        pressed={pressed}
        flashes={{}}
        targets={[]}
        hints={[]}
        onEvent={(event) => inputRef.current(event)}
      />
    </section>
  )
}
