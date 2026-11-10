import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const tracker = vi.hoisted(() => ({ loads: 0, renders: 0 }))

vi.mock('opensheetmusicdisplay', () => {
  class OpenSheetMusicDisplay {
    FollowCursor = false
    Zoom = 1
    cursor = {
      CursorOptions: {} as { follow?: boolean },
      cursorElement: null,
      Iterator: { EndReached: true, currentTimeStamp: { RealValue: 0 } },
      reset() {},
      show() {},
      hide() {},
      next() {},
      GNotesUnderCursor() {
        return []
      },
    }
    GraphicSheet = { MeasureList: [] }
    load = vi.fn(async () => {
      tracker.loads += 1
    })
    render = vi.fn(() => {
      tracker.renders += 1
    })
    dispose = vi.fn()
  }
  return { OpenSheetMusicDisplay, CursorType: { ThinLeft: 'thin' } }
})

import { ScoreView } from './ScoreView'

describe('score view', () => {
  let root: Root
  let host: HTMLDivElement

  beforeEach(() => {
    tracker.loads = 0
    tracker.renders = 0
    Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get: () => 800 })
    host = document.createElement('div')
    document.body.appendChild(host)
    root = createRoot(host)
  })

  afterEach(() => {
    act(() => root.unmount())
    host.remove()
  })

  it('does not rebuild the sheet when the cursor span or the click handler changes', async () => {
    const notes = [{ id: 'a', pitch: 60, beat: 0, duration: 1, hand: 'R' as const, measure: 1 }]
    const draw = (startBeat: number) => {
      act(() => {
        root.render(
          <ScoreView
            xml="<score/>"
            notes={notes}
            span={{ startBeat, endBeat: 4 }}
            onReady={() => {}}
            onError={() => {}}
            onNote={() => {}}
          />,
        )
      })
    }
    draw(0)
    await act(async () => {
      await Promise.resolve()
    })
    expect(tracker.loads).toBe(1)
    expect(tracker.renders).toBe(1)
    draw(2)
    await act(async () => {
      await Promise.resolve()
    })
    expect(tracker.loads).toBe(1)
    expect(tracker.renders).toBe(1)
    expect(host.querySelector('[data-osmd-loads]')?.getAttribute('data-osmd-loads')).toBe('1')
  })
})
