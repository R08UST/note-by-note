/** A rectangle as far as scrolling cares. */
interface Box {
  top: number
  bottom: number
  height: number
}

const EDGE = 8
/** Breathing room above the line being followed, so its marks do not hug the top. */
const GAP = 16

/**
 * How much of the frame's top edge is covered by bars that stick to it, such as the
 * score meta row. They stay pinned while the sheet scrolls, so a line scrolled to the
 * top of the frame would be hidden underneath them.
 */
export function stickyTopInset(frame: HTMLElement, view: Box): number {
  let inset = 0
  for (const child of Array.from(frame.children)) {
    if (!(child instanceof HTMLElement)) continue
    const position = getComputedStyle(child).position
    if (position !== 'sticky' && position !== 'fixed') continue
    const box = child.getBoundingClientRect()
    // A bar that has not reached the top yet does not cover anything.
    if (box.height <= 0 || box.top > view.top + 4) continue
    inset = Math.max(inset, box.bottom - view.top)
  }
  return inset
}

/** The nearest ancestor that actually scrolls the sheet vertically. */
function scrollParent(element: HTMLElement | null): HTMLElement | null {
  for (let frame = element?.parentElement ?? null; frame; frame = frame.parentElement) {
    const style = getComputedStyle(frame)
    if (/(auto|scroll)/.test(style.overflowY) && frame.scrollHeight > frame.clientHeight + 8) return frame
  }
  return null
}

/**
 * The whole system the cursor stands in: every staff of that line, plus the marks printed
 * above and below it (fingering, dynamics, slurs, ledger lines). OSMD's cursor element
 * only spans the staves themselves, so following it alone cuts those marks off.
 *
 * Systems are drawn as groups named `osmd-staffline<system>-<staff>`; grouping them by the
 * system index recovers the full line without relying on OSMD internals.
 */
export function systemBox(cursor: HTMLElement): Box | null {
  const box = cursor.getBoundingClientRect()
  const root = cursor.closest('.score-host') ?? cursor.ownerDocument.body
  let top = Number.POSITIVE_INFINITY
  let bottom = Number.NEGATIVE_INFINITY
  const bySystem = new Map<string, { top: number; bottom: number }>()
  for (const group of Array.from(root.querySelectorAll<SVGGElement>('[id^="osmd-staffline"]'))) {
    const match = /^osmd-staffline(\d+)-/.exec(group.id)
    if (!match) continue
    const rect = group.getBoundingClientRect()
    if (rect.height <= 0) continue
    const current = bySystem.get(match[1]) ?? { top: Number.POSITIVE_INFINITY, bottom: Number.NEGATIVE_INFINITY }
    current.top = Math.min(current.top, rect.top)
    current.bottom = Math.max(current.bottom, rect.bottom)
    bySystem.set(match[1], current)
  }
  // The line being followed is the one that overlaps the cursor the most.
  let overlapBest = 0
  for (const line of bySystem.values()) {
    const overlap = Math.min(line.bottom, box.bottom) - Math.max(line.top, box.top)
    if (overlap > overlapBest) {
      overlapBest = overlap
      top = line.top
      bottom = line.bottom
    }
  }
  if (top === Number.POSITIVE_INFINITY) return null
  return { top, bottom, height: bottom - top }
}

/**
 * Scroll the sheet so the line being played sits fully inside the frame. A line change jumps
 * the cursor to the next system, which lands below the visible area; the frame follows it,
 * keeping clear of the sticky bars.
 */
export function scrollCursorIntoView(cursor: HTMLElement): void {
  const frame = scrollParent(cursor)
  if (!frame) return
  const view = frame.getBoundingClientRect()
  const line = systemBox(cursor) ?? cursor.getBoundingClientRect()
  const top = view.top + stickyTopInset(frame, view)
  const bottom = view.bottom - EDGE
  // The line is already readable, so a note inside it must not drag the sheet around.
  if (line.top >= top + EDGE && line.bottom <= bottom) return
  const free = bottom - top
  // A line taller than the space available shows its top: the marks above the staves are
  // the ones a player reads first, and centring would cut them off.
  const gap = line.height + GAP > free ? 0 : GAP
  frame.scrollTop = Math.max(0, frame.scrollTop + line.top - top - gap)
}
