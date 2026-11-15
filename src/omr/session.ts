/**
 * One recognition session: the models on disk, a recognizer started for this
 * page tab, and the step from a file to MusicXML.
 *
 * The tab and the import panel both read files through here rather than each
 * keeping its own copy of the model download, the backend choice and the page
 * loop, so a fix in one shows up in both.
 */
import type { Recognizer } from 'homr-web'
import type { PixelBytes } from './pageGeometry'
import type { RasterImage } from './pageImage'
import { ensureModelWorker, prepareModels } from './cacheModels'
import { mergeMusicXml } from './mergeMusicXml'
import { modelsForBackend, type ModelChoice } from './models'
import { openPdf } from './pdfPage'
import { pdfRenderScale } from './pageGeometry'
import { readPage, type PageReading } from './readPage'
import { repairVoiceTiming } from './repairVoiceTiming'
import { writeTextsIntoMusicXml } from './textMarks'

export interface ModelTimings {
  backend: string
  backendReason: string
  cacheHit: boolean
  downloadMs: number
  initMs: number
  threads: number
}

export interface Session {
  dispose: () => Promise<void>
  recognizer: Recognizer
  timings: ModelTimings
}

export async function hasFp16WebGpu(): Promise<boolean> {
  const gpu = navigator.gpu
  if (!gpu) return false
  try {
    const adapter = await gpu.requestAdapter()
    return adapter?.features.has('shader-f16') ?? false
  } catch {
    return false
  }
}

/**
 * The backend this browser can give homr.
 *
 * WebGPU needs fp16 shaders; without them the fp32 WebAssembly build is no
 * slower and does not need the fp16 weights. WebAssembly threads need
 * SharedArrayBuffer, which only a cross-origin isolated page has, and the app
 * serves COOP and COEP for exactly that.
 */
export async function chooseBackend(): Promise<'webgpu' | 'wasm-threads' | 'wasm'> {
  if (await hasFp16WebGpu()) return 'webgpu'
  return crossOriginIsolated ? 'wasm-threads' : 'wasm'
}

/** Download what this backend needs and start a recognizer over it. */
export async function openSession(
  choice: ModelChoice,
  onDownload?: (loaded: number, total: number) => void,
  signal?: AbortSignal,
): Promise<Session> {
  signal?.throwIfAborted()
  await ensureModelWorker()
  const prefer = await chooseBackend()
  const files = modelsForBackend(prefer, choice)
  let download = await prepareModels(files, (loaded, total) => onDownload?.(loaded, total))
  signal?.throwIfAborted()
  const { createRecognizer } = await import('homr-web')
  const started = performance.now()
  const recognizer = await createRecognizer({ baseUrl: new URL('models/homr/', document.baseURI), prefer })
  const initMs = Math.round(performance.now() - started)
  if (recognizer.backend !== prefer) {
    // The Worker stepped down to WebAssembly and opens its own pair; fetch it
    // here so the first page does not answer with a missing model.
    const extra = modelsForBackend(recognizer.backend, choice).filter(
      (file) => !files.some((have) => have.sha256 === file.sha256),
    )
    if (extra.length > 0) {
      const more = await prepareModels(extra, (loaded, total) => onDownload?.(loaded, total))
      download = { cacheHit: download.cacheHit && more.cacheHit, downloadMs: download.downloadMs + more.downloadMs }
    }
  }
  return {
    dispose: () => recognizer.dispose(),
    recognizer,
    timings: {
      backend: recognizer.backend,
      backendReason: recognizer.backendReason,
      cacheHit: download.cacheHit,
      downloadMs: download.downloadMs,
      initMs,
      threads: recognizer.numThreads,
    },
  }
}

/** A picture the browser can decode, as the RGBA pixels the reader takes. */
export async function imageOf(blob: Blob): Promise<RasterImage> {
  const bitmap = await createImageBitmap(blob)
  try {
    const canvas = document.createElement('canvas')
    canvas.width = bitmap.width
    canvas.height = bitmap.height
    const context = canvas.getContext('2d')
    if (!context) throw new Error('这个浏览器解不开这张图片。')
    context.drawImage(bitmap, 0, 0)
    const { data } = context.getImageData(0, 0, bitmap.width, bitmap.height)
    return { data: data as PixelBytes, height: bitmap.height, width: bitmap.width }
  } finally {
    bitmap.close()
  }
}

/**
 * What to tell a musician about a PDF's size. homr reads at 1920 px wide, so a
 * page narrower than that is drawn smaller than homr would like, and saying so
 * keeps that from looking like a poor reading.
 */
export function layoutNoteForPdf(pageWidthPoints: number): string | null {
  if (pdfRenderScale(pageWidthPoints) < 0.95) return '这份 PDF 的页面比 homr 习惯的窄，渲染出来的音会比印刷的小一些。'
  return null
}

function countParts(xml: string): number {
  const doc = new DOMParser().parseFromString(xml, 'application/xml')
  return [...doc.documentElement.children].filter((child) => child.localName === 'part').length
}

function withLetters(reading: Extract<PageReading, { ok: true }>): string {
  if (reading.texts.length === 0) return reading.musicXml
  return writeTextsIntoMusicXml(reading.musicXml, reading.texts, countParts(reading.musicXml))
}

export interface FileProgress {
  done: number
  page: number
  pages: number
  stage: string
}

export interface FileResult {
  /** Pages that could not be read, each with the reason. */
  failed: string[]
  musicXml: string
  pages: number
}

/**
 * Read every page of a file in order and join them into one score.
 * A page that cannot be read is named in `failed`, and the rest are still used.
 */
export async function readFile(
  recognizer: Recognizer,
  file: File,
  options: {
    ocr: boolean
    onProgress?: (progress: FileProgress) => void
    signal?: AbortSignal
  },
): Promise<FileResult> {
  const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')
  const results: { label: string; xml: string }[] = []
  const failed: string[] = []

  const readOne = async (label: string, image: RasterImage, page: number, pages: number) => {
    const reading = await readPage(recognizer, image, {
      ocr: options.ocr,
      onProgress: (progress) => options.onProgress?.({ done: progress.done, page, pages, stage: progress.stage }),
      signal: options.signal,
    })
    if (!reading.ok) {
      failed.push(`${label}：${reading.error}`)
      return
    }
    results.push({ label, xml: withLetters(reading) })
  }

  if (isPdf) {
    const doc = await openPdf(file)
    try {
      for (let index = 1; index <= doc.pageCount; index += 1) {
        options.signal?.throwIfAborted()
        const { image } = await doc.render(index)
        await readOne(`${file.name} 第 ${index} 页`, image, index, doc.pageCount)
        doc.release(index)
      }
    } finally {
      await doc.dispose()
    }
  } else {
    await readOne(file.name, await imageOf(file), 1, 1)
  }

  if (results.length === 0) throw new Error(failed[0] ?? '没有一页识别成功。')
  const merged = results.length === 1 ? (results[0]?.xml ?? '') : mergeMusicXml(results)
  return {
    failed,
    // homr sometimes drops a <backup> between the hands; re-timing each voice puts those bars back.
    // It runs after merging because homr writes the time signature only on the page that prints it.
    musicXml: repairVoiceTiming(merged).xml,
    pages: results.length,
  }
}
