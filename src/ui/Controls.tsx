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
  embedded?: boolean
}

const HANDS: { id: HandSelection; label: string }[] = [
  { id: 'L', label: '左手' },
  { id: 'R', label: '右手' },
  { id: 'both', label: '双手' },
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
  embedded = false,
}: ControlsProps) {
  const locked = status === 'playing' || status === 'countin'
  const running = locked
  return (
    <div className={embedded ? 'controls is-embedded' : 'controls'} data-status={status}>
      <label className="field bpm">
        <span>四分音符 = {bpm}</span>
        <input
          type="range"
          min={40}
          max={160}
          value={bpm}
          disabled={locked}
          onChange={(event) => onBpm(Number(event.target.value))}
        />
      </label>
      <div className="segmented" role="group" aria-label="哪只手">
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
      <div className="segmented" role="group" aria-label="练习方式">
        <button type="button" aria-pressed={mode === 'wait'} disabled={locked} onClick={() => onMode('wait')}>
          等我
        </button>
        <button type="button" aria-pressed={mode === 'rhythm'} disabled={locked} onClick={() => onMode('rhythm')}>
          跟拍
        </button>
      </div>
      <button
        type="button"
        className={loop ? 'button loop is-on' : 'button loop'}
        aria-pressed={loop}
        disabled={locked}
        onClick={() => onLoop(!loop)}
      >
        循环
      </button>
      <div className="transport-buttons">
        {running ? (
          <button type="button" className="button stop" onClick={onStop}>停止</button>
        ) : (
          <button type="button" className="button primary" disabled={!canStart} onClick={onStart}>
            {status === 'finished' ? '再来一次' : '开始'}
          </button>
        )}
      </div>
      <p className="control-hint">
        {mode === 'wait'
          ? '等我：直接弹谱上的第一个音就开始，不用点按钮。光标停在当前音，弹对了才往前走。'
          : '跟拍：点开始，先数一小节，再跟着节拍器弹。'}
        {loop ? ' 走到结尾会再来一遍。' : ''}
      </p>
    </div>
  )
}
