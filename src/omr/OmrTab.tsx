import { useMemo, useRef, useState } from 'react'
import { parseMusicXml } from '../score/parseMusicXml'
import { saveUserScore } from '../storage/db'
import { ScoreView } from '../ui/ScoreView'
import { ensureModelWorker, prepareModels } from './cacheModels'
import { explainRecognitionFailure } from './errors'
import { mergeMusicXml, pageRange } from './mergeMusicXml'
import { modelsForBackend } from './models'
import { renderPdfPages } from './pdfPage'

interface OmrTabProps {
  onPractice: (xml: string, title: string) => void
  onSaved: () => void
}

interface SheetPage {
  key: string
  label: string
  blob: Blob
  thumbUrl: string
  selected: boolean
}

interface PageTiming {
  label: string
  status: 'ok' | 'failed' | 'cancelled'
  inferenceMs: number
  note: string
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

export default function OmrTab({ onPractice, onSaved }: OmrTabProps) {
  const [pages, setPages] = useState<SheetPage[]>([])
  const [range, setRange] = useState('')
  const [phase, setPhase] = useState('先选择图片或 PDF。')
  const [download, setDownload] = useState({ loaded: 0, total: 0 })
  const [stage, setStage] = useState('')
  const [timings, setTimings] = useState<Timings>(emptyTimings)
  const [pageTimings, setPageTimings] = useState<PageTiming[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [log, setLog] = useState('')
  const [xml, setXml] = useState<string | null>(null)
  const [saveTitle, setSaveTitle] = useState('')
  const [saveNote, setSaveNote] = useState<string | null>(null)
  const cancelRef = useRef<AbortController | null>(null)
  const thumbs = useRef<string[]>([])

  const parsed = useMemo(() => {
    if (!xml) return null
    try {
      return parseMusicXml(xml)
    } catch (err) {
      return err instanceof Error ? err.message : '读不了这份 MusicXML。'
    }
  }, [xml])
  const notes = parsed && typeof parsed !== 'string' ? parsed.notes : []
  const title = parsed && typeof parsed !== 'string' && parsed.title !== 'Untitled' ? parsed.title : saveTitle || '识别结果'
  const selectedCount = pages.filter((page) => page.selected).length

  const replacePages = (next: SheetPage[]) => {
    for (const url of thumbs.current) URL.revokeObjectURL(url)
    thumbs.current = next.map((page) => page.thumbUrl).filter((url) => url.startsWith('blob:'))
    setPages(next)
    setRange('')
    setXml(null)
    setPageTimings([])
    setError(null)
    setLog('')
  }

  const onFiles = async (list: FileList | null) => {
    if (!list || list.length === 0) return
    const next: SheetPage[] = []
    let index = 1
    for (const file of list) {
      const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')
      if (isPdf) {
        const rendered = await renderPdfPages(file)
        for (const page of rendered) {
          next.push({
            key: `${file.name}-${page.index}`,
            label: `${file.name} 第 ${page.index} 页`,
            blob: page.png,
            thumbUrl: page.thumbUrl,
            selected: true,
          })
          index += 1
        }
      } else {
        next.push({
          key: `${file.name}-${index}`,
          label: list.length > 1 ? `${index}. ${file.name}` : file.name,
          blob: file,
          thumbUrl: URL.createObjectURL(file),
          selected: true,
        })
        index += 1
      }
    }
    replacePages(next)
    setPhase(next.length > 1 ? `已准备 ${next.length} 页。可以取消不需要的页，再开始识别。` : '已准备 1 页。')
    if (!saveTitle) setSaveTitle(list[0]?.name.replace(/\.[^.]+$/, '') ?? '')
  }

  const applyRange = () => {
    const chosen = new Set(pageRange(range, pages.length))
    setPages((current) => current.map((page, index) => ({ ...page, selected: chosen.has(index + 1) })))
  }

  const run = async () => {
    const chosen = pages.filter((page) => page.selected)
    if (chosen.length === 0) return
    const controller = new AbortController()
    cancelRef.current = controller
    setBusy(true)
    setError(null)
    setXml(null)
    setLog('')
    setPageTimings([])
    setTimings(emptyTimings())
    const startedDownload = performance.now()
    try {
      setPhase('正在确认显卡…')
      const gpu = await hasWebGpu()
      const wanted = gpu ? 'webgpu' : 'wasm'
      setPhase(gpu ? '正在下载 WebGPU 模型…' : '这台机器不能跑 fp16 的 WebGPU 模型，改为下载 WebAssembly 模型…')
      await ensureModelWorker()
      let files = modelsForBackend(wanted)
      const first = await prepareModels(files, (loaded, total) => setDownload({ loaded, total }))
      let downloadMs = first.downloadMs
      let cacheHit = first.cacheHit
      setTimings((prev) => ({ ...prev, downloadMs, cacheHit }))

      setPhase('正在启动识别器，模型只加载这一次…')
      const initStarted = performance.now()
      const { createRecognizer } = await import('homr-web')
      const recognizer = await createRecognizer({
        baseUrl: new URL('models/homr/', document.baseURI),
        prefer: gpu ? 'webgpu' : crossOriginIsolated ? 'wasm-threads' : 'wasm',
      })
      const initMs = Math.round(performance.now() - initStarted)
      if (recognizer.backend !== 'webgpu' && wanted === 'webgpu') {
        setPhase('WebGPU 不可用，改为下载 WebAssembly 模型…')
        const extra = modelsForBackend('wasm').filter((file) => !files.some((have) => have.sha256 === file.sha256))
        if (extra.length > 0) {
          const more = await prepareModels(extra, (loaded, total) => setDownload({ loaded, total }))
          downloadMs += more.downloadMs
          cacheHit = cacheHit && more.cacheHit
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

      const recognized: { label: string; xml: string }[] = []
      const timingsOut: PageTiming[] = []
      let inferenceTotal = 0
      for (let index = 0; index < chosen.length; index += 1) {
        const sheet = chosen[index]
        if (!sheet) continue
        if (controller.signal.aborted) {
          timingsOut.push({ label: sheet.label, status: 'cancelled', inferenceMs: 0, note: '已取消' })
          continue
        }
        setPhase(`正在识别第 ${index + 1} / ${chosen.length} 页：${sheet.label}`)
        const started = performance.now()
        const result = await recognizer.recognizePage(sheet.blob, {
          ocr: false,
          signal: controller.signal,
          onProgress: (progress) => {
            setStage(`第 ${index + 1} 页 ${progress.stage} ${progress.done}/${progress.total}`)
          },
        })
        const inferenceMs = Math.round(performance.now() - started)
        inferenceTotal += inferenceMs
        setTimings((prev) => ({ ...prev, inferenceMs: inferenceTotal }))
        if (result.ok && result.musicXml) {
          recognized.push({ label: sheet.label, xml: result.musicXml })
          timingsOut.push({ label: sheet.label, status: 'ok', inferenceMs, note: '已识别' })
        } else {
          timingsOut.push({
            label: sheet.label,
            status: result.error === 'cancelled' ? 'cancelled' : 'failed',
            inferenceMs,
            note: explainRecognitionFailure(result.error, result.log),
          })
        }
        setPageTimings([...timingsOut])
      }
      await recognizer.dispose()
      cancelRef.current = null
      if (recognized.length === 0) {
        setPhase('没有一页识别成功。')
        setError(timingsOut.find((item) => item.status === 'failed')?.note ?? '没有可用的结果。')
        return
      }
      const merged = mergeMusicXml(recognized)
      setXml(merged)
      const failed = timingsOut.filter((item) => item.status !== 'ok')
      setLog(failed.map((item) => `${item.label}: ${item.note}`).join('\n'))
      setPhase(
        failed.length === 0
          ? `已合并 ${recognized.length} 页。`
          : `已合并 ${recognized.length} 页，${failed.length} 页未收入。`,
      )
      void startedDownload
    } catch (err) {
      setPhase('已停止。')
      setError(err instanceof Error ? err.message : '识别失败。')
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
    link.download = `${saveTitle || 'score'}.musicxml`
    link.click()
    URL.revokeObjectURL(url)
  }

  const saveToLibrary = async () => {
    if (!xml) return
    const title = saveTitle.trim() || '未命名识谱'
    const id = await saveUserScore(title, xml)
    if (id == null) {
      setSaveNote('没有写进本机曲库。')
      return
    }
    setSaveNote(`已保存到曲库：${title}`)
    onSaved()
  }

  return (
    <section className="panel omr">
      <h2>识谱</h2>
      <p className="lede">在这台电脑上把乐谱照片或 PDF 认成 MusicXML。图片不会上传。</p>
      <div className="omr-actions">
        <label className="button ghost file-label">
          选择图片或 PDF
          <input
            id="omr-file"
            type="file"
            multiple
            accept="image/png,image/jpeg,.png,.jpg,.jpeg,application/pdf,.pdf"
            onChange={(event) => {
              void onFiles(event.target.files)
              event.target.value = ''
            }}
          />
        </label>
        <button type="button" className="button primary" disabled={selectedCount === 0 || busy} onClick={() => void run()}>
          {busy ? '识别中…' : `识别选中的 ${selectedCount} 页`}
        </button>
        {busy && (
          <button
            type="button"
            className="button stop"
            onClick={() => {
              cancelRef.current?.abort()
              setPhase('正在取消…')
            }}
          >
            取消
          </button>
        )}
      </div>
      {pages.length > 0 && (
        <>
          <div className="omr-actions">
            <button type="button" className="button ghost" onClick={() => setPages((current) => current.map((page) => ({ ...page, selected: true })))}>
              全选
            </button>
            <button type="button" className="button ghost" onClick={() => setPages((current) => current.map((page) => ({ ...page, selected: false })))}>
              全不选
            </button>
            <label className="field search">
              <span>页码</span>
              <input value={range} placeholder="例如 1-3, 5" onChange={(event) => setRange(event.target.value)} />
            </label>
            <button type="button" className="button ghost" onClick={applyRange}>
              应用页码
            </button>
          </div>
          <ul className="page-thumbs">
            {pages.map((page, index) => (
              <li key={page.key}>
                <label>
                  <img src={page.thumbUrl} alt={page.label} />
                  <span>
                    <input
                      type="checkbox"
                      checked={page.selected}
                      onChange={(event) => {
                        const selected = event.target.checked
                        setPages((current) => current.map((item, itemIndex) => (itemIndex === index ? { ...item, selected } : item)))
                      }}
                    />
                    {index + 1}. {page.label}
                  </span>
                </label>
              </li>
            ))}
          </ul>
        </>
      )}
      <p className="phase">{phase}</p>
      {download.total > 0 && (
        <div className="meter" aria-label="模型下载">
          <span className="meter-perfect" style={{ left: 0, width: `${Math.min(100, (download.loaded / download.total) * 100)}%` }} />
        </div>
      )}
      {stage && <p className="device-note">{stage}</p>}
      <details className="settings-more">
        <summary>技术信息</summary>
      <dl className="timings">
        <div>
          <dt>后端</dt>
          <dd>{timings.backend ?? '—'}</dd>
        </div>
        <div>
          <dt>缓存</dt>
          <dd>{timings.cacheHit == null ? '—' : timings.cacheHit ? '命中' : '已下载'}</dd>
        </div>
        <div>
          <dt>下载</dt>
          <dd>{timings.downloadMs == null ? '—' : `${timings.downloadMs} ms`}</dd>
        </div>
        <div>
          <dt>初始化</dt>
          <dd>{timings.initMs == null ? '—' : `${timings.initMs} ms`}</dd>
        </div>
        <div>
          <dt>识别合计</dt>
          <dd>{timings.inferenceMs == null ? '—' : `${timings.inferenceMs} ms`}</dd>
        </div>
        <div>
          <dt>线程</dt>
          <dd>{timings.threads ?? '—'}</dd>
        </div>
      </dl>
      {pageTimings.length > 0 && (
        <ul className="page-times">
          {pageTimings.map((item) => (
            <li key={item.label} className={item.status === 'ok' ? 'tone-good' : 'tone-bad'}>
              {item.label} · {item.note} · {item.inferenceMs} ms
            </li>
          ))}
        </ul>
      )}
      {timings.backendReason && <p className="device-note">{timings.backendReason}</p>}
      {log && <pre className="omr-log">{log}</pre>}
      </details>
      {error && <p className="score-status error">{error}</p>}
      {xml && (
        <div className="omr-result">
          <div className="omr-actions">
            <button type="button" className="button ghost" onClick={downloadXml}>
              下载 .musicxml
            </button>
            <button type="button" className="button primary" disabled={typeof parsed === 'string'} onClick={() => onPractice(xml, title)}>
              用这首练习
            </button>
            <label className="field search">
              <span>曲名</span>
              <input value={saveTitle} onChange={(event) => setSaveTitle(event.target.value)} />
            </label>
            <button type="button" className="button ghost" onClick={() => void saveToLibrary()}>
              保存到曲库
            </button>
          </div>
          {saveNote && <p className="device-note">{saveNote}</p>}
          {typeof parsed === 'string' ? (
            <p className="score-status error">{parsed}</p>
          ) : (
            <div className="score-frame omr-score">
              <ScoreView xml={xml} notes={notes} onReady={() => {}} onError={() => {}} />
            </div>
          )}
        </div>
      )}
      <footer className="omr-license">
        识别使用 <a href="https://github.com/jymen/homr-web">homr-web</a>（AGPL-3.0），移植自{' '}
        <a href="https://github.com/liebharc/homr">homr</a>（Christian Liebhardt，同样是 AGPL-3.0）。和弦文字识别已关闭。生成的
        MusicXML 归你。
      </footer>
    </section>
  )
}

async function hasWebGpu(): Promise<boolean> {
  const gpu = navigator.gpu
  if (!gpu) return false
  try {
    const adapter = await gpu.requestAdapter()
    return adapter?.features.has('shader-f16') ?? false
  } catch {
    return false
  }
}
