import { useMemo, useRef, useState } from 'react'
import { parseMusicXml } from '../score/parseMusicXml'
import { saveUserScore } from '../storage/db'
import { ScoreView } from '../ui/ScoreView'
import { explainRecognitionFailure } from './errors'
import { mergeMusicXml, pageRange } from './mergeMusicXml'
import { backendAdvice } from './models'
import { overfullMeasures } from './overfullMeasures'
import { openSession, readFile, type ModelTimings } from './session'

interface OmrTabProps {
  onPractice: (xml: string, title: string) => void
  onSaved: () => void
}

interface SheetPage {
  key: string
  label: string
  file: File
  selected: boolean
  thumbUrl: string
}

interface PageTiming {
  label: string
  note: string
  status: 'ok' | 'failed'
}

export default function OmrTab({ onPractice, onSaved }: OmrTabProps) {
  const [pages, setPages] = useState<SheetPage[]>([])
  const [range, setRange] = useState('')
  const [phase, setPhase] = useState('先选择图片或 PDF。')
  const [download, setDownload] = useState({ loaded: 0, total: 0 })
  const [stage, setStage] = useState('')
  const [ocr, setOcr] = useState(true)
  const [timings, setTimings] = useState<ModelTimings | null>(null)
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
  const suspectBars = useMemo(() => (xml ? overfullMeasures(xml) : []), [xml])
  const notes = parsed && typeof parsed !== 'string' ? parsed.notes : []
  const foundTitle = parsed && typeof parsed !== 'string' && parsed.title !== 'Untitled' ? parsed.title.trim() : ''
  const title = foundTitle || saveTitle || '识别结果'
  const selectedCount = pages.filter((page) => page.selected).length
  const advice = timings ? backendAdvice(timings.backend, timings.backendReason) : null

  const replacePages = (next: SheetPage[]) => {
    for (const url of thumbs.current) URL.revokeObjectURL(url)
    thumbs.current = next.map((page) => page.thumbUrl)
    setPages(next)
    setRange('')
    setXml(null)
    setPageTimings([])
    setError(null)
    setLog('')
  }

  const onFiles = (list: FileList | null) => {
    if (!list || list.length === 0) return
    const next: SheetPage[] = [...list].map((file, index) => ({
      key: `${file.name}-${file.lastModified}-${index}`,
      label: list.length > 1 ? `${index + 1}. ${file.name}` : file.name,
      file,
      selected: true,
      thumbUrl: URL.createObjectURL(file),
    }))
    replacePages(next)
    setPhase(next.length > 1 ? `已准备 ${next.length} 个文件。可以取消不需要的，再开始识别。` : '已准备 1 个文件。')
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
    setDownload({ loaded: 0, total: 0 })
    try {
      setPhase('正在确认模型…')
      const session = await openSession({ ocr }, (loaded, total) => setDownload({ loaded, total }), controller.signal)
      setTimings(session.timings)
      setPhase(ocr ? '模型就绪，开始识别（含和弦与标题文字）…' : '模型就绪，开始识别（跳过文字）…')
      const done: PageTiming[] = []
      const failed: string[] = []
      const parts: { label: string; xml: string }[] = []
      for (let index = 0; index < chosen.length; index += 1) {
        const page = chosen[index]
        if (!page) continue
        if (controller.signal.aborted) break
        setPhase(`正在识别第 ${index + 1} / ${chosen.length} 个文件：${page.file.name}`)
        try {
          const result = await readFile(session.recognizer, page.file, {
            ocr,
            onProgress: (progress) => setStage(`${progress.stage} ${progress.done}/${progress.pages} 页`),
            signal: controller.signal,
          })
          parts.push({ label: page.label, xml: result.musicXml })
          done.push({ label: page.file.name, note: result.failed.length === 0 ? '已识别' : `部分页未收入：${result.failed.join('；')}`, status: result.failed.length === 0 ? 'ok' : 'failed' })
          failed.push(...result.failed)
        } catch (err) {
          const message = err instanceof Error ? err.message : '识别失败。'
          done.push({ label: page.file.name, note: explainRecognitionFailure(message, ''), status: 'failed' })
          failed.push(`${page.file.name}：${message}`)
        }
        setPageTimings([...done])
      }
      await session.dispose()
      cancelRef.current = null
      if (parts.length === 0) {
        setPhase('没有一页识别成功。')
        setError(failed[0] ?? '没有可用的结果。')
        return
      }
      setXml(parts.length === 1 ? (parts[0]?.xml ?? '') : mergeMusicXml(parts))
      setLog(failed.join('\n'))
      setPhase(
        failed.length === 0
          ? `已识别 ${parts.length} 个文件。`
          : `已识别 ${parts.length} 个文件，${failed.length} 页未收入。`,
      )
    } catch (err) {
      if (controller.signal.aborted) setPhase('已停止。')
      else {
        setPhase('识别失败。')
        setError(err instanceof Error ? err.message : '识别失败。')
      }
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
              onFiles(event.target.files)
              event.target.value = ''
            }}
          />
        </label>
        <button type="button" className="button primary" disabled={selectedCount === 0 || busy} onClick={() => void run()}>
          {busy ? '识别中…' : `识别选中的 ${selectedCount} 个文件`}
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
        <label className="check">
          <input type="checkbox" checked={ocr} disabled={busy} onChange={(event) => setOcr(event.target.checked)} />
          读和弦、标题与力度文字
        </label>
      </div>
      <p className="device-note">
        {ocr
          ? '会多下载约 32 MB 的文字模型，每页多几秒；曲名、力度和速度记进谱里。'
          : '不读文字：曲名留空，和线上那些「识别出来的谱子没名字」一样。'}
      </p>
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
              <span>序号</span>
              <input value={range} placeholder="例如 1-3, 5" onChange={(event) => setRange(event.target.value)} />
            </label>
            <button type="button" className="button ghost" onClick={applyRange}>
              应用序号
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
                    {index + 1}. {page.file.name}
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
            <dd>{timings?.backend ?? '—'}</dd>
          </div>
          <div>
            <dt>线程</dt>
            <dd>{timings?.threads ?? '—'}</dd>
          </div>
          <div>
            <dt>缓存</dt>
            <dd>{timings == null ? '—' : timings.cacheHit ? '命中' : '已下载'}</dd>
          </div>
          <div>
            <dt>下载</dt>
            <dd>{timings == null ? '—' : `${timings.downloadMs} ms`}</dd>
          </div>
          <div>
            <dt>初始化</dt>
            <dd>{timings == null ? '—' : `${timings.initMs} ms`}</dd>
          </div>
        </dl>
        {pageTimings.length > 0 && (
          <ul className="page-times">
            {pageTimings.map((item) => (
              <li key={item.label} className={item.status === 'ok' ? 'tone-good' : 'tone-bad'}>
                {item.label} · {item.note}
              </li>
            ))}
          </ul>
        )}
        {timings?.backendReason && <p className="device-note">{timings.backendReason}</p>}
        {log && <pre className="omr-log">{log}</pre>}
      </details>
      {advice && <p className="device-note warn">{advice}</p>}
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
              <input value={saveTitle} placeholder={foundTitle || '识别结果'} onChange={(event) => setSaveTitle(event.target.value)} />
            </label>
            <button type="button" className="button ghost" onClick={() => void saveToLibrary()}>
              保存到曲库
            </button>
          </div>
          {saveNote && <p className="device-note">{saveNote}</p>}
          {suspectBars.length > 0 && (
            <p className="device-note warn">
              有 {suspectBars.length} 个小节的拍数超出了拍号，节奏多半读错了（音高通常是对的）：第 {suspectBars.join('、')} 小节。练之前对照原谱看看这几处。
            </p>
          )}
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
        <a href="https://github.com/liebharc/homr">homr</a>（Christian Liebhardt，同样是 AGPL-3.0）。文字识别可以在上面关掉。生成的
        MusicXML 归你。
      </footer>
    </section>
  )
}

