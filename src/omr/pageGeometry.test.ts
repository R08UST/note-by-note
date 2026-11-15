import { describe, expect, it } from 'vitest'
import { pdfRenderScale, HOMR_TARGET_WIDTH, staffUnitOf, systemRows } from './pageGeometry'
import { pageEnlargement } from './readPage'

const WHOLE = { x0: 0, x1: 1, y0: 0, y1: 1 }
/** An A4 page rendered at homr's width: 1920 x 2716. */
const A4 = { height: 2716, width: 1920 }

describe('pdfRenderScale', () => {
  it('lands an A4 page at 1920 px, not the 2480 px a 300 dpi render gave', () => {
    const scale = pdfRenderScale(595)
    expect(Math.round(595 * scale)).toBe(HOMR_TARGET_WIDTH)
    expect(Math.round(595 * (300 / 72))).toBe(2479)
  })

  it('gives every page size the same read width', () => {
    expect(Math.round(842 * pdfRenderScale(842))).toBe(HOMR_TARGET_WIDTH)
    expect(Math.round(1190 * pdfRenderScale(1190))).toBe(HOMR_TARGET_WIDTH)
  })

  it('falls back to A4 for a page that does not say its width', () => {
    expect(pdfRenderScale(0)).toBe(pdfRenderScale(595))
    expect(pdfRenderScale(Number.NaN)).toBe(pdfRenderScale(595))
  })
})

describe('pageEnlargement', () => {
  it('leaves a page that is already homr’s width alone', () => {
    expect(pageEnlargement(A4)).toBe(1)
  })

  it('does not enlarge a page wider than homr reads, because homr would shrink it back', () => {
    expect(pageEnlargement({ height: 3508, width: 2480 })).toBe(1)
  })

  it('brings a small photograph up to the width homr reads at', () => {
    const scale = pageEnlargement({ height: 3000, width: 960 })
    expect(scale).toBe(2)
    expect(Math.round(960 * scale)).toBe(HOMR_TARGET_WIDTH)
  })
})

describe('staffUnitOf', () => {
  it('reads a staff unit as a quarter of a five-line staff’s height', () => {
    const staves = [
      { cx: 0.5, cy: 0.1, h: 48 / A4.height, index: 0, w: 0.86 },
      { cx: 0.5, cy: 0.3, h: 56 / A4.height, index: 1, w: 0.86 },
    ]
    expect(staffUnitOf(staves, WHOLE, A4)).toBeCloseTo(Math.sqrt(48 * 56) / 4, 6)
  })

  it('answers 0 for a page with no staff', () => {
    expect(staffUnitOf([], WHOLE, A4)).toBe(0)
  })
})

describe('systemRows', () => {
  const box = (top: number, index: number, height = 48) => ({
    cx: 0.5,
    cy: (top + height / 2) / A4.height,
    h: height / A4.height,
    index,
    w: 0.86,
  })

  it('joins the two staves of a grand staff across the narrow gap', () => {
    // Two systems, each a right-hand staff and a left-hand one 72 px below it,
    // and 232 px from one system to the next.
    const staves = [box(220, 0), box(220 + 48 + 72, 1), box(220 + 400, 2), box(220 + 400 + 48 + 72, 3)]
    const rows = systemRows(staves, WHOLE, A4)
    expect(rows).toHaveLength(2)
    expect(rows[0]?.top).toBeCloseTo(220, 6)
    expect(rows[0]?.bottom).toBeCloseTo(220 + 48 + 72 + 48, 6)
  })

  it('keeps a page of one staff per system apart', () => {
    // Two equal gaps and then a wider one: the narrow gap is read as a brace's,
    // so the first two staves are one system. A solo page whose gaps are all
    // equal is left alone.
    expect(systemRows([box(220, 0), box(700, 1), box(2000, 2)], WHOLE, A4)).toHaveLength(2)
    expect(systemRows([box(220, 0), box(700, 1), box(1180, 2)], WHOLE, A4)).toHaveLength(3)
  })

  it('maps a crop back onto the page, so paper cut out of a photograph still lines up', () => {
    const crop = { x0: 0.1, x1: 0.9, y0: 0.2, y1: 0.8 }
    const staves = [{ cx: 0.5, cy: 0.25, h: 0.05, index: 0, w: 0.8 }]
    const rows = systemRows(staves, crop, A4)
    expect(rows[0]?.top).toBeCloseTo((0.2 + (0.25 - 0.025) * 0.6) * A4.height, 3)
  })

  it('answers nothing for a page with no staff', () => {
    expect(systemRows([], WHOLE, A4)).toEqual([])
  })
})
