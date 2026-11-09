import manifest from './homr-models.json'

export interface HomrModelFile {
  sha256: string
  file: string
  backend: 'webgpu' | 'wasm' | 'both' | 'tab'
  bytes: number
}

export const HOMR_MODELS = manifest.files as HomrModelFile[]

export const HOMR_CACHE = 'homr-models-v1'

/** Models the chosen runtime will fetch. OCR weights are not in this list. */
export function modelsForBackend(backend: 'webgpu' | 'wasm' | 'wasm-threads'): HomrModelFile[] {
  const weights = backend === 'webgpu' ? 'webgpu' : 'wasm'
  return HOMR_MODELS.filter((file) => file.backend === weights || file.backend === 'both' || file.backend === 'tab')
}

export function modelHref(file: HomrModelFile): string {
  return new URL(`models/homr/${file.sha256}/${file.file}`, document.baseURI).href
}
