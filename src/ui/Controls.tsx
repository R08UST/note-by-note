import { BEGINNER_TOLERANCE } from '../judge/types'
import type { HandSelection } from '../modes/hands'
import type { PracticeMode } from '../modes/practiceMode'
import type { RunStatus } from './usePractice'

interface ControlsProps {
  bpm: number
  hands: HandSelection
  mode: PracticeMode
  loop: boolean
  status: RunStatus
  canStart: boolean
  onBpm: (bpm: number) => void
  onHands: (hands: HandSelection) => void
  onMode: (mode: PracticeMode) => void
  onLoop: (loop: boolean) => void
  onStart: () => void
  onStop: () => void
}

const HANDS: { id: HandSelection; label: string }[] = [
  { id: 'L', label: 'Left' },
  { id: 'R', label: 'Right' },
  { id: 'both', label: 'Both' },
]

export function Controls({
  bpm,
  hands,
  mode,
  loop,
  status,
  canStart,
  onBpm,
  onHands,
  onMode,
  onLoop,
  onStart,
  onStop,
}: ControlsProps) {
  const locked = status === 'playing' || status === 'countin'
  const running = locked
  return (
    <div className="controls">
      <label className="field bpm">
        <span>Quarter = {bpm}</span>
        <input
          type="range"
          min={40}
          max={160}
          value={bpm}
          disabled={locked}
          onChange={(event) => onBpm(Number(event.target.value))}
        />
      </label>
      <div className="segmented" role="group" aria-label="Hands">
        {HANDS.map((item) => (
          <button
            key={item.id}
            type="button"
            aria-pressed={hands === item.id}
            disabled={locked}
            onClick={() => onHands(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>
      <div className="segmented" role="group" aria-label="Mode">
        <button type="button" aria-pressed={mode === 'wait'} disabled={locked} onClick={() => onMode('wait')}>
          Wait
        </button>
        <button type="button" aria-pressed={mode === 'rhythm'} disabled={locked} onClick={() => onMode('rhythm')}>
          Rhythm
        </button>
      </div>
      <button
        type="button"
        className={loop ? 'loop is-on' : 'loop'}
        aria-pressed={loop}
        disabled={locked}
        onClick={() => onLoop(!loop)}
      >
        Loop
      </button>
      <div className="transport-buttons">
        <button type="button" className="button primary" disabled={!canStart} onClick={onStart}>
          {status === 'finished' ? 'Start again' : 'Start'}
        </button>
        <button type="button" className="button stop" disabled={!running} onClick={onStop}>
          Stop
        </button>
      </div>
      <p className="control-hint">
        {mode === 'wait'
          ? 'Wait mode holds the cursor until the written notes are down. A wrong key is flagged, and you can try again.'
          : `Rhythm mode counts in, then keeps time. A hit within ${BEGINNER_TOLERANCE.perfectMs} ms is on time. The window is ${BEGINNER_TOLERANCE.earlyMs} ms early and ${BEGINNER_TOLERANCE.lateMs} ms late, tightened when notes sit close together.`}
        {loop ? ' Loop starts the piece again when you reach the end.' : ''}
      </p>
    </div>
  )
}
