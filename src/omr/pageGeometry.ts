/**
 * The numbers the 识谱 tab reads a page with: the width a PDF is rendered at,
 * which rows of a page hold each staff system, and how big a staff is.
 *
 * homr resamples whatever page it is given to 1920 px wide before its
 * segmentation model sees it. Rendering a PDF at 300 dpi and letting homr
 * shrink the result throws away the detail the model would have used; the page
 * is rendered at that width instead.
 */

/** homr's resize.py takes the autocropped page to this width before segmentation. */
export const HOMR_TARGET_WIDTH = 1920

/** A4 is 595 points wide; a PDF whose pages do not say their width is laid out as one. */
const A4_WIDTH_POINTS = 595

/**
 * How much wider the gap from one system to the next must be than the gap
 * inside a grand staff, before the page is taken to have systems of two.
 */
const BRACE_GAP_RATIO = 1.25

/** The bytes ImageData takes: an array of its own, not a view over a larger buffer. */
export type PixelBytes = Uint8ClampedArray<ArrayBuffer>

export interface PageSize {
  height: number
  width: number
}

export interface StaffBoxLike {
  cx: number
  cy: number
  h: number
  index: number
  w: number
}

export interface PageCropLike {
  x0: number
  x1: number
  y0: number
  y1: number
}

/** The rows one staff system occupies on a page, in pixels. */
export interface Rows {
  bottom: number
  top: number
}

/**
 * The render scale that lands a PDF page at homr's 1920 px in one step.
 * Rendering at 300 dpi and letting homr shrink it throws away the detail the
 * segmentation model would have used, and costs the time to produce those
 * pixels and the time to shrink them.
 */
export function pdfRenderScale(pageWidthPoints: number): number {
  const width = Number.isFinite(pageWidthPoints) && pageWidthPoints > 0 ? pageWidthPoints : A4_WIDTH_POINTS
  return HOMR_TARGET_WIDTH / width
}

/**
 * The staff unit a page draws at: a five-line staff's height is four units.
 * The geometric mean, so one odd staff among many cannot pull the answer.
 */
export function staffUnitOf(staves: readonly StaffBoxLike[], crop: PageCropLike, page: PageSize): number {
  const heights = staves
    .map((staff) => staff.h * (crop.y1 - crop.y0) * page.height)
    .filter((height) => height > 0 && Number.isFinite(height))
  if (heights.length === 0) return 0
  const product = heights.reduce((total, height) => total * height, 1)
  return Math.pow(product, 1 / heights.length) / 4
}

function relativeDifference(left: number, right: number): number {
  const scale = Math.max(Math.abs(left), Math.abs(right), 1e-6)
  return Math.abs(left - right) / scale
}

interface Box {
  bottom: number
  top: number
  w: number
}

/** homr's staff boxes as rows of the page in pixels. */
export function pageBoxes(staves: readonly StaffBoxLike[], crop: PageCropLike, page: PageSize): Box[] {
  const cropHeight = crop.y1 - crop.y0
  const cropWidth = crop.x1 - crop.x0
  return [...staves]
    .sort((left, right) => left.index - right.index)
    .map((staff) => ({
      bottom: (crop.y0 + (staff.cy + staff.h / 2) * cropHeight) * page.height,
      top: (crop.y0 + (staff.cy - staff.h / 2) * cropHeight) * page.height,
      w: staff.w * cropWidth * page.width,
    }))
}

/**
 * The rows of each staff system, top to bottom.
 *
 * A page draws a piano's two staves as one system: the gap between them is
 * narrower than the gap from the system to the next one. No single pair says
 * which it is on its own, so the gaps decide together: a staff joins the one
 * below it only across a gap narrower than BRACE_GAP_RATIO times the
 * narrowest gap on the page, which is a brace's.
 */
export function systemRows(staves: readonly StaffBoxLike[], crop: PageCropLike, page: PageSize): Rows[] {
  const boxes = pageBoxes(staves, crop, page)
  const gaps: number[] = []
  for (let index = 0; index + 1 < boxes.length; index += 1) {
    const above = boxes[index]
    const below = boxes[index + 1]
    if (above && below) gaps.push(below.top - above.bottom)
  }
  const brace = narrowestGapOf(gaps)
  const rows: Rows[] = []
  for (let index = 0; index < boxes.length; index += 1) {
    const above = boxes[index]
    const below = boxes[index + 1]
    if (!above) continue
    const joins = below !== undefined && brace > 0 && below.top - above.bottom < brace && relativeDifference(above.w, below.w) < 0.35
    if (below && joins) {
      rows.push({ bottom: below.bottom, top: above.top })
      index += 1
    } else {
      rows.push({ bottom: above.bottom, top: above.top })
    }
  }
  return rows
}

/**
 * The gap below which two staves are one grand staff, or 0 when the page has
 * no such gap. The narrowest gap on the page is taken as a brace's; when every
 * gap is wider than BRACE_GAP_RATIO times it, the staffs are on different
 * systems and nothing is joined.
 */
function narrowestGapOf(gaps: readonly number[]): number {
  const usable = gaps.filter((gap) => gap > 0 && Number.isFinite(gap))
  if (usable.length === 0) return 0
  const narrowest = Math.min(...usable)
  const widest = Math.max(...usable)
  if (widest <= narrowest * 1.05) return 0
  return widest > narrowest * BRACE_GAP_RATIO ? narrowest * BRACE_GAP_RATIO : 0
}
