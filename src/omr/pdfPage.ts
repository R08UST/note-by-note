/** Homr's published pages are about 300 dpi. A PDF point is 1/72 inch. */
export const PDF_RENDER_DPI = 300

export interface RenderedPage {
  index: number
  png: Blob
  thumbUrl: string
}

async function loadPdf() {
  const pdfjs = await import('pdfjs-dist')
  const worker = await import('pdfjs-dist/build/pdf.worker.min.mjs?url')
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default
  return pdfjs
}

function thumbFrom(canvas: HTMLCanvasElement): string {
  const scale = Math.min(1, 160 / canvas.width)
  const thumb = document.createElement('canvas')
  thumb.width = Math.max(1, Math.round(canvas.width * scale))
  thumb.height = Math.max(1, Math.round(canvas.height * scale))
  const context = thumb.getContext('2d')
  if (!context) return canvas.toDataURL('image/png')
  context.drawImage(canvas, 0, 0, thumb.width, thumb.height)
  return thumb.toDataURL('image/jpeg', 0.7)
}

async function toPng(canvas: HTMLCanvasElement): Promise<Blob> {
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'))
  if (!blob) throw new Error('无法把这一页存成图片。')
  return blob
}

/** Every page of a PDF, at the resolution homr is built for. */
export async function renderPdfPages(file: File): Promise<RenderedPage[]> {
  const pdfjs = await loadPdf()
  const data = new Uint8Array(await file.arrayBuffer())
  const doc = await pdfjs.getDocument({ data }).promise
  const pages: RenderedPage[] = []
  for (let index = 1; index <= doc.numPages; index += 1) {
    const page = await doc.getPage(index)
    const viewport = page.getViewport({ scale: PDF_RENDER_DPI / 72 })
    const canvas = document.createElement('canvas')
    canvas.width = Math.ceil(viewport.width)
    canvas.height = Math.ceil(viewport.height)
    const context = canvas.getContext('2d')
    if (!context) throw new Error('这个浏览器画不出 PDF 页面。')
    context.fillStyle = '#ffffff'
    context.fillRect(0, 0, canvas.width, canvas.height)
    await page.render({ canvas, canvasContext: context, viewport }).promise
    pages.push({ index, png: await toPng(canvas), thumbUrl: thumbFrom(canvas) })
  }
  return pages
}
