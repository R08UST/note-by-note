/**
 * A PDF as pixels homr can read.
 *
 * Every page is rendered at the width homr's own resize step takes a page to
 * (1920 px), not at a fixed dpi: a 300 dpi A4 page is 2480 px wide and homr
 * shrinks it to 1920 before segmentation, so those extra pixels were thrown
 * away again and only cost time. At 1920 the page the model sees is the page
 * the browser drew.
 */
import type { PixelBytes } from './pageGeometry'
import type { RasterImage } from './pageImage'
import { pdfRenderScale } from './pageGeometry'

/** A4 width in points. A PDF whose pages do not report a width is laid out as A4. */
const A4_WIDTH_POINTS = 595

export interface RenderedPage {
  image: RasterImage
  png: Blob
}

export interface PdfDocument {
  dispose: () => Promise<void>
  /** Drop a page's render once it has been read, so a long PDF does not keep every page in memory. */
  release: (pageIndex: number) => void
  /** The rendered size of each page, which bands are cut from. */
  sizeOf: (pageIndex: number) => Promise<{ height: number; width: number }>
  readonly pageCount: number
  /** A whole page as pixels and as a PNG. */
  render: (pageIndex: number) => Promise<RenderedPage>
}

async function loadPdf() {
  const pdfjs = await import('pdfjs-dist')
  const worker = await import('pdfjs-dist/build/pdf.worker.min.mjs?url')
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default
  return pdfjs
}

async function toPng(canvas: HTMLCanvasElement): Promise<Blob> {
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'))
  if (!blob) throw new Error('无法把这一页存成图片。')
  return blob
}

function rasterOf(context: CanvasRenderingContext2D, width: number, height: number): RasterImage {
  const { data } = context.getImageData(0, 0, width, height)
  return { data: data as PixelBytes, height, width }
}

/** Open a PDF. Each page is rendered on first use and kept, so a band and the whole page share one render. */
export async function openPdf(file: File): Promise<PdfDocument> {
  const pdfjs = await loadPdf()
  const data = new Uint8Array(await file.arrayBuffer())
  const doc = await pdfjs.getDocument({ data }).promise
  const canvases = new Map<number, HTMLCanvasElement>()

  const renderPage = async (pageIndex: number) => {
    const known = canvases.get(pageIndex)
    if (known) return known
    const page = await doc.getPage(pageIndex)
    const base = page.getViewport({ scale: 1 })
    const viewport = page.getViewport({ scale: pdfRenderScale(base.width || A4_WIDTH_POINTS) })
    const canvas = document.createElement('canvas')
    canvas.width = Math.ceil(viewport.width)
    canvas.height = Math.ceil(viewport.height)
    const context = canvas.getContext('2d')
    if (!context) throw new Error('这个浏览器画不出 PDF 页面。')
    context.fillStyle = '#ffffff'
    context.fillRect(0, 0, canvas.width, canvas.height)
    await page.render({ canvas, canvasContext: context, viewport }).promise
    canvases.set(pageIndex, canvas)
    return canvas
  }

  return {
    get pageCount() {
      return doc.numPages
    },
    release: (pageIndex: number) => {
      const canvas = canvases.get(pageIndex)
      if (!canvas) return
      canvas.width = 0
      canvas.height = 0
      canvases.delete(pageIndex)
    },
    sizeOf: async (pageIndex: number) => {
      const canvas = await renderPage(pageIndex)
      return { height: canvas.height, width: canvas.width }
    },
    render: async (pageIndex: number) => {
      const canvas = await renderPage(pageIndex)
      const context = canvas.getContext('2d')
      if (!context) throw new Error('这个浏览器画不出 PDF 页面。')
      return { image: rasterOf(context, canvas.width, canvas.height), png: await toPng(canvas) }
    },
    dispose: async () => {
      canvases.clear()
      await doc.cleanup()
    },
  }
}

/** A URL for a page's thumbnail: the page as the picker shows it. */
export async function pdfThumbUrl(doc: PdfDocument, pageIndex: number): Promise<string> {
  const { png } = await doc.render(pageIndex)
  return URL.createObjectURL(png)
}
