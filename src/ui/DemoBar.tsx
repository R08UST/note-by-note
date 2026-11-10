import { useRef, useState } from 'react'
import type { ScoreNote } from '../judge/types'
import type { HandSelection } from '../modes/hands'
import { notesInBeats } from '../modes/span'

type DemoHand = 'L' | 'R' | 'both' | 'other'

interface DemoBarProps {
  notes: readonly ScoreNote[]
  bpm: number
  startBeat: number
  endBeat: number
  practiceHands: HandSelection
  loop: boolean
  disabled?: boolean
  onBeat: (beat: number) => void
}

export function DemoBar({ notes, bpm, startBeat, endBeat, practiceHands, loop, disabled, onBeat }: DemoBarProps) {
  const [demoHand, setDemoHand] = useState<DemoHand>('both')
  const [playing, setPlaying] = useState(false)
  const engineRef = useRef<typeof import('../audio/engine') | null>(null)
  const low = Math.min(startBeat, endBeat)
  const high = Math.max(startBeat, endBeat)

  const play = async () => {
    const engine = engineRef.current ?? (await import('../audio/engine'))
    engineRef.current = engine
    if (playing) {
      engine.stopDemo()
      setPlaying(false)
      return
    }
    const span = notesInBeats(notes, { startBeat: low, endBeat: high })
    const selected =
      demoHand === 'both'
        ? span
        : demoHand === 'other'
          ? span.filter((note) => (practiceHands === 'both' ? true : note.hand !== practiceHands))
          : span.filter((note) => note.hand === demoHand)
    if (selected.length === 0) return
    setPlaying(true)
    await engine.startDemo({
      notes: selected,
      bpm,
      startBeat: low,
      endBeat: high,
      loop,
      countInBeats: 4,
      onBeat,
    })
    if (!loop) setPlaying(false)
  }

  return (
    <div className="omr-actions">
      <div className="segmented" role="group" aria-label="示范声部">
        {([
          ['L', '左手'],
          ['R', '右手'],
          ['both', '双手'],
          ['other', '另一只手'],
        ] as const).map(([id, label]) => (
          <button key={id} type="button" aria-pressed={demoHand === id} onClick={() => setDemoHand(id)}>
            {label}
          </button>
        ))}
      </div>
      <button type="button" className="button ghost" disabled={disabled} onClick={() => void play()}>
        {playing ? '停止示范' : '示范播放'}
      </button>
    </div>
  )
}
