import { describe, expect, it } from 'vitest'
import { scrollCursorIntoView, stickyTopInset, systemBox } from './scoreScroll'

function rect(top: number, height: number) {
  return {
    top,
    bottom: top + height,
    height,
    left: 0,
    right: 100,
    width: 100,
    x: 0,
    y: top,
    toJSON: () => ({}),
  } as DOMRect
}

function stub(element: HTMLElement, top: number, height: number) {
  element.getBoundingClientRect = () => rect(top, height)
  return element
}

interface FrameOptions {
  scrollTop?: number
  /** Height of the sticky meta bar, or 0 for a frame without one. */
  meta?: number
  /** Where the meta bar currently sits, in viewport coordinates. */
  metaTop?: number
}

function build(options: FrameOptions = {}) {
  const frame = document.createElement('div')
  frame.style.overflowY = 'auto'
  Object.defineProperty(frame, 'scrollHeight', { configurable: true, value: 4000 })
  Object.defineProperty(frame, 'clientHeight', { configurable: true, value: 400 })
  frame.scrollTop = options.scrollTop ?? 0
  stub(frame, 0, 400)
  if (options.meta) {
    const meta = document.createElement('div')
    meta.style.position = 'sticky'
    meta.style.top = '0'
    stub(meta, options.metaTop ?? 0, options.meta)
    frame.appendChild(meta)
  }
  const host = document.createElement('div')
  host.className = 'score-host'
  const cursor = document.createElement('img')
  host.appendChild(cursor)
  frame.appendChild(host)
  document.body.appendChild(frame)
  return { frame, host, cursor }
}

/** A drawn system: two staves plus the marks above and below them. */
function staffline(host: HTMLElement, system: number, staff: number, top: number, height: number) {
  const group = document.createElementNS('http://www.w3.org/2000/svg', 'g')
  group.id = `osmd-staffline${system}-${staff}`
  stub(group as unknown as HTMLElement, top, height)
  host.appendChild(group)
  return group
}

describe('score scroll', () => {
  it('leaves a line that is already readable where it is', () => {
    const { frame, cursor } = build({ scrollTop: 300, meta: 30 })
    stub(cursor, 120, 60)
    scrollCursorIntoView(cursor)
    expect(frame.scrollTop).toBe(300)
  })

  it('follows a line change to the next system, keeping it clear of the sticky meta bar', () => {
    const { frame, cursor } = build({ scrollTop: 100, meta: 30 })
    stub(cursor, 500, 60)
    scrollCursorIntoView(cursor)
    // Viewport top 0, meta 30 tall, so the line starts at 30 + 16 = 46.
    expect(frame.scrollTop).toBe(100 + 500 - 46)
  })

  it('pulls a line out from under the meta bar instead of pinning it to the frame edge', () => {
    const { frame, cursor } = build({ scrollTop: 300, meta: 30 })
    stub(cursor, 10, 60)
    scrollCursorIntoView(cursor)
    expect(frame.scrollTop).toBe(300 + 10 - 46)
  })

  it('shows the top of a line too tall for the free space, without the gap', () => {
    const { frame, cursor } = build({ scrollTop: 100, meta: 30 })
    stub(cursor, 500, 380)
    scrollCursorIntoView(cursor)
    expect(frame.scrollTop).toBe(100 + 500 - 30)
  })

  it('does not scroll past the start of the sheet', () => {
    const { frame, cursor } = build({ scrollTop: 4, meta: 30 })
    stub(cursor, 10, 60)
    scrollCursorIntoView(cursor)
    expect(frame.scrollTop).toBe(0)
  })

  it('ignores a bar that has not reached the top of the frame yet', () => {
    const { frame } = build({ meta: 30, metaTop: 120 })
    expect(stickyTopInset(frame, rect(0, 400))).toBe(0)
  })

  it('measures only bars that stick to the top', () => {
    const { frame } = build({ meta: 30 })
    const plain = document.createElement('div')
    stub(plain, 0, 80)
    frame.insertBefore(plain, frame.firstChild)
    expect(stickyTopInset(frame, rect(0, 400))).toBe(30)
  })

  it('does nothing when the sheet does not scroll', () => {
    const frame = document.createElement('div')
    frame.style.overflowY = 'auto'
    const host = document.createElement('div')
    host.className = 'score-host'
    const cursor = document.createElement('img')
    host.appendChild(cursor)
    frame.appendChild(host)
    document.body.appendChild(frame)
    stub(frame, 0, 400)
    stub(cursor, 900, 60)
    scrollCursorIntoView(cursor)
    expect(frame.scrollTop).toBe(0)
  })

  it('covers the marks above and below the staves, not just the cursor element', () => {
    const { host, cursor } = build()
    staffline(host, 0, 0, 186, 224)
    staffline(host, 0, 1, 249, 311)
    staffline(host, 1, 0, 620, 172)
    // The cursor spans only the staves, so fingering and dynamics sit outside it.
    stub(cursor, 284, 215)
    expect(systemBox(cursor)).toEqual({ top: 186, bottom: 560, height: 374 })
  })

  it('scrolls to the top of the whole line so the marks above the staves stay visible', () => {
    const { frame, host, cursor } = build({ scrollTop: 400, meta: 30 })
    staffline(host, 0, 0, 186, 224)
    staffline(host, 0, 1, 249, 311)
    stub(cursor, 284, 215)
    scrollCursorIntoView(cursor)
    // The line is taller than the free space, so its top goes just below the meta bar.
    expect(frame.scrollTop).toBe(400 + 186 - 30)
  })

  it('picks the system the cursor actually stands in', () => {
    const { host, cursor } = build()
    staffline(host, 0, 0, 100, 200)
    staffline(host, 0, 1, 160, 200)
    staffline(host, 1, 0, 500, 200)
    staffline(host, 1, 1, 560, 200)
    stub(cursor, 520, 180)
    expect(systemBox(cursor)).toEqual({ top: 500, bottom: 760, height: 260 })
  })

  it('falls back to the cursor when no systems are drawn', () => {
    const { cursor } = build()
    stub(cursor, 300, 120)
    expect(systemBox(cursor)).toBeNull()
  })
})
