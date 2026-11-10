import { useRef, useState } from 'react'
import type { PlayedEvent, ScoreNote } from '../judge/types'
import type { TimeSignature } from '../score/parseMusicXml'
import { Keyboard } from './Keyboard'
import { RhythmPanel } from './RhythmPanel'
import { SightPanel } from './SightPanel'

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
  const [pane, setPane] = useState<'sight' | 'rhythm'>(() => 'sight')
  const sightPush = useRef<(event: PlayedEvent) => void>(() => {})
  const rhythmPush = useRef<(event: PlayedEvent) => void>(() => {})
  inputRef.current = (event) => {
    if (!active) return
    if (pane === 'sight') sightPush.current(event)
    else rhythmPush.current(event)
  }

  return (
    <section className="panel train">
      <h2>训练</h2>
      <p className="lede">认谱和节奏分开练。判定窗口跟着速度和最短的音符走，最长不超过 250 毫秒。</p>
      <div className="segmented train-switch" role="tablist" aria-label="训练">
        <button type="button" role="tab" aria-selected={pane === 'sight'} onClick={() => setPane('sight')}>视奏</button>
        <button type="button" role="tab" aria-selected={pane === 'rhythm'} onClick={() => setPane('rhythm')}>节奏</button>
      </div>
      {pane === 'sight' ? (
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
      ) : (
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
      <Keyboard
        low={48}
        high={84}
        pressed={new Set()}
        flashes={{}}
        targets={[]}
        hints={[]}
        onEvent={(event) => inputRef.current(event)}
      />
    </section>
  )
}
