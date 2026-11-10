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
          等待
        </button>
        <button type="button" aria-pressed={mode === 'rhythm'} disabled={locked} onClick={() => onMode('rhythm')}>
          节奏
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
        <button type="button" className="button primary" disabled={!canStart} onClick={onStart}>
          {status === 'finished' ? '再来一次' : '开始'}
        </button>
        <button type="button" className="button stop" disabled={!running} onClick={onStop}>
          停止
        </button>
      </div>
      <p className="control-hint">
        {mode === 'wait'
          ? '等待模式会停在当前音，直到你按下乐谱上的音。按错可以重试。'
          : '节奏模式先预备，再按拍子走。判定窗口是最短音符的一半，最长不超过 250 毫秒。'}
        {loop ? ' 走到结尾会再来一遍。' : ''}
      </p>
    </div>
  )
}
