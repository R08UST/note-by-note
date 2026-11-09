import { HOMR_CACHE, modelHref, type HomrModelFile } from './models'

export async function ensureModelWorker(): Promise<void> {
  if (!('serviceWorker' in navigator)) return
  const script = new URL('sw-homr.js', document.baseURI)
  const scope = new URL('./', document.baseURI)
  await navigator.serviceWorker.register(script, { scope: scope.href })
  await navigator.serviceWorker.ready
  if (navigator.serviceWorker.controller) return
  await new Promise<void>((resolve) => {
    const timer = window.setTimeout(resolve, 1500)
    navigator.serviceWorker.addEventListener(
      'controllerchange',
      () => {
        window.clearTimeout(timer)
        resolve()
      },
      { once: true },
    )
  })
}

export async function prepareModels(
  files: HomrModelFile[],
  onProgress: (loaded: number, total: number) => void,
): Promise<{ cacheHit: boolean; downloadMs: number }> {
  const cache = await caches.open(HOMR_CACHE)
  const total = files.reduce((sum, file) => sum + file.bytes, 0)
  const present = await Promise.all(files.map(async (file) => (await cache.match(modelHref(file))) != null))
  if (present.every(Boolean)) {
    onProgress(total, total)
    return { cacheHit: true, downloadMs: 0 }
  }

  const started = performance.now()
  let loaded = 0
  for (let index = 0; index < files.length; index += 1) {
    const file = files[index]
    if (!file) continue
    const href = modelHref(file)
    if (present[index]) {
      loaded += file.bytes
      onProgress(loaded, total)
      continue
    }
    const response = await fetch(href)
    if (!response.ok || !response.body) {
      throw new Error(
        `Model file missing (${response.status}): ${file.file}. From the project directory run npm run fetch-models, then rebuild.`,
      )
    }
    const reader = response.body.getReader()
    const chunks: Uint8Array[] = []
    let received = 0
    while (true) {
      const step = await reader.read()
      if (step.done) break
      if (!step.value) continue
      chunks.push(step.value)
      received += step.value.byteLength
      onProgress(loaded + received, total)
    }
    const blob = new Blob(chunks.map((chunk) => chunk.slice().buffer), { type: 'application/octet-stream' })
    await cache.put(
      href,
      new Response(blob, {
        headers: {
          'Content-Type': 'application/octet-stream',
          'Content-Length': String(blob.size),
        },
      }),
    )
    loaded += blob.size
    onProgress(Math.min(loaded, total), total)
  }
  return { cacheHit: false, downloadMs: Math.round(performance.now() - started) }
}
