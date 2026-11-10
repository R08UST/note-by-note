import { lazy, Suspense, useCallback, useRef, useState } from 'react'
import type { PlayedEvent, ScoreNote } from '../judge/types'
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

export function TrainTab({ active, keyboardEnabled, latencyOffsetMs, piece, onSaved, onCheckpoint, inputRef, continuous, onContinuous }: TrainTabProps) {
  const [pane, setPane] = useState<'sight' | 'rhythm' | 'scale' | 'chord'>('sight')
  const [keyRange, setKeyRange] = useState({ low: 48, high: 84 })
  const sightPush = useRef<(event: PlayedEvent) => void>(() => {})
  const rhythmPush = useRef<(event: PlayedEvent) => void>(() => {})
  const techPush = useRef<(event: PlayedEvent) => void>(() => {})
  const onRange = useCallback((low: number, high: number) => {
    setKeyRange((prev) => (prev.low === low && prev.high === high ? prev : { low, high }))
  }, [])
  inputRef.current = (event) => {
    if (!active) return
    if (pane === 'sight') sightPush.current(event)
    else if (pane === 'rhythm') rhythmPush.current(event)
    else techPush.current(event)
  }
  const range = pane === 'scale' || pane === 'chord' ? keyRange : { low: 48, high: 84 }

  return (
    <section className="panel train">
      <h2>训练</h2>
      <p className="lede">认谱、节奏、音阶和和弦分开练。判定窗口跟着速度和最短的音符走，最长不超过 250 毫秒。</p>
      <div className="segmented train-switch" role="tablist" aria-label="训练">
        <button type="button" role="tab" aria-selected={pane === 'sight'} onClick={() => setPane('sight')}>视奏</button>
        <button type="button" role="tab" aria-selected={pane === 'rhythm'} onClick={() => setPane('rhythm')}>节奏</button>
        <button type="button" role="tab" aria-selected={pane === 'scale'} onClick={() => setPane('scale')}>音阶</button>
        <button type="button" role="tab" aria-selected={pane === 'chord'} onClick={() => setPane('chord')}>和弦</button>
      </div>
      {pane === 'sight' && (
        <SightPanel
          active={active}
          keyboardEnabled={keyboardEnabled}
          latencyOffsetMs={latencyOffsetMs}
          onBind={(push) => {
            sightPush.current = push
          }}
          onSaved={onSaved}
          onCheckpoint={onCheckpoint}
          continuous={continuous}
          onContinuous={onContinuous}
        />
      )}
      {pane === 'rhythm' && (
        <RhythmPanel
          active={active}
          keyboardEnabled={keyboardEnabled}
          latencyOffsetMs={latencyOffsetMs}
          piece={piece}
          onBind={(push) => {
            rhythmPush.current = push
          }}
          onSaved={onSaved}
          continuous={continuous}
          onContinuous={onContinuous}
        />
      )}
      {(pane === 'scale' || pane === 'chord') && (
        <Suspense fallback={<p className="device-note">正在打开{pane === 'scale' ? '音阶' : '和弦'}…</p>}>
          <TechniquePanel
            kind={pane}
            active={active}
            keyboardEnabled={keyboardEnabled}
            latencyOffsetMs={latencyOffsetMs}
            onBind={(push) => {
              techPush.current = push
            }}
            onSaved={onSaved}
            onRange={onRange}
            continuous={continuous}
            onContinuous={onContinuous}
          />
        </Suspense>
      )}
      <Keyboard
        low={range.low}
        high={range.high}
        pressed={new Set()}
        flashes={{}}
        targets={[]}
        hints={[]}
        onEvent={(event) => inputRef.current(event)}
      />
    </section>
  )
}
