import { useEffect, useRef, useState } from 'react'
import { explainRecognitionFailure } from '../omr/errors'
import { mergeMusicXml } from '../omr/mergeMusicXml'
import { modelsForBackend } from '../omr/models'
import { ensureModelWorker, prepareModels } from '../omr/cacheModels'
import { renderPdfPages } from '../omr/pdfPage'
import { readScoreFile } from '../score/mxl'
import { defaultHands, inspectMidi, midiToMusicXml, type MidiOverview } from '../score/midiScore'
import { assertPlayableMusicXml, exportScoresZip, readScoresZip } from '../score/scoreBackup'
import { saveUserScore, updateUserScore, type SavedScore } from '../storage/db'

interface ScoreImportProps {
  scores: SavedScore[]
  onSaved: () => void
  onClose: () => void
  initialFiles?: File[]
}

interface Row {
  name: string
  status: 'waiting' | 'working' | 'done' | 'error'
  detail: string
}

interface PendingMidi {
  name: string
  data: Uint8Array
  overview: MidiOverview
  right: number[]
  left: number[]
  split: boolean
}

export function ScoreImport({ scores, onSaved, onClose, initialFiles }: ScoreImportProps) {
  const [rows, setRows] = useState<Row[]>([])
  const [midi, setMidi] = useState<PendingMidi | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const restoreRef = useRef<HTMLInputElement>(null)
  const queue = useRef<File[]>([])
  const running = useRef(false)
  const started = useRef(false)

  const pushRow = (row: Row) => setRows((current) => [...current, row])
  const patchRow = (name: string, patch: Partial<Row>) => {
    setRows((current) => {
      const index = current.findLastIndex((item) => item.name === name)
      if (index < 0) return current
      return current.map((item, itemIndex) => (itemIndex === index ? { ...item, ...patch } : item))
    })
  }

  const runQueue = async () => {
    if (running.current) return
    running.current = true
    while (queue.current.length > 0) {
      const file = queue.current.shift()
      if (!file) break
      pushRow({ name: file.name, status: 'working', detail: '正在读取…' })
      try {
        await importOne(file, (detail) => patchRow(file.name, { detail }))
        patchRow(file.name, { status: 'done', detail: '已存入这台浏览器' })
        onSaved()
      } catch (error) {
        patchRow(file.name, { status: 'error', detail: error instanceof Error ? error.message : '导入失败。' })
      }
    }
    running.current = false
  }

  const importOne = async (file: File, progress: (detail: string) => void) => {
    const name = file.name.toLowerCase()
    if (name.endsWith('.mid') || name.endsWith('.midi')) {
      const data = new Uint8Array(await file.arrayBuffer())
      const overview = inspectMidi(data)
      const hands = defaultHands(overview.tracks)
      const choice = await new Promise<{ right: number[]; left: number[]; split: boolean }>((resolve, reject) => {
        setMidi({ name: file.name, data, overview, right: hands.right, left: hands.left, split: overview.tracks.length === 1 })
        midiWait.current = { resolve, reject }
      })
      setMidi(null)
      const xml = midiToMusicXml(data, { right: choice.right, left: choice.left }, { splitAt: choice.split ? 60 : null })
      const playable = assertPlayableMusicXml(xml)
      const id = await saveUserScore(playable.title || file.name.replace(/\.[^.]+$/, ''), xml)
      if (id == null) throw new Error('没有写进本机曲库。')
      return
    }
    if (isScore(name)) {
      const xml = await readScoreFile(file)
      const playable = assertPlayableMusicXml(xml)
      const id = await saveUserScore(playable.title || file.name.replace(/\.[^.]+$/, ''), xml)
      if (id == null) throw new Error('没有写进本机曲库。')
      return
    }
    if (isPicture(file)) {
      progress('正在准备识谱…')
      const xml = await recognizeFile(file, progress)
      const playable = assertPlayableMusicXml(xml)
      const id = await saveUserScore(playable.title || file.name.replace(/\.[^.]+$/, ''), xml)
      if (id == null) throw new Error('没有写进本机曲库。')
      return
    }
    throw new Error('只接受 MusicXML、MIDI、PDF 或图片。')
  }

  const midiWait = useRef<{
    resolve: (value: { right: number[]; left: number[]; split: boolean }) => void
    reject: (error: Error) => void
  } | null>(null)

  const enqueue = (list: File[]) => {
    if (list.length === 0) return
    queue.current.push(...list)
    void runQueue()
  }

  useEffect(() => {
    if (started.current || !initialFiles || initialFiles.length === 0) return
    started.current = true
    enqueue(initialFiles)
  }, [initialFiles])

  const downloadBackup = () => {
    const bytes = exportScoresZip(scores.filter((score) => score.xml))
    const blob = new Blob([Uint8Array.from(bytes)], { type: 'application/zip' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = '我的曲谱.zip'
    link.click()
    URL.revokeObjectURL(url)
  }

  const restore = async (file: File | undefined) => {
    if (!file) return
    setNote(null)
    try {
      const entries = readScoresZip(new Uint8Array(await file.arrayBuffer()))
      let saved = 0
      const problems: string[] = []
      for (const entry of entries) {
        try {
          assertPlayableMusicXml(entry.xml)
          const id = await saveUserScore(entry.title, entry.xml)
          if (id == null) throw new Error('没有写进本机曲库。')
          await updateUserScore(id, { level: entry.level, tag: entry.tag })
          saved += 1
        } catch (error) {
          problems.push(`${entry.title}：${error instanceof Error ? error.message : '读不了'}`)
        }
      }
      onSaved()
      setNote(problems.length === 0 ? `已恢复 ${saved} 首。` : `已恢复 ${saved} 首。${problems.join(' ')}`)
    } catch (error) {
      setNote(error instanceof Error ? error.message : '这份备份打不开。')
    }
  }

  return (
    <div className="import-panel">
      <p className="device-note">这些曲谱只存在这台浏览器的本地数据库里，不会上传到服务器。</p>
      <div
        className="drop-zone"
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => {
          event.preventDefault()
          enqueue([...event.dataTransfer.files])
        }}
      >
        <p>把 MusicXML、MIDI、PDF 或图片拖到这里。</p>
        <label className="button ghost file-label">
          选择文件
          <input
            ref={inputRef}
            type="file"
            multiple
            accept=".musicxml,.xml,.mxl,.mid,.midi,application/pdf,.pdf,image/png,image/jpeg,.png,.jpg,.jpeg"
            onChange={(event) => {
              enqueue([...(event.target.files ?? [])])
              event.target.value = ''
            }}
          />
        </label>
      </div>
      {rows.length > 0 && (
        <ul className="import-rows">
          {rows.map((row, index) => (
            <li key={`${row.name}-${index}`} className={row.status === 'error' ? 'is-error' : ''}>
              <strong>{row.name}</strong>
              <span>{row.status === 'working' ? '进行中' : row.status === 'done' ? '完成' : row.status === 'error' ? '失败' : '等待'} · {row.detail}</span>
            </li>
          ))}
        </ul>
      )}
      {midi && (
        <form
          className="midi-hands"
          onSubmit={(event) => {
            event.preventDefault()
            midiWait.current?.resolve({ right: midi.right, left: midi.left, split: midi.split })
            midiWait.current = null
          }}
        >
          <p>{midi.name}：选择哪些音轨给右手、哪些给左手。</p>
          {midi.overview.tracks.map((track) => (
            <label key={track.index} className="field">
              <span>{track.name} · {track.notes} 个音</span>
              <select
                value={midi.right.includes(track.index) ? 'R' : midi.left.includes(track.index) ? 'L' : 'none'}
                onChange={(event) => {
                  const value = event.target.value
                  setMidi((current) => {
                    if (!current) return current
                    const right = current.right.filter((index) => index !== track.index)
                    const left = current.left.filter((index) => index !== track.index)
                    if (value === 'R') right.push(track.index)
                    if (value === 'L') left.push(track.index)
                    return { ...current, right, left }
                  })
                }}
              >
                <option value="R">右手</option>
                <option value="L">左手</option>
                <option value="none">不用</option>
              </select>
            </label>
          ))}
          <label className="check">
            <input type="checkbox" checked={midi.split} onChange={(event) => setMidi((current) => (current ? { ...current, split: event.target.checked } : current))} />
            低于中央 C 的音算左手
          </label>
          <button type="submit" className="button primary">导入这首 MIDI</button>
          <button
            type="button"
            className="button ghost"
            onClick={() => {
              midiWait.current?.reject(new Error('已取消这首 MIDI。'))
              midiWait.current = null
              setMidi(null)
            }}
          >
            取消
          </button>
        </form>
      )}
      <div className="omr-actions">
        <button type="button" className="button ghost" onClick={downloadBackup} disabled={scores.length === 0}>导出全部备份</button>
        <label className="button ghost file-label">
          从备份恢复
          <input
            ref={restoreRef}
            type="file"
            accept=".zip,application/zip"
            onChange={(event) => {
              void restore(event.target.files?.[0])
              event.target.value = ''
            }}
          />
        </label>
        <button type="button" className="button ghost" onClick={onClose}>收起导入</button>
      </div>
      {note && <p className={note.includes('失败') || note.includes('不是') ? 'score-status error' : 'device-note'}>{note}</p>}
    </div>
  )
}

function isScore(name: string): boolean {
  return name.endsWith('.musicxml') || name.endsWith('.xml') || name.endsWith('.mxl')
}

function isPicture(file: File): boolean {
  const name = file.name.toLowerCase()
  return file.type.startsWith('image/') || name.endsWith('.png') || name.endsWith('.jpg') || name.endsWith('.jpeg') || name.endsWith('.pdf') || file.type === 'application/pdf'
}

async function recognizeFile(file: File, progress: (detail: string) => void): Promise<string> {
  const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')
  const pages = isPdf ? await renderPdfPages(file) : [{ index: 1, png: file, thumbUrl: '' }]
  progress(`共 ${pages.length} 页`)
  const gpu = await hasWebGpu()
  await ensureModelWorker()
  const wanted = gpu ? 'webgpu' : 'wasm'
  await prepareModels(modelsForBackend(wanted), () => {})
  const { createRecognizer } = await import('homr-web')
  const recognizer = await createRecognizer({
    baseUrl: new URL('models/homr/', document.baseURI),
    prefer: gpu ? 'webgpu' : crossOriginIsolated ? 'wasm-threads' : 'wasm',
  })
  const recognized: { label: string; xml: string }[] = []
  try {
    for (let index = 0; index < pages.length; index += 1) {
      const page = pages[index]
      if (!page) continue
      progress(`第 ${index + 1} / ${pages.length} 页`)
      const result = await recognizer.recognizePage(page.png, { ocr: false })
      if (result.ok && result.musicXml) recognized.push({ label: `${file.name} 第 ${index + 1} 页`, xml: result.musicXml })
      else throw new Error(explainRecognitionFailure(result.error, result.log))
    }
  } finally {
    await recognizer.dispose()
  }
  if (recognized.length === 0) throw new Error('没有一页识别成功。')
  return mergeMusicXml(recognized)
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
