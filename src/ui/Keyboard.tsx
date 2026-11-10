import type { CSSProperties, PointerEvent } from 'react'
import type { PlayedEvent, ScoreNote } from '../judge/types'
import { keyLabel } from '../midi/keyboardMap'
import { noteName } from '../score/pitch'

const BLACK = new Set([1, 3, 6, 8, 10])

function isBlack(pitch: number): boolean {
  return BLACK.has(((pitch % 12) + 12) % 12)
}

export function keyboardBounds(notes: ScoreNote[]): { low: number; high: number } {
  let low = 48
  let high = 84
  for (const note of notes) {
    low = Math.min(low, note.pitch)
    high = Math.max(high, note.pitch)
  }
  low -= ((low % 12) + 12) % 12
  if (((high % 12) + 12) % 12 !== 0) high += 12 - (((high % 12) + 12) % 12)
  return { low, high }
}

interface KeyboardProps {
  low: number
  high: number
  pressed: ReadonlySet<number>
  flashes: Readonly<Record<number, 'hit' | 'wrong' | 'miss' | 'extra'>>
  targets: readonly number[]
  hints: readonly number[]
  /** Pitches currently sounding in listen mode, coloured by hand. */
  hands?: Readonly<Record<number, 'L' | 'R'>>
  onEvent: (event: PlayedEvent) => void
}

export function Keyboard({ low, high, pressed, flashes, targets, hints, hands = {}, onEvent }: KeyboardProps) {
  const pitches: number[] = []
  for (let pitch = low; pitch <= high; pitch += 1) pitches.push(pitch)
  const whites = pitches.filter((pitch) => !isBlack(pitch))
  const blacks = pitches.filter((pitch) => isBlack(pitch))
  const targetSet = new Set(targets)
  const hintSet = new Set(hints)

  const emit = (pitch: number, type: 'on' | 'off') => {
    onEvent({ pitch, velocity: type === 'on' ? 100 : 0, timeMs: performance.now(), type })
  }

  const press = (pitch: number, event: PointerEvent<HTMLButtonElement>) => {
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    emit(pitch, 'on')
  }
  const release = (pitch: number, event: PointerEvent<HTMLButtonElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    emit(pitch, 'off')
  }

  const classFor = (pitch: number, black: boolean) => {
    const names = [black ? 'key black' : 'key white']
    if (pressed.has(pitch)) names.push('is-down')
    if (hands[pitch] === 'R') names.push('is-hand-r')
    if (hands[pitch] === 'L') names.push('is-hand-l')
    if (targetSet.has(pitch)) names.push('is-target')
    else if (hintSet.has(pitch)) names.push('is-hint')
    const flash = flashes[pitch]
    if (flash) names.push(`flash-${flash}`)
    return names.join(' ')
  }

  return (
    <div className="keybed" style={{ '--white-count': whites.length } as CSSProperties}>
      <div className="white-row">
        {whites.map((pitch) => (
          <button
            key={pitch}
            type="button"
            className={classFor(pitch, false)}
            data-note={noteName(pitch)}
            aria-label={noteName(pitch)}
            onPointerDown={(event) => press(pitch, event)}
            onPointerUp={(event) => release(pitch, event)}
            onPointerCancel={(event) => release(pitch, event)}
          >
            <span className="key-name">{noteName(pitch)}</span>
            {keyLabel(pitch) && <kbd>{keyLabel(pitch)}</kbd>}
          </button>
        ))}
      </div>
      {blacks.map((pitch) => {
        const before = whites.indexOf(pitch - 1)
        const center = ((before + 1) / whites.length) * 100
        return (
          <button
            key={pitch}
            type="button"
            className={classFor(pitch, true)}
            data-note={noteName(pitch)}
            aria-label={noteName(pitch)}
            style={{ left: `${center}%` }}
            onPointerDown={(event) => press(pitch, event)}
            onPointerUp={(event) => release(pitch, event)}
            onPointerCancel={(event) => release(pitch, event)}
          >
            {keyLabel(pitch) && <kbd>{keyLabel(pitch)}</kbd>}
          </button>
        )
      })}
    </div>
  )
}
