/**
 * A page as pixels, and the two things done to it before homr reads it: make
 * it big enough, and make a thumbnail of it.
 *
 * The enlargement is a nearest-neighbour copy rather than a canvas filter, so
 * the amount is exact at any fraction and no new ringing joins the page: a
 * photograph that is too small for homr is made bigger, not sharpened.
 */
import type { PixelBytes } from './pageGeometry'

export interface RasterImage {
  /** RGBA, four bytes per pixel, row by row. */
  data: PixelBytes
  height: number
  width: number
}

/** The same page with every pixel drawn `scale` times as wide and as tall. */
export function drawEnlarged(page: RasterImage, scale: number): RasterImage {
  if (scale === 1) return page
  const width = Math.max(1, Math.round(page.width * scale))
  const height = Math.max(1, Math.round(page.height * scale))
  const out = new Uint8ClampedArray(width * height * 4)
  for (let y = 0; y < height; y += 1) {
    const sourceY = Math.min(page.height - 1, Math.floor(y / scale))
    for (let x = 0; x < width; x += 1) {
      const sourceX = Math.min(page.width - 1, Math.floor(x / scale))
      const from = (sourceY * page.width + sourceX) * 4
      const to = (y * width + x) * 4
      out[to] = page.data[from] ?? 255
      out[to + 1] = page.data[from + 1] ?? 255
      out[to + 2] = page.data[from + 2] ?? 255
      out[to + 3] = 255
    }
  }
  return { data: out, height, width }
}

function canvasOf(page: RasterImage): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = page.width
  canvas.height = page.height
  const context = canvas.getContext('2d')
  if (!context) throw new Error('这个浏览器画不出画布。')
  context.putImageData(new ImageData(page.data, page.width, page.height), 0, 0)
  return canvas
}

/** A page as a PNG Blob. */
export async function toPng(page: RasterImage): Promise<Blob> {
  const canvas = canvasOf(page)
  const png = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'))
  if (!png) throw new Error('无法把这一页存成图片。')
  return png
}

/** A thumbnail of a page whose longest side is `longest` px. Empty when the browser cannot draw one. */
export function thumbUrlOf(page: RasterImage, longest: number): string {
  const scale = Math.min(1, longest / Math.max(page.width, page.height))
  const width = Math.max(1, Math.round(page.width * scale))
  const height = Math.max(1, Math.round(page.height * scale))
  const thumb = document.createElement('canvas')
  thumb.width = width
  thumb.height = height
  const context = thumb.getContext('2d')
  if (!context) return ''
  context.drawImage(canvasOf(page), 0, 0, width, height)
  return thumb.toDataURL('image/jpeg', 0.7)
}
