import manifest from './homr-models.json'

export interface HomrModelFile {
  sha256: string
  file: string
  backend: 'webgpu' | 'wasm' | 'both' | 'tab' | 'ocr'
  bytes: number
}

export const HOMR_MODELS = manifest.files as HomrModelFile[]

export const HOMR_CACHE = 'homr-models-v1'

/**
 * Models this runtime should have on disk before a page is read.
 * The PP-OCRv6 recogniser is included on every backend: ocr:false skips chord
 * and title text, but the tab guard still opens that one file when a five-line
 * staff has marks it wants to check. The detector and classifier sit beside it
 * so a page that really is tablature does not 404 either.
 */
export function modelsForBackend(backend: 'webgpu' | 'wasm' | 'wasm-threads'): HomrModelFile[] {
  const weights = backend === 'webgpu' ? 'webgpu' : 'wasm'
  return HOMR_MODELS.filter(
    (file) =>
      file.backend === weights || file.backend === 'both' || file.backend === 'tab' || file.backend === 'ocr',
  )
}

export function modelHref(file: HomrModelFile): string {
  return new URL(`models/homr/${file.sha256}/${file.file}`, document.baseURI).href
}
