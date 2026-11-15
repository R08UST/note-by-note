/**
 * Reading one page with homr.
 *
 * The page is handed over at the width homr reads at, and in the colour and
 * contrast homr was trained on. What this module adds on top of a bare
 * `recognizePage` is what that costs nothing to keep:
 *
 * - a page smaller than homr's 1920 px is enlarged to it, because homr would
 *   upscale it anyway and a hand-made upscale through the browser's smoothing
 *   does not carry the same ringing a cv2 bicubic produces;
 * - the staff boxes and the letters come back on the page the caller holds,
 *   whatever crop homr applied, so a thumbnail can show where each staff was
 *   found;
 * - a failure keeps homr's own code and log, so the tab can say what happened.
 *
 * Cutting a page into bands was measured and rejected: homr resamples every
 * input to 1920 px wide, so a band holding one system is read at exactly the
 * same line thickness as the whole page was, and the only thing banding adds
 * is the risk of losing a brace that spans two staves.
 */
import type { Recognizer, RecognizeResult, StaffBox } from 'homr-web'
import { drawEnlarged, type RasterImage } from './pageImage'
import { HOMR_TARGET_WIDTH } from './pageGeometry'
import type { PageSize } from './pageGeometry'

/** A page read on its own, at homr's width. */
export interface PageReading {
  musicXml: string
  ok: true
  /** How much the page was enlarged before it was read; 1 means not at all. */
  scale: number
  staffs: StaffBox[]
  texts: RecognizeResult['texts']
}

export interface PageFailure {
  error: string
  log: string
  ok: false
}

export interface ReadPageOptions {
  /** Read the chord strips and the title. Off leaves the letters out and skips the OCR models. */
  ocr: boolean
  onProgress?: (progress: { done: number; stage: string; total: number }) => void
  signal?: AbortSignal
}

/** How much a page is enlarged before homr reads it: enough to land at its 1920 px, and no more. */
export function pageEnlargement(page: PageSize): number {
  if (page.width <= 0 || page.width >= HOMR_TARGET_WIDTH) return 1
  return HOMR_TARGET_WIDTH / page.width
}

async function recognize(
  recognizer: Recognizer,
  image: RasterImage,
  options: ReadPageOptions,
): Promise<RecognizeResult> {
  return recognizer.recognizePage(new ImageData(image.data, image.width, image.height), {
    ocr: options.ocr,
    onProgress: (progress) => options.onProgress?.(progress),
    signal: options.signal,
  })
}

/**
 * Read one page.
 *
 * A page narrower than homr's 1920 px is enlarged to it first; anything wider
 * is passed as it is, because homr would shrink it and its own bicubic is the
 * one the model was trained with. A page that fails keeps homr's code.
 */
export async function readPage(
  recognizer: Recognizer,
  page: RasterImage,
  options: ReadPageOptions,
): Promise<PageReading | PageFailure> {
  const scale = pageEnlargement(page)
  const fed = scale === 1 ? page : drawEnlarged(page, scale)
  const result = await recognize(recognizer, fed, options)
  if (!result.ok) return { error: result.error, log: result.log, ok: false }
  return {
    musicXml: result.musicXml,
    ok: true,
    scale,
    staffs: [...result.staves],
    texts: result.texts,
  }
}
