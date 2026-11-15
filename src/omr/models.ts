import manifest from './homr-models.json'

export interface HomrModelFile {
  sha256: string
  file: string
  backend: 'webgpu' | 'wasm' | 'both' | 'tab' | 'ocr'
  bytes: number
}

export const HOMR_MODELS = manifest.files as HomrModelFile[]

export const HOMR_CACHE = 'homr-models-v1'

export interface ModelChoice {
  /** Read the chord strips and the title, which needs the three RapidOCR files. */
  ocr: boolean
}

/**
 * Models this runtime should have on disk before a page is read.
 *
 * With OCR on that is every file: the chord and title text needs the three
 * RapidOCR files, and the tab guard needs the recogniser on any page it takes
 * for tablature. With it off they are left for the engine to open on its own
 * if it meets a tab, so the 32 MB is not fetched for a page that has none.
 */
export function modelsForBackend(
  backend: 'webgpu' | 'wasm' | 'wasm-threads',
  choice: ModelChoice = { ocr: true },
): HomrModelFile[] {
  const weights = backend === 'webgpu' ? 'webgpu' : 'wasm'
  return HOMR_MODELS.filter(
    (file) =>
      file.backend === weights || file.backend === 'both' || (choice.ocr && (file.backend === 'tab' || file.backend === 'ocr')),
  )
}

export function modelHref(file: HomrModelFile): string {
  return new URL(`models/homr/${file.sha256}/${file.file}`, document.baseURI).href
}

/**
 * The reason the page is slow, when homr fell back to one thread, or null
 * when it did not. homr names the fix itself; the tab says the same in Chinese.
 */
export function backendAdvice(backend: string, reason: string): string | null {
  if (backend !== 'wasm') return null
  if (!/no SharedArrayBuffer|not cross-origin isolated|single/i.test(reason)) return null
  return '这台浏览器没有让页面跨源隔离，WebAssembly 只能用单线程，识谱会慢很多。把页面放在带 COOP/COEP 头的地方打开（npm run dev 已经带了）就快得多。'
}

