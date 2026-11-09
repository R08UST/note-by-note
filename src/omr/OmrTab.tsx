import { useMemo, useState } from 'react'
import { parseMusicXml } from '../score/parseMusicXml'
import { ScoreView } from '../ui/ScoreView'
import { ensureModelWorker, prepareModels } from './cacheModels'
import { modelsForBackend } from './models'
import { renderPdfFirstPage } from './pdfPage'

interface OmrTabProps {
  onPractice: (xml: string, title: string) => void
}

interface Timings {
  downloadMs: number | null
  initMs: number | null
  inferenceMs: number | null
  backend: string | null
  backendReason: string | null
  cacheHit: boolean | null
  threads: number | null
}

const emptyTimings = (): Timings => ({
  downloadMs: null,
  initMs: null,
  inferenceMs: null,
  backend: null,
  backendReason: null,
  cacheHit: null,
  threads: null,
})

export default function OmrTab({ onPractice }: OmrTabProps) {
  const [fileName, setFileName] = useState('')
  const [preview, setPreview] = useState<string | null>(null)
  const [page, setPage] = useState<Blob | null>(null)
  const [phase, setPhase] = useState('Waiting for an image.')
  const [download, setDownload] = useState({ loaded: 0, total: 0 })
  const [stage, setStage] = useState('')
  const [timings, setTimings] = useState<Timings>(emptyTimings)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [log, setLog] = useState('')
  const [xml, setXml] = useState<string | null>(null)

  const parsed = useMemo(() => {
    if (!xml) return null
    try {
      return parseMusicXml(xml)
    } catch (err) {
      return err instanceof Error ? err.message : 'Could not read the MusicXML.'
    }
  }, [xml])
  const notes = parsed && typeof parsed !== 'string' ? parsed.notes : []
  const title = parsed && typeof parsed !== 'string' ? parsed.title : 'Recognized score'

  const onFile = async (file: File | undefined) => {
    if (!file) return
    setError(null)
    setXml(null)
    setLog('')
    setFileName(file.name)
    const image = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')
      ? await renderPdfFirstPage(file).catch((err: unknown) => {
          setError(err instanceof Error ? err.message : 'Could not read that PDF.')
          return null
        })
      : file
    if (!image) return
    if (preview) URL.revokeObjectURL(preview)
    setPage(image)
    setPreview(URL.createObjectURL(image))
  }

  const run = async () => {
    if (!page) return
    setBusy(true)
    setError(null)
    setXml(null)
    setLog('')
    setTimings(emptyTimings())
    const startedDownload = performance.now()
    try {
      setPhase('Checking WebGPU…')
      const gpu = await hasWebGpu()
      const wanted = gpu ? 'webgpu' : 'wasm'
      setPhase(
        gpu
          ? 'Downloading WebGPU models…'
          : 'WebGPU cannot run these fp16 models here. Downloading the WebAssembly models…',
      )
      await ensureModelWorker()
      let files = modelsForBackend(wanted)
      const first = await prepareModels(files, (loaded, total) => setDownload({ loaded, total }))
      let downloadMs = first.downloadMs
      let cacheHit = first.cacheHit
      setTimings((prev) => ({ ...prev, downloadMs, cacheHit }))

      setPhase('Starting the recognizer…')
      const initStarted = performance.now()
      const { createRecognizer } = await import('homr-web')
      const recognizer = await createRecognizer({
        baseUrl: new URL('models/homr/', document.baseURI),
        prefer: gpu ? 'webgpu' : crossOriginIsolated ? 'wasm-threads' : 'wasm',
      })
      const initMs = Math.round(performance.now() - initStarted)
      if (recognizer.backend !== 'webgpu' && wanted === 'webgpu') {
        setPhase('WebGPU was not usable. Downloading the WebAssembly models…')
        const extra = modelsForBackend('wasm').filter((file) => !files.some((have) => have.sha256 === file.sha256))
        if (extra.length > 0) {
          const more = await prepareModels(extra, (loaded, total) => setDownload({ loaded, total }))
          downloadMs += more.downloadMs
          cacheHit = cacheHit && more.cacheHit
          files = [...files, ...extra]
        }
      }
      setTimings({
        downloadMs,
        initMs,
        inferenceMs: null,
        backend: recognizer.backend,
        backendReason: recognizer.backendReason,
        cacheHit,
        threads: recognizer.numThreads,
      })

      setPhase('Reading the page…')
      const inferStarted = performance.now()
      const result = await recognizer.recognizePage(page, {
        ocr: false,
        onProgress: (progress) => {
          setStage(`${progress.stage} ${progress.done}/${progress.total}`)
        },
      })
      const inferenceMs = Math.round(performance.now() - inferStarted)
      setTimings((prev) => ({ ...prev, inferenceMs }))
      await recognizer.dispose()
      setLog(result.log)
      if (!result.ok || !result.musicXml) {
        setPhase('The page was not read.')
        setError(`${result.error}. ${result.log}`.trim())
        return
      }
      setXml(result.musicXml)
      setPhase('MusicXML is ready.')
    } catch (err) {
      setPhase('Stopped.')
      setError(err instanceof Error ? err.message : 'Recognition failed.')
      setTimings((prev) => ({
        ...prev,
        downloadMs: prev.downloadMs ?? Math.round(performance.now() - startedDownload),
      }))
    } finally {
      setBusy(false)
    }
  }

  const downloadXml = () => {
    if (!xml) return
    const blob = new Blob([xml], { type: 'application/vnd.recordare.musicxml+xml' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `${fileName.replace(/\.[^.]+$/, '') || 'score'}.musicxml`
    link.click()
    URL.revokeObjectURL(url)
  }

  return (
    <section className="panel omr">
      <h2>识谱</h2>
      <p className="lede">Optical music recognition in this browser. No image leaves the machine.</p>
      <div className="omr-actions">
        <label className="button ghost file-label">
          Choose a page
          <input
            id="omr-file"
            type="file"
            accept="image/png,image/jpeg,.png,.jpg,.jpeg,application/pdf,.pdf"
            onChange={(event) => {
              void onFile(event.target.files?.[0])
              event.target.value = ''
            }}
          />
        </label>
        <button type="button" className="button primary" disabled={!page || busy} onClick={() => void run()}>
          {busy ? 'Reading…' : 'Read this page'}
        </button>
        {fileName && <span className="device-note">{fileName}</span>}
      </div>
      {preview && <img className="omr-preview" src={preview} alt="Page to recognize" />}
      <p className="phase">{phase}</p>
      {download.total > 0 && (
        <div className="meter" aria-label="Model download">
          <span
            className="meter-perfect"
            style={{ left: 0, width: `${Math.min(100, (download.loaded / download.total) * 100)}%` }}
          />
        </div>
      )}
      {stage && <p className="device-note">Engine stage: {stage}</p>}
      <dl className="timings">
        <div>
          <dt>Backend</dt>
          <dd>{timings.backend ?? '—'}</dd>
        </div>
        <div>
          <dt>Cache</dt>
          <dd>{timings.cacheHit == null ? '—' : timings.cacheHit ? 'hit' : 'downloaded'}</dd>
        </div>
        <div>
          <dt>Download</dt>
          <dd>{timings.downloadMs == null ? '—' : `${timings.downloadMs} ms`}</dd>
        </div>
        <div>
          <dt>Init</dt>
          <dd>{timings.initMs == null ? '—' : `${timings.initMs} ms`}</dd>
        </div>
        <div>
          <dt>Inference</dt>
          <dd>{timings.inferenceMs == null ? '—' : `${timings.inferenceMs} ms`}</dd>
        </div>
        <div>
          <dt>Threads</dt>
          <dd>{timings.threads ?? '—'}</dd>
        </div>
      </dl>
      {timings.backendReason && <p className="device-note">{timings.backendReason}</p>}
      {error && <p className="score-status error">{error}</p>}
      {xml && (
        <div className="omr-result">
          <div className="omr-actions">
            <button type="button" className="button ghost" onClick={downloadXml}>
              Download .musicxml
            </button>
            <button
              type="button"
              className="button primary"
              disabled={typeof parsed === 'string'}
              onClick={() => onPractice(xml, title)}
            >
              Practice this piece
            </button>
          </div>
          {typeof parsed === 'string' ? (
            <p className="score-status error">{parsed}</p>
          ) : (
            <div className="score-frame omr-score">
              <ScoreView xml={xml} notes={notes} onReady={() => {}} onError={() => {}} />
            </div>
          )}
        </div>
      )}
      {log && <pre className="omr-log">{log}</pre>}
      <footer className="omr-license">
        Recognition uses{' '}
        <a href="https://github.com/jymen/homr-web">homr-web</a> (AGPL-3.0), a browser port of{' '}
        <a href="https://github.com/liebharc/homr">homr</a> by Christian Liebhardt, also AGPL-3.0. OCR is off, so the
        title and chord text are not read. The MusicXML you make with it is yours.
      </footer>
    </section>
  )
}

async function hasWebGpu(): Promise<boolean> {
  const gpu = navigator.gpu
  if (!gpu) return false
  try {
    const adapter = await gpu.requestAdapter()
    // homr's WebGPU weights are fp16. A device without shader-f16 compiles those
    // kernels as invalid and the detector returns no noteheads.
    return adapter?.features.has('shader-f16') ?? false
  } catch {
    return false
  }
}
