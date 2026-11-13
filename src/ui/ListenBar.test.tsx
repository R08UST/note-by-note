import { act, createRef, type RefObject } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ScoreNote } from '../judge/types'

const calls = vi.hoisted(() => ({
  startDemo: [] as {
    startBeat: number
    endBeat: number
    loop: boolean
    notes: readonly { pitch: number }[]
  }[],
  stops: 0,
  lastOptions: null as null | { onEnded?: () => void },
}))

vi.mock('../audio/engine', () => ({
  startDemo: vi.fn(async (options: {
    startBeat: number
    endBeat: number
    loop: boolean
    notes: readonly { pitch: number }[]
    onEnded?: () => void
  }) => {
    calls.startDemo.push({
      startBeat: options.startBeat,
      endBeat: options.endBeat,
      loop: options.loop,
      notes: options.notes,
    })
    calls.lastOptions = { onEnded: options.onEnded }
  }),
  stopDemo: vi.fn(() => {
    calls.stops += 1
  }),
  pauseDemo: vi.fn(),
  resumeDemo: vi.fn(),
  setDemoTempo: vi.fn(),
}))

import { ListenBar, type ListenHandle } from './ListenBar'

// React only batches test updates through act when the environment says so.
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const notes: ScoreNote[] = [
  { id: 'a', pitch: 60, beat: 0, duration: 1, hand: 'R', measure: 1 },
  { id: 'b', pitch: 62, beat: 4, duration: 1, hand: 'R', measure: 2 },
  { id: 'c', pitch: 64, beat: 8, duration: 2, hand: 'R', measure: 3 },
]

describe('listen playback seek', () => {
  let root: Root
  let host: HTMLDivElement
  let handle: RefObject<ListenHandle | null>

  const render = (rangeEnd = 4, pieceId = 'piece-a', onNext?: () => void) => {
    act(() => {
      root.render(
        <ListenBar
          notes={notes}
          pieceId={pieceId}
          startBeat={0}
          rangeStart={0}
          rangeEnd={rangeEnd}
          bpm={72}
          onBpm={() => {}}
          showKeyboard={false}
          onBeat={() => {}}
          onPractice={() => {}}
          onNext={onNext}
          ref={handle}
        />,
      )
    })
  }

  /** Advance the shelf the way continuous play does when a piece ends. */
  const endPiece = () => {
    const engine = calls.lastOptions
    act(() => {
      engine?.onEnded?.()
    })
  }

  const toggleLoop = () => {
    const box = host.querySelector('input[type="checkbox"]')
    act(() => {
      box?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
  }

  const play = async () => {
    const button = [...host.querySelectorAll('button')].find((item) => item.textContent === '播放')
    await act(async () => {
      button?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      await Promise.resolve()
    })
  }

  beforeEach(() => {
    calls.startDemo = []
    calls.stops = 0
    calls.lastOptions = null
    handle = createRef<ListenHandle>()
    host = document.createElement('div')
    document.body.appendChild(host)
    root = createRoot(host)
  })

  afterEach(() => {
    act(() => root.unmount())
    host.remove()
  })

  it('starts where the cursor is', async () => {
    render()
    await play()
    expect(calls.startDemo).toHaveLength(1)
    expect(calls.startDemo[0].startBeat).toBe(0)
    expect(calls.startDemo[0].endBeat).toBe(10)
    expect(calls.startDemo[0].notes).toHaveLength(3)
  })

  it('jumps a running demo to the clicked beat and keeps playing', async () => {
    render()
    await play()
    expect(handle.current?.playing()).toBe(true)
    act(() => {
      expect(handle.current?.seek(8)).toBe(true)
    })
    await act(async () => {
      await Promise.resolve()
    })
    expect(calls.startDemo).toHaveLength(2)
    expect(calls.startDemo[1].startBeat).toBe(8)
    expect(calls.startDemo[1].endBeat).toBe(10)
    expect(calls.startDemo[1].loop).toBe(false)
    // Only the notes from the new position on are rescheduled.
    expect(calls.startDemo[1].notes.map((note) => note.pitch)).toEqual([64])
  })

  it('keeps looping when the click stays inside the selection', async () => {
    render(8)
    toggleLoop()
    await play()
    const looped = calls.startDemo[calls.startDemo.length - 1]
    expect(looped.loop).toBe(true)
    expect(looped.startBeat).toBe(0)
    expect(looped.endBeat).toBe(8)
    act(() => {
      expect(handle.current?.seek(4)).toBe(true)
    })
    await act(async () => {
      await Promise.resolve()
    })
    const jumped = calls.startDemo[calls.startDemo.length - 1]
    expect(jumped.startBeat).toBe(4)
    expect(jumped.endBeat).toBe(8)
    expect(jumped.loop).toBe(true)
  })

  it('does nothing when no demo is playing', () => {
    render()
    act(() => {
      expect(handle.current?.seek(4)).toBe(false)
    })
    expect(calls.startDemo).toHaveLength(0)
  })

  it('stays silent after the demo was stopped', async () => {
    render()
    await play()
    const stop = [...host.querySelectorAll('button')].find((item) => item.textContent === '停止')
    act(() => {
      stop?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(handle.current?.playing()).toBe(false)
    act(() => {
      expect(handle.current?.seek(4)).toBe(false)
    })
    expect(calls.startDemo).toHaveLength(1)
  })

  it('stops the old demo when the player opens a different piece', async () => {
    render(4, 'piece-a')
    await play()
    expect(handle.current?.playing()).toBe(true)
    render(4, 'piece-b')
    expect(calls.stops).toBe(1)
    expect(handle.current?.playing()).toBe(false)
    // The new piece must not start on its own.
    expect(calls.startDemo).toHaveLength(1)
  })

  it('plays the piece continuous play advanced to from its first note', async () => {
    let advanced = 0
    const renderWithNext = () => render(4, 'piece-a', () => {
      advanced += 1
    })
    renderWithNext()
    await play()
    // Continuous play is off, so ending the piece offers practice instead of advancing.
    endPiece()
    expect(advanced).toBe(0)

    const continuous = [...host.querySelectorAll('label.check')].find(
      (item) => item.textContent === '连续播放',
    )?.querySelector('input')
    act(() => {
      continuous?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    await play()
    endPiece()
    expect(advanced).toBe(1)

    // The shelf swaps in a piece that starts at beat 4, not at 0.
    act(() => {
      root.render(
        <ListenBar
          notes={[
            { id: 'd', pitch: 67, beat: 4, duration: 1, hand: 'R', measure: 1 },
            { id: 'e', pitch: 69, beat: 8, duration: 1, hand: 'R', measure: 2 },
          ]}
          pieceId="piece-b"
          startBeat={4}
          rangeStart={4}
          rangeEnd={8}
          bpm={72}
          onBpm={() => {}}
          showKeyboard={false}
          onBeat={() => {}}
          onPractice={() => {}}
          ref={handle}
        />,
      )
    })
    await act(async () => {
      await Promise.resolve()
    })
    expect(calls.stops).toBe(0)
    const next = calls.startDemo[calls.startDemo.length - 1]
    expect(next.startBeat).toBe(4)
    expect(next.notes.map((note) => note.pitch)).toEqual([67, 69])
  })
})
