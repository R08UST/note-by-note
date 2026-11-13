import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { PlayedEvent, ScoreNote } from '../judge/types'
import { KEY_BINDINGS } from '../midi/keyboardMap'
import { attachInput, enableMidi, listInputs, midiSupported, watchInputs, type MidiPortInfo } from '../midi/webmidi'
import { firstOnset, selectHands, type HandSelection } from '../modes/hands'
import type { PracticeMode } from '../modes/practiceMode'
import { firstOnsetInMeasure, lastOnsetInMeasure, neighborOnset, notesInBeats, onsets, type Onset } from '../modes/span'
import { filterCatalog, type CatalogFile, type CatalogPiece, type CatalogQuery, nowPlayingLine, quickPicks } from '../score/catalog'
import { parseMusicXml, type ParsedScore } from '../score/parseMusicXml'
import { readScoreFile, unpackMxl } from '../score/mxl'
import { noteName } from '../score/pitch'
import { TABS, hashOpensPicker, tabFromHash, type TabId } from './tabs'
import { audioPrefs, setAudioPrefs } from '../audio/prefs'
import type { Expression } from '../audio/performance'
import { deleteUserScore, getUserScore, listRuns, listTrainRuns, listUserScores, loadPracticeRange, loadSettings, savePracticeRange, saveSettings, saveUserScore, updateUserScore, type RunRecord, type SavedScore, type TrainRunRecord } from '../storage/db'
import { DemoBar } from './DemoBar'
import { ListenBar } from './ListenBar'
import { Controls } from './Controls'
import { LibraryTab } from './LibraryTab'
import { DevicePicker } from './DevicePicker'
import { FeedbackStrip } from './FeedbackStrip'
import { keyboardBounds, Keyboard } from './Keyboard'
import type { ScoreHandle } from './ScoreView'
import { SummaryPanel } from './SummaryPanel'
import { LatencyCalibrator } from './LatencyCalibrator'
import { TrainHistory } from './TrainHistory'
import { usePractice } from './usePractice'

const ScoreView = lazy(() => import('./ScoreView').then((mod) => ({ default: mod.ScoreView })))
const TrainTab = lazy(() => import('./TrainTab').then((mod) => ({ default: mod.TrainTab })))

const OmrTab = lazy(() => import('../omr/OmrTab'))

interface LoadedPiece {
  id: string
  title: string
  titleZh: string | null
  composer: string
  level: string
  xml: string
}

const LEGACY_PIECE: Record<string, string> = {
  twinkle: 'os-twinkle-twinkle-little-star',
  'light-steps': 'demo-light-steps',
  'sunday-chords': 'demo-sunday-chords',
}

function narrowScreen(): boolean {
  return window.matchMedia('(max-width: 860px)').matches
}

function IconButton({ label, onClick, disabled, children }: { label: string; onClick: () => void; disabled?: boolean; children: ReactNode }) {
  return (
    <button type="button" className="button icon" title={label} aria-label={label} disabled={disabled} onClick={onClick}>
      {children}
    </button>
  )
}

function Glyph({ d }: { d: string }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
      <path d={d} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export function PracticeApp() {
  const [tab, setTab] = useState<TabId>(() => tabFromHash(window.location.hash))
  const [omrMounted, setOmrMounted] = useState(() => tabFromHash(window.location.hash) === 'omr')
  const [piece, setPiece] = useState<LoadedPiece | null>(null)
  const [pickerOpen, setPickerOpen] = useState(() => hashOpensPicker(window.location.hash))
  const [query, setQuery] = useState<CatalogQuery>({ level: 'all', hands: 'all', text: '', category: 'all', sort: 'level' })
  const [bpm, setBpm] = useState(72)
  const [hands, setHands] = useState<HandSelection>('both')
  const [mode, setMode] = useState<PracticeMode>('wait')
  const [loop, setLoop] = useState(false)
  const [loopLimit, setLoopLimit] = useState(0)
  const [ramp, setRamp] = useState(false)
  const [resetOnError, setResetOnError] = useState(true)
  const [rangeStart, setRangeStart] = useState(1)
  const [rangeEnd, setRangeEnd] = useState(1)
  const [cursorBeat, setCursorBeat] = useState(0)
  const [endBeat, setEndBeat] = useState(0)
  const [rangeReady, setRangeReady] = useState('')
  const [latencyOffsetMs, setLatencyOffsetMs] = useState(0)
  const [continuous, setContinuous] = useState(true)
  const [sound, setSound] = useState({ muted: false, piano: 0.8, metro: 0.7, monitor: false, accompany: false })
  const [keyboardEnabled, setKeyboardEnabled] = useState(true)
  const [keyboardOpen, setKeyboardOpen] = useState(false)
  const [scoreZoom, setScoreZoom] = useState(1)
  const [focusMode, setFocusMode] = useState(false)
  const [listenHands, setListenHands] = useState<Record<number, 'L' | 'R'>>({})
  const [undrawnIds, setUndrawnIds] = useState<readonly string[]>([])
  const [reportOpen, setReportOpen] = useState(false)
  const [reportCollapsed, setReportCollapsed] = useState(false)
  const [menuHost, setMenuHost] = useState<HTMLDivElement | null>(null)
  const [hydrated, setHydrated] = useState(false)
  const [scoreState, setScoreState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [mapInfo, setMapInfo] = useState({ matched: 0, total: 0 })
  const [scoreMessage, setScoreMessage] = useState<string | null>(null)
  const [fileError, setFileError] = useState<string | null>(null)
  const [midiOn, setMidiOn] = useState(false)
  const [midiBusy, setMidiBusy] = useState(false)
  const [midiError, setMidiError] = useState<string | null>(null)
  const [inputs, setInputs] = useState<MidiPortInfo[]>([])
  const [inputId, setInputId] = useState('')
  const [runs, setRuns] = useState<RunRecord[]>([])
  const [savedScores, setSavedScores] = useState<SavedScore[]>([])
  const [trainRuns, setTrainRuns] = useState<TrainRunRecord[]>([])
  const [catalog, setCatalog] = useState<CatalogPiece[]>([])
  const [catalogReady, setCatalogReady] = useState(false)
  const [lastLibraryId, setLastLibraryId] = useState('')
  const [restoreSettled, setRestoreSettled] = useState(false)
  const [openingId, setOpeningId] = useState<string | null>(null)
  const [libraryError, setLibraryError] = useState<string | null>(null)
  const userPicked = useRef(false)
  const scoreRef = useRef<ScoreHandle>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const trainInput = useRef<(event: PlayedEvent) => void>(() => {})
  const calibrateInput = useRef<((event: PlayedEvent) => void) | null>(null)
  const bindCalibrator = useCallback((push: ((event: PlayedEvent) => void) | null) => {
    calibrateInput.current = push
  }, [])
  const tabRef = useRef(tab)
  tabRef.current = tab

  const parsed = useMemo(() => {
    if (!piece) return { score: null, error: null as string | null }
    try {
      return { score: parseMusicXml(piece.xml) as ParsedScore, error: null as string | null }
    } catch (error) {
      return { score: null, error: error instanceof Error ? error.message : '读不了这份乐谱。' }
    }
  }, [piece])

  const notes = useMemo(() => parsed.score?.notes ?? [], [parsed.score])
  // Everything the score prints about how it should sound, handed to playback.
  const expression = useMemo<Expression>(
    () => ({
      dynamics: parsed.score?.dynamics ?? [],
      wedges: parsed.score?.wedges ?? [],
      pedals: parsed.score?.pedals ?? [],
      tempos: parsed.score?.tempos ?? [],
    }),
    [parsed.score],
  )
  useEffect(() => {
    setUndrawnIds([])
  }, [piece?.id])
  const judgedNotes = useMemo(
    () => (undrawnIds.length === 0 ? notes : notes.filter((note) => !undrawnIds.includes(note.id))),
    [notes, undrawnIds],
  )
  const active = selectHands(judgedNotes, hands)
  const bounds = keyboardBounds(notes)

  const practice = usePractice({
    notes: judgedNotes,
    pieceId: piece?.id ?? '',
    pieceTitle: piece ? piece.titleZh?.trim() || piece.title : '',
    bpm,
    hands,
    mode,
    latencyOffsetMs,
    timeSignature: parsed.score?.timeSignature ?? { beats: 4, beatType: 4 },
    scoreRef,
    loop,
    span: { startBeat: cursorBeat, endBeat },
    loopLimit,
    ramp,
    onRamp: () => setBpm((value) => Math.min(160, value + 4)),
    keyboardEnabled,
    listenKeyboard: tab === 'practice',
    resetOnError,
    expression,
  })

  useEffect(() => {
    if (!practice.summary) return
    setReportOpen(true)
    setReportCollapsed(false)
  }, [practice.summary])

  useEffect(() => {
    const onHash = () => {
      const next = tabFromHash(window.location.hash)
      setTab(next)
      if (next === 'omr') setOmrMounted(true)
      if (hashOpensPicker(window.location.hash)) setPickerOpen(true)
      else if (next === 'practice') setPickerOpen(false)
    }
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  useEffect(() => {
    const needLibrary = tab === 'practice' && (piece == null || pickerOpen || lastLibraryId !== '')
    if (!needLibrary || catalogReady) return
    void fetch(new URL('pieces/manifest.json', document.baseURI).href)
      .then(async (response) => {
        if (!response.ok) return
        const body = (await response.json()) as CatalogFile
        setCatalog(body.pieces ?? [])
      })
      .catch(() => setCatalog([]))
      .finally(() => setCatalogReady(true))
  }, [tab, piece, pickerOpen, lastLibraryId, catalogReady])

  useEffect(() => {
    if (tab !== 'history' && tab !== 'practice' && tab !== 'train') return
    void listRuns().then(setRuns)
    void listUserScores().then(setSavedScores)
    void listTrainRuns().then(setTrainRuns)
  }, [tab, practice.previous])

  useEffect(() => {
    let cancel = false
    void loadSettings().then((settings) => {
      if (cancel || !settings) {
        setHydrated(true)
        return
      }
      setBpm(settings.bpm)
      setHands(settings.hands)
      setMode(settings.mode)
      setLatencyOffsetMs(settings.latencyOffsetMs)
      if (settings.continuous === false) setContinuous(false)
      if (settings.resetOnError === false) setResetOnError(false)
      if (settings.lastLibraryId) setLastLibraryId(settings.lastLibraryId)
      setAudioPrefs({
        muted: settings.muted ?? false,
        piano: settings.pianoVolume ?? 0.8,
        metro: settings.metroVolume ?? 0.7,
        monitor: settings.monitor ?? false,
        accompany: settings.accompany ?? false,
      })
      setSound({
        muted: settings.muted ?? false,
        piano: settings.pianoVolume ?? 0.8,
        metro: settings.metroVolume ?? 0.7,
        monitor: settings.monitor ?? false,
        accompany: settings.accompany ?? false,
      })
      setKeyboardOpen(settings.keyboardOpen === true)
      if (typeof settings.scoreZoom === 'number' && settings.scoreZoom >= 0.6 && settings.scoreZoom <= 2.2) setScoreZoom(settings.scoreZoom)
      setHydrated(true)
    })
    return () => {
      cancel = true
    }
  }, [])

  useEffect(() => {
    if (!hydrated) return
    void saveSettings({
      bpm,
      hands,
      mode,
      latencyOffsetMs,
      lastLibraryId: lastLibraryId || undefined,
      continuous,
      monitor: sound.monitor,
      accompany: sound.accompany,
      muted: sound.muted,
      pianoVolume: sound.piano,
      metroVolume: sound.metro,
      keyboardOpen,
      scoreZoom,
      resetOnError,
    })
  }, [hydrated, bpm, hands, mode, latencyOffsetMs, lastLibraryId, continuous, sound, keyboardOpen, scoreZoom, resetOnError])

  useEffect(() => {
    if (!hydrated || !catalogReady || restoreSettled || userPicked.current) return
    const raw = lastLibraryId
    if (!raw) {
      setRestoreSettled(true)
      return
    }
    const id = LEGACY_PIECE[raw] ?? raw
    if (id.startsWith('saved:')) {
      void getUserScore(Number(id.slice(6))).then((saved) => {
        if (userPicked.current) return
        if (saved?.id != null) {
          userPicked.current = true
          setPiece(pieceFromSaved(saved))
          setLastLibraryId(`saved:${saved.id}`)
        }
        setRestoreSettled(true)
      })
      return
    }
    const entry = catalog.find((item) => item.id === id)
    if (!entry) {
      setRestoreSettled(true)
      return
    }
    userPicked.current = true
    void openCatalogPiece(entry, false).finally(() => setRestoreSettled(true))
  }, [hydrated, catalogReady, lastLibraryId, catalog, restoreSettled])

  useEffect(() => {
    setScoreState('loading')
    setScoreMessage(null)
    setMapInfo({ matched: 0, total: 0 })
  }, [piece?.xml])

  useEffect(() => {
    if (scoreState !== 'ready' || practice.status !== 'idle') return
    scoreRef.current?.prepare(hands, cursorBeat)
    // Recoloring on every cursor move is what flashed the page. Only the hand filter repaints noteheads.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scoreState, hands, piece?.id, practice.status])

  useEffect(() => {
    if (scoreState !== 'ready' || practice.status === 'playing' || practice.status === 'countin') return
    scoreRef.current?.setBeat(cursorBeat)
  }, [cursorBeat, scoreState, practice.status])

  useEffect(() => {
    if (!midiOn || !inputId) return
    return attachInput(
      inputId,
      (event) => {
        if (audioPrefs.monitor) {
          void import('../audio/engine').then((engine) => engine.monitorNote(event.pitch, event.velocity, event.type === 'on'))
        }
        if (calibrateInput.current) calibrateInput.current(event)
        else if (tabRef.current === 'train') trainInput.current(event)
        else practice.handleInput(event)
      },
      (down) => {
        void import('../audio/engine').then((engine) => engine.monitorPedal(down))
      },
    )
  }, [midiOn, inputId, practice.handleInput])

  useEffect(() => {
    if (!midiOn) return
    return watchInputs(() => {
      const next = listInputs()
      setInputs(next)
      setInputId((current) => (next.some((item) => item.id === current) ? current : (next[0]?.id ?? '')))
    })
  }, [midiOn])

  const finishPick = () => {
    if (narrowScreen()) {
      setPickerOpen(false)
      if (hashOpensPicker(window.location.hash)) window.location.hash = 'practice'
    }
  }

  const choosePiece = (next: LoadedPiece, keepPicker = false) => {
    if (practice.status === 'playing' || practice.status === 'countin') practice.stop()
    setFileError(null)
    setPiece(next)
    userPicked.current = true
    setRestoreSettled(true)
    if (!keepPicker) finishPick()
  }

  const openSavedScore = async (id: number) => {
    const saved = await getUserScore(id)
    if (!saved || saved.id == null) return
    setLastLibraryId(`saved:${saved.id}`)
    choosePiece(pieceFromSaved(saved))
  }

  const openCatalogPiece = async (entry: CatalogPiece, fromUser = true) => {
    setOpeningId(entry.id)
    setLibraryError(null)
    try {
      const response = await fetch(new URL(entry.file, document.baseURI).href)
      if (!response.ok) throw new Error(`打不开乐谱（HTTP ${response.status}）`)
      const bytes = new Uint8Array(await response.arrayBuffer())
      const xml = entry.file.endsWith('.mxl') ? unpackMxl(bytes) : new TextDecoder().decode(bytes)
      const score = parseMusicXml(xml)
      if (score.notes.length === 0) throw new Error('这首谱没有可弹的音符。')
      setLastLibraryId(entry.id)
      choosePiece(
        {
          id: entry.id,
          title: entry.title,
          titleZh: entry.title_zh,
          composer: entry.composer,
          level: entry.level,
          xml,
        },
        !fromUser,
      )
    } catch (error) {
      setLibraryError(error instanceof Error ? error.message : '打不开这首谱。')
    } finally {
      setOpeningId(null)
    }
  }

  const onFile = async (file: File | undefined) => {
    if (!file) return
    try {
      const xml = await readScoreFile(file)
      const score = parseMusicXml(xml)
      if (score.notes.length === 0) throw new Error('这个文件里没有可弹的音。')
      choosePiece({
        id: `file:${file.name}:${file.size}:${file.lastModified}`,
        title: score.title || file.name,
        titleZh: null,
        composer: file.name,
        level: '文件',
        xml,
      })
    } catch (error) {
      setFileError(error instanceof Error ? error.message : '打不开这个文件。')
    }
  }

  const onEnableMidi = async () => {
    setMidiBusy(true)
    setMidiError(null)
    try {
      await enableMidi()
      const next = listInputs()
      setMidiOn(true)
      setInputs(next)
      setInputId(next[0]?.id ?? '')
    } catch (error) {
      setMidiError(error instanceof Error ? error.message : 'MIDI 没有获得允许。')
    } finally {
      setMidiBusy(false)
    }
  }

  const useOmrPiece = (xml: string, title: string) => {
    const score = parseMusicXml(xml)
    const name = score.title && score.title !== 'Untitled' ? score.title : title || '未命名识谱'
    void saveUserScore(name, xml).then((id) => {
      void listUserScores().then(setSavedScores)
      if (id == null) return
      setLastLibraryId(`saved:${id}`)
      setPiece((current) => (current && current.xml === xml ? { ...current, id: `saved:${id}` } : current))
    })
    choosePiece({
      id: `omr:${name}:${xml.length}`,
      title: name,
      titleZh: null,
      composer: '识谱',
      level: '我的曲谱',
      xml,
    })
    window.location.hash = 'practice'
    setTab('practice')
    setPickerOpen(false)
  }

  const openPicker = () => {
    setPickerOpen(true)
    if (!hashOpensPicker(window.location.hash)) window.location.hash = 'library'
    window.setTimeout(() => searchRef.current?.focus(), 0)
  }

  const collapsePicker = () => {
    setPickerOpen(false)
    if (hashOpensPicker(window.location.hash)) window.location.hash = 'practice'
  }

  useEffect(() => {
    if (!piece || notes.length === 0) return
    const last = Math.max(1, ...notes.map((note) => note.measure))
    let cancel = false
    void loadPracticeRange(piece.id).then((saved) => {
      if (cancel) return
      const groups = onsets(notes)
      const wholeStart = groups[0]?.beat ?? 0
      const wholeEnd = groups[groups.length - 1]?.beat ?? 0
      if (saved) {
        const startMeasure = Math.max(1, Math.min(saved.start, last))
        const endMeasure = Math.max(1, Math.min(saved.end, last))
        setRangeStart(startMeasure)
        setRangeEnd(endMeasure)
        setCursorBeat(saved.startBeat ?? firstOnsetInMeasure(groups, startMeasure)?.beat ?? wholeStart)
        setEndBeat(saved.endBeat ?? lastOnsetInMeasure(groups, endMeasure)?.beat ?? wholeEnd)
        setLoopLimit(saved.loops)
        setRamp(saved.ramp)
      } else {
        setRangeStart(1)
        setRangeEnd(last)
        setCursorBeat(wholeStart)
        setEndBeat(wholeEnd)
      }
      setRangeReady(piece.id)
    })
    return () => {
      cancel = true
    }
  }, [piece?.id, notes.length])

  useEffect(() => {
    if (!piece || rangeReady !== piece.id) return
    void savePracticeRange({ pieceId: piece.id, start: rangeStart, end: rangeEnd, loops: loopLimit, ramp, startBeat: cursorBeat, endBeat })
  }, [piece?.id, rangeStart, rangeEnd, loopLimit, ramp, rangeReady, cursorBeat, endBeat])

  const lastMeasure = Math.max(1, ...notes.map((note) => note.measure))
  const groups = onsets(active)
  const counts = countHands(notes)
  const runningNow = practice.status === 'playing' || practice.status === 'countin'
  const stepNote = (direction: -1 | 1) => {
    if (practice.stepOnset(direction)) return
    const next = neighborOnset(groups, cursorBeat, direction)
    if (!next || next.beat > endBeat + 1e-3) return
    setCursorBeat(next.beat)
    setRangeStart(next.measure)
    if (runningNow) void practice.seek({ startBeat: next.beat, endBeat })
    else scoreRef.current?.setBeat(next.beat)
  }
  const stepMeasure = (direction: -1 | 1) => {
    let measure = rangeStart
    for (const group of groups) if (group.beat <= cursorBeat + 1e-3) measure = group.measure
    const target = firstOnsetInMeasure(groups, measure + direction)
    if (!target || target.beat > endBeat + 1e-3) return
    setCursorBeat(target.beat)
    setRangeStart(target.measure)
    if (runningNow) void practice.seek({ startBeat: target.beat, endBeat })
    else scoreRef.current?.setBeat(target.beat)
  }
  const hintNotes = practice.status === 'idle' ? firstOnset(notesInBeats(active, { startBeat: cursorBeat, endBeat })) : []
  const targetNotes = practice.status === 'playing' || practice.status === 'countin' ? practice.current : []
  const hits = practice.judgements.filter((item) => item.result === 'hit').length
  const wrongs = practice.judgements.filter((item) => item.result === 'wrong').length
  const misses = practice.judgements.filter((item) => item.result === 'miss').length
  const extras = practice.judgements.filter((item) => item.result === 'extra').length
  const running = practice.status === 'playing' || practice.status === 'countin'
  const canStart = !running && notesInBeats(active, { startBeat: cursorBeat, endBeat }).length > 0 && scoreState !== 'loading'

  useEffect(() => {
    if (tab !== 'practice') return
    const onKey = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLElement && ['INPUT', 'TEXTAREA', 'SELECT'].includes(event.target.tagName)) return
      if (event.key === 'Escape' && reportOpen) {
        event.preventDefault()
        setReportOpen(false)
        return
      }
      if (event.altKey && event.key === 'ArrowLeft') {
        event.preventDefault()
        stepMeasure(-1)
      } else if (event.altKey && event.key === 'ArrowRight') {
        event.preventDefault()
        stepMeasure(1)
      } else if (event.key === 'ArrowLeft') {
        event.preventDefault()
        stepNote(-1)
      } else if (event.key === 'ArrowRight') {
        event.preventDefault()
        stepNote(1)
      } else if (event.key === 'Home') {
        event.preventDefault()
        const first = firstOnsetInMeasure(groups, rangeStart) ?? groups[0]
        if (!first) return
        setCursorBeat(first.beat)
        if (runningNow) void practice.seek({ startBeat: first.beat, endBeat })
        else scoreRef.current?.setBeat(first.beat)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  return (
    <div className={`app${tab === 'practice' && piece ? ' is-practicing' : ''}${focusMode ? ' is-focus' : ''}`}>
      <header className="topbar">
        <div>
          <p className="eyebrow">练习台</p>
          <h1>Note by Note</h1>
        </div>
      </header>

      <nav className="tabs" aria-label="分区">
        {TABS.map((item) => (
          <a
            key={item.id}
            href={`#${item.id}`}
            role="tab"
            aria-selected={tab === item.id}
            className={tab === item.id ? 'is-selected' : ''}
            onClick={() => {
              setTab(item.id)
              if (item.id === 'omr') setOmrMounted(true)
            }}
          >
            <strong>{item.zh}</strong>
            <small>{item.en}</small>
          </a>
        ))}
      </nav>

      <div className={tab === 'practice' ? 'tab-panel' : 'tab-panel is-stashed'}>
        <input
          ref={fileRef}
          className="file-input"
          type="file"
          accept=".musicxml,.xml,.mxl,application/xml,application/vnd.recordare.musicxml+xml"
          onChange={(event) => {
            void onFile(event.target.files?.[0])
            event.target.value = ''
          }}
        />
        {!piece && !restoreSettled && <p className="panel">正在打开上次的曲子…</p>}
        {(piece || restoreSettled) && (
          <div className={`practice-layout ${piece ? 'has-piece' : 'is-empty'} ${pickerOpen ? 'picker-open' : ''}`}>
            {(!piece || pickerOpen) && (
              <aside className="library-slot" id="library-panel">
                {!piece && (
                  <div className="empty-lead">
                    <p className="empty-hint">先选一首曲子</p>
                    <div className="quick-picks">
                      {quickPicks(catalog).map((entry) => (
                        <button key={entry.id} type="button" className="piece" onClick={() => void openCatalogPiece(entry)}>
                          <strong>{entry.title_zh?.trim() || entry.title}</strong>
                          <span>
                            {entry.composer} · {entry.level}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                <LibraryTab
                  pieces={catalog}
                  activeId={piece?.id ?? ''}
                  openingId={openingId}
                  error={libraryError}
                  recent={recentPieces(catalog, runs)}
                  saved={savedScores.flatMap((score) =>
                    score.id == null ? [] : [{ id: score.id, title: score.title, createdAt: score.createdAt, level: score.level, tag: score.tag }],
                  )}
                  savedScores={savedScores}
                  query={query}
                  onQuery={setQuery}
                  onOpen={(entry) => void openCatalogPiece(entry)}
                  onOpenSaved={(id) => void openSavedScore(id)}
                  onRenameSaved={(id, title) => {
                    void updateUserScore(id, { title }).then(() => listUserScores().then(setSavedScores))
                    setPiece((current) => (current?.id === `saved:${id}` ? { ...current, title } : current))
                  }}
                  onLevelSaved={(id, level) => {
                    void updateUserScore(id, { level }).then(() => listUserScores().then(setSavedScores))
                    setPiece((current) => (current?.id === `saved:${id}` ? { ...current, level: level || '我的曲谱' } : current))
                  }}
                  onTagSaved={(id, tag) => {
                    void updateUserScore(id, { tag }).then(() => listUserScores().then(setSavedScores))
                    setPiece((current) => (current?.id === `saved:${id}` ? { ...current, composer: tag || '我的曲谱' } : current))
                  }}
                  onDeleteSaved={(id) => {
                    void deleteUserScore(id).then(() => listUserScores().then(setSavedScores))
                    setPiece((current) => (current?.id === `saved:${id}` ? null : current))
                  }}
                  onRefreshSaved={() => {
                    void listUserScores().then(setSavedScores)
                  }}
                  onOpenFile={() => fileRef.current?.click()}
                  onCollapse={piece ? collapsePicker : undefined}
                  searchRef={searchRef}
                />
              </aside>
            )}
            {piece && (
              <div className="practice-main">
                <header className="now-playing">
                  <h2>{nowPlayingLine(piece)}</h2>
                  <button type="button" className="button ghost" onClick={pickerOpen ? collapsePicker : openPicker} aria-pressed={pickerOpen}>
                    {pickerOpen ? '收起曲库' : '曲库'}
                  </button>
                </header>
                <div className="toolbar" role="toolbar" aria-label="练习">
                  <div className="toolbar-group">
                    <IconButton label="上一个音" onClick={() => stepNote(-1)}><Glyph d="M10 3 L5 8 L10 13" /></IconButton>
                    <IconButton label="下一个音" onClick={() => stepNote(1)}><Glyph d="M6 3 L11 8 L6 13" /></IconButton>
                    <IconButton label="上一小节" onClick={() => stepMeasure(-1)}><Glyph d="M3 3 V13 M6 4 L11 8 L6 12" /></IconButton>
                    <IconButton label="下一小节" onClick={() => stepMeasure(1)}><Glyph d="M13 3 V13 M10 4 L5 8 L10 12" /></IconButton>
                    <IconButton label="回到开头" onClick={() => {
                      const first = firstOnsetInMeasure(groups, rangeStart) ?? groups[0]
                      if (!first) return
                      setCursorBeat(first.beat)
                      if (runningNow) void practice.seek({ startBeat: first.beat, endBeat })
                      else scoreRef.current?.setBeat(first.beat)
                    }}><Glyph d="M4 3 V13 M6 4 L12 8 L6 12 Z" /></IconButton>
                    {mode === 'wait' && (
                      <IconButton label="退一音" disabled={practice.status !== 'playing'} onClick={practice.stepBack}><Glyph d="M11 3 L5 8 L11 13 M5 3 V13" /></IconButton>
                    )}
                  </div>
                  <span className="toolbar-sep" aria-hidden="true" />
                  <label className="field start-measure" title="播放和练习都从这一小节开始">
                    <span>起点</span>
                    <input
                      type="number"
                      min={1}
                      max={lastMeasure}
                      value={measureAtCursor(groups, cursorBeat)}
                      onChange={(event) => {
                        const measure = Math.max(1, Math.min(lastMeasure, Number(event.target.value) || 1))
                        const target = firstOnsetInMeasure(groups, measure)
                        if (!target) return
                        setCursorBeat(target.beat)
                        setRangeStart(target.measure)
                        if (runningNow) void practice.seek({ startBeat: target.beat, endBeat })
                        else scoreRef.current?.setBeat(target.beat)
                      }}
                    />
                  </label>
                  <Controls
                    embedded
                    bpm={bpm}
                    hands={hands}
                    mode={mode}
                    loop={loop}
                    status={practice.status}
                    canStart={canStart}
                    onBpm={setBpm}
                    onHands={setHands}
                    onMode={setMode}
                    onLoop={setLoop}
                    onStart={() => {
                      void import('../audio/engine').then((engine) => engine.stopDemo())
                      void practice.start()
                    }}
                    onStop={practice.stop}
                  />
                  <span className="toolbar-sep" aria-hidden="true" />
                  <ListenBar
                    toolbar
                    menuHost={menuHost}
                    notes={notes}
                    startBeat={cursorBeat}
                    rangeStart={cursorBeat}
                    rangeEnd={endBeat}
                    bpm={bpm}
                    onBpm={setBpm}
                    expression={expression}
                    disabled={practice.status === 'playing' || practice.status === 'countin'}
                    showKeyboard={false}
                    onSounding={setListenHands}
                    onBeat={(beat) => {
                      setCursorBeat(beat)
                      scoreRef.current?.setBeat(beat)
                    }}
                    onPractice={() => void practice.start()}
                    onNext={() => {
                      if (!piece) return
                      if (piece.id.startsWith('saved:')) {
                        const index = savedScores.findIndex((score) => `saved:${score.id}` === piece.id)
                        const next = savedScores[index + 1] ?? savedScores[0]
                        if (next?.id != null && `saved:${next.id}` !== piece.id) void openSavedScore(next.id)
                        return
                      }
                      const shelf = filterCatalog(catalog, query)
                      const index = shelf.findIndex((item) => item.id === piece.id)
                      const next = shelf[index + 1] ?? shelf[0]
                      if (next && next.id !== piece.id) void openCatalogPiece(next, false)
                    }}
                  />
                  <div className="toolbar-group zoom-controls" role="group" aria-label="乐谱缩放">
                    <IconButton label="缩小" onClick={() => setScoreZoom((value) => Math.max(0.6, Math.round((value - 0.1) * 10) / 10))}><Glyph d="M3 8 H13" /></IconButton>
                    <button type="button" className="button ghost" onClick={() => setScoreZoom(1)}>适合宽度</button>
                    <IconButton label="放大" onClick={() => setScoreZoom((value) => Math.min(2.2, Math.round((value + 0.1) * 10) / 10))}><Glyph d="M8 3 V13 M3 8 H13" /></IconButton>
                  </div>
                  <button type="button" className="button ghost" onClick={() => setFocusMode(true)}>专注</button>
                  {practice.summary && !reportOpen && (
                    <button type="button" className="button ghost" onClick={() => setReportOpen(true)}>成绩</button>
                  )}
                  <details className="more-menu">
                    <summary className="button ghost">更多</summary>
                    <div className="more-panel">
                      <div className="toolbar-group">
                        <label className="field">从
                          <input type="number" min={1} max={lastMeasure} value={rangeStart} onChange={(event) => {
                            const measure = Math.max(1, Number(event.target.value) || 1)
                            setRangeStart(measure)
                            const onset = firstOnsetInMeasure(groups, measure)
                            if (onset) setCursorBeat(onset.beat)
                          }} />
                        </label>
                        <label className="field">到
                          <input type="number" min={1} max={lastMeasure} value={rangeEnd} onChange={(event) => {
                            const measure = Math.max(1, Number(event.target.value) || 1)
                            setRangeEnd(measure)
                            const onset = lastOnsetInMeasure(groups, measure)
                            if (onset) setEndBeat(onset.beat)
                          }} />
                        </label>
                        <label className="field">循环遍数
                          <input type="number" min={0} max={20} value={loopLimit} onChange={(event) => setLoopLimit(Math.max(0, Number(event.target.value) || 0))} />
                        </label>
                      </div>
                      <label className="check"><input type="checkbox" checked={ramp} onChange={(event) => setRamp(event.target.checked)} />干净一遍后速度 +4</label>
                      {mode === 'wait' && (
                        <label className="check">
                          <input type="checkbox" checked={resetOnError} onChange={(event) => setResetOnError(event.target.checked)} />
                          弹错就回到这一小节开头
                        </label>
                      )}
                      <p className="device-note">点音符就从那个音重来。方向键换音，Alt+方向键换小节。按住 Shift 再点，选到那个音。循环遍数 0 表示一直循环。</p>
                      <DemoBar
                        notes={notes}
                        bpm={bpm}
                        startBeat={cursorBeat}
                        endBeat={endBeat}
                        practiceHands={hands}
                        loop={loop}
                        expression={expression}
                        disabled={practice.status === 'playing' || practice.status === 'countin'}
                        onBeat={(beat) => scoreRef.current?.setBeat(beat)}
                      />
                      <div ref={setMenuHost} className="listen-menu-host" />
                    </div>
                  </details>
                </div>
                <FeedbackStrip
                  status={practice.status}
                  modeLabel={mode === 'wait' ? '等待' : '节奏'}
                  last={practice.last}
                  recent={practice.judgements.slice(-8)}
                  current={practice.status === 'idle' ? hintNotes : practice.current}
                  hits={hits}
                  wrongs={wrongs}
                  misses={misses}
                  extras={extras}
                />
                {practice.summary && reportOpen && (
                  <SummaryPanel
                    summary={practice.passes.length > 1 ? (practice.passes[practice.passes.length - 1] ?? practice.summary) : practice.summary}
                    passes={practice.passes}
                    saved={practice.judgements.length > 0}
                    collapsed={reportCollapsed}
                    onToggleCollapsed={() => setReportCollapsed((value) => !value)}
                    onClose={() => setReportOpen(false)}
                    onJump={(measure) => {
                      const target = firstOnsetInMeasure(groups, measure)
                      if (!target) return
                      setCursorBeat(target.beat)
                      setRangeStart(target.measure)
                      if (target.beat > endBeat) setEndBeat(Math.max(endBeat, target.beat))
                      if (runningNow) void practice.seek({ startBeat: target.beat, endBeat: Math.max(endBeat, target.beat) })
                    }}
                    onPracticeAround={(measure) => {
                      const start = Math.max(1, measure - 1)
                      const end = Math.min(lastMeasure, measure + 1)
                      const from = firstOnsetInMeasure(groups, start)
                      const to = lastOnsetInMeasure(groups, end)
                      setRangeStart(start)
                      setRangeEnd(end)
                      if (from) setCursorBeat(from.beat)
                      if (to) setEndBeat(to.beat)
                      setLoop(true)
                      const span = { startBeat: from?.beat ?? cursorBeat, endBeat: to?.beat ?? endBeat }
                      if (runningNow) void practice.seek(span)
                      else window.setTimeout(() => void practice.start(), 0)
                    }}
                  />
                )}
                <section className="score-frame" aria-label="乐谱">
                  {scoreState === 'loading' && <p className="score-status">正在打开乐谱…</p>}
                  {(scoreMessage || parsed.error || fileError) && (
                    <p className="score-status error">{scoreMessage || parsed.error || fileError}</p>
                  )}
                  {active.length === 0 && notes.length > 0 && (
                    <p className="score-status">这只手在谱上没有音。换一只手再练。</p>
                  )}
                  <div className="score-meta">
                    <span>{piece.titleZh?.trim() || piece.title}</span>
                      <span>
                      右手 {counts.R} · 左手 {counts.L}
                    </span>
                    {practice.status === 'idle' && practice.previous && (
                      <span>上次命中 {Math.round(practice.previous.hitRate * 100)}%</span>
                    )}
                  </div>
                  {parsed.score && (
                    <Suspense fallback={<div className="score-skeleton" aria-label="正在打开乐谱" />}>
                      <ScoreView
                        xml={piece.xml}
                        notes={notes}
                        span={{ startBeat: cursorBeat, endBeat }}
                        ref={scoreRef}
                        zoom={scoreZoom}
                        layoutKey={focusMode ? 'focus' : 'page'}
                        onNote={(id, shift) => {
                          const note = notes.find((item) => item.id === id)
                          if (!note) return
                          if (shift) {
                            const low = Math.min(cursorBeat, note.beat)
                            const high = Math.max(cursorBeat, note.beat)
                            setCursorBeat(low)
                            setEndBeat(high)
                            const from = active.find((item) => Math.abs(item.beat - low) < 1e-3)
                            const to = [...active].reverse().find((item) => Math.abs(item.beat - high) < 1e-3)
                            if (from) setRangeStart(from.measure)
                            if (to) setRangeEnd(to.measure)
                            return
                          }
                          setCursorBeat(note.beat)
                          setRangeStart(note.measure)
                          const nextEnd = Math.max(endBeat, note.beat)
                          if (note.beat > endBeat) setEndBeat(nextEnd)
                          if (runningNow) void practice.seek({ startBeat: note.beat, endBeat: nextEnd })
                        }}
                        onMeasure={(measure, shift) => {
                          const target = shift ? lastOnsetInMeasure(groups, measure) : firstOnsetInMeasure(groups, measure)
                          if (!target) return
                          if (shift) {
                            const low = Math.min(cursorBeat, target.beat)
                            const high = Math.max(cursorBeat, target.beat)
                            setCursorBeat(low)
                            setEndBeat(high)
                            setRangeStart((start) => Math.min(start, measure))
                            setRangeEnd((end) => Math.max(end, measure))
                            return
                          }
                          setCursorBeat(target.beat)
                          setRangeStart(target.measure)
                          const nextEnd = Math.max(endBeat, target.beat)
                          if (target.beat > endBeat) setEndBeat(nextEnd)
                          if (runningNow) void practice.seek({ startBeat: target.beat, endBeat: nextEnd })
                        }}
                        onReady={(info) => {
                          setMapInfo({ matched: info.matched, total: info.total })
                          setUndrawnIds(info.undrawnIds)
                          setScoreState('ready')
                        }}
                        onError={(message) => {
                          setScoreMessage(message)
                          setScoreState('error')
                        }}
                      />
                    </Suspense>
                  )}
                  {scoreState === 'ready' && mapInfo.total > 0 && mapInfo.matched < mapInfo.total && (
                    <p className="score-status warn">
                      有 {mapInfo.total - mapInfo.matched} 个音没法在谱上标颜色，但仍然计分。
                    </p>
                  )}
                  {practice.countBeat != null && (
                    <div className="count-in" aria-hidden="true">
                      {practice.countBeat}
                    </div>
                  )}
                </section>
                <section className={keyboardOpen ? 'keyboard-panel is-open' : 'keyboard-panel is-collapsed'} aria-label="钢琴键盘">
                  <button
                    type="button"
                    className="keyboard-strip"
                    aria-expanded={keyboardOpen}
                    onClick={() => setKeyboardOpen((open) => !open)}
                  >
                    {keyboardOpen ? '收起键盘' : '键盘'}
                    <span>右手 · 左手 · 当前音 · 下一音</span>
                  </button>
                  {keyboardOpen && (
                    <Keyboard
                      low={bounds.low}
                      high={bounds.high}
                      pressed={practice.pressed}
                      flashes={practice.flashes}
                      targets={targetNotes.map((note) => note.pitch)}
                      hints={hintNotes.map((note) => note.pitch)}
                      hands={listenHands}
                      onEvent={practice.handleInput}
                    />
                  )}
                </section>
                <div className="focus-dock">
                  <button
                    type="button"
                    className="button primary"
                    onClick={() => {
                      if (practice.status === 'playing' || practice.status === 'countin') practice.stop()
                      else void practice.start()
                    }}
                  >
                    {practice.status === 'playing' || practice.status === 'countin' ? '停止' : '开始'}
                  </button>
                  <button type="button" className="button ghost" aria-label="缩小" onClick={() => setScoreZoom((value) => Math.max(0.6, Math.round((value - 0.1) * 10) / 10))}>－</button>
                  <button type="button" className="button ghost" onClick={() => setScoreZoom(1)}>适合宽度</button>
                  <button type="button" className="button ghost" aria-label="放大" onClick={() => setScoreZoom((value) => Math.min(2.2, Math.round((value + 0.1) * 10) / 10))}>＋</button>
                  <button type="button" className="button ghost" onClick={() => setKeyboardOpen((open) => !open)}>{keyboardOpen ? '收起键盘' : '键盘'}</button>
                  <button type="button" className="button ghost" onClick={() => setFocusMode(false)}>退出专注</button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {tab === 'train' && (
        <div className="tab-panel">
          <Suspense fallback={<p className="panel">正在打开训练…</p>}>
            <TrainTab
          active={tab === 'train'}
          keyboardEnabled={keyboardEnabled}
          latencyOffsetMs={latencyOffsetMs}
          piece={
            piece
              ? { id: piece.id, title: piece.titleZh?.trim() || piece.title, notes, time: parsed.score?.timeSignature ?? { beats: 4, beatType: 4 } }
              : null
          }
          onSaved={() => {
            void listTrainRuns().then(setTrainRuns)
          }}
          onCheckpoint={(id) => {
            const entry = catalog.find((item) => item.id === id)
            if (entry) void openCatalogPiece(entry)
          }}
          inputRef={trainInput}
          continuous={continuous}
          onContinuous={setContinuous}
        />
          </Suspense>
        </div>
      )}

      {omrMounted && (
        <div className={tab === 'omr' ? 'tab-panel' : 'tab-panel is-stashed'}>
          <Suspense fallback={<p className="panel">正在打开识谱…</p>}>
            <OmrTab
              onPractice={useOmrPiece}
              onSaved={() => {
                void listUserScores().then(setSavedScores)
              }}
            />
          </Suspense>
        </div>
      )}

      <div className={tab === 'history' ? 'tab-panel' : 'tab-panel is-stashed'}>
        <HistoryPanel runs={runs} trainRuns={trainRuns} />
      </div>

      <div className={tab === 'settings' ? 'tab-panel' : 'tab-panel is-stashed'}>
        <section className="panel settings">
          <h2>设置</h2>
          <DevicePicker
            supported={midiSupported()}
            enabled={midiOn}
            busy={midiBusy}
            inputs={inputs}
            inputId={inputId}
            error={midiError}
            onEnable={() => void onEnableMidi()}
            onSelect={setInputId}
          />
          <LatencyCalibrator value={latencyOffsetMs} onChange={setLatencyOffsetMs} bind={bindCalibrator} />
          <label className="field latency">
            <span>延迟校准 {latencyOffsetMs} 毫秒</span>
            <input
              type="number"
              min={-200}
              max={300}
              step={5}
              value={latencyOffsetMs}
              onChange={(event) => setLatencyOffsetMs(Number(event.target.value) || 0)}
            />
          </label>
          <p>
            如果琴键的音比你弹下去的时刻晚到，就把这个数调高，直到准时的音落在节奏尺的中间。这个数值会从 MIDI 时间里减掉，再和乐谱比较。下次按开始时生效。
          </p>
          <label className="check">
            <input
              type="checkbox"
              checked={keyboardEnabled}
              onChange={(event) => setKeyboardEnabled(event.target.checked)}
            />
            电脑键盘可以弹音
          </label>
          <h3>声音</h3>
          <p className="device-note">钢琴音色在第一次播放时才下载，存在本站，不会去外站取。键盘如果自己会响，监听保持关闭。</p>
          <label className="check">
            <input
              type="checkbox"
              checked={sound.muted}
              onChange={(event) => {
                const muted = event.target.checked
                setSound((current) => ({ ...current, muted }))
                setAudioPrefs({ muted })
              }}
            />
            静音
          </label>
          <label className="check">
            <input
              type="checkbox"
              checked={sound.monitor}
              onChange={(event) => {
                const monitor = event.target.checked
                setSound((current) => ({ ...current, monitor }))
                setAudioPrefs({ monitor })
              }}
            />
            监听 MIDI 键盘（默认关）
          </label>
          <label className="check">
            <input
              type="checkbox"
              checked={sound.accompany}
              onChange={(event) => {
                const accompany = event.target.checked
                setSound((current) => ({ ...current, accompany }))
                setAudioPrefs({ accompany })
              }}
            />
            节奏练习时播放另一只手
          </label>
          <label className="field latency">
            <span>钢琴音量 {Math.round(sound.piano * 100)}</span>
            <input
              type="range"
              min={0}
              max={100}
              value={Math.round(sound.piano * 100)}
              onChange={(event) => {
                const piano = Number(event.target.value) / 100
                setSound((current) => ({ ...current, piano }))
                setAudioPrefs({ piano })
              }}
            />
          </label>
          <label className="field latency">
            <span>节拍器音量 {Math.round(sound.metro * 100)}</span>
            <input
              type="range"
              min={0}
              max={100}
              value={Math.round(sound.metro * 100)}
              onChange={(event) => {
                const metro = Number(event.target.value) / 100
                setSound((current) => ({ ...current, metro }))
                setAudioPrefs({ metro })
              }}
            />
          </label>
          <div className="key-map">
            {KEY_BINDINGS.filter((binding) => /^[A-Z]$/.test(binding.label)).map((binding) => (
              <span key={binding.code}>
                <kbd>{binding.label}</kbd> {noteName(binding.pitch)}
              </span>
            ))}
          </div>
          <p>Q 这一排从 C4 起。Z 这一排从 C3 起。两排之间是黑键。</p>
          <section className="about">
            <h2>关于 / 版权</h2>
            <p>曲库里的谱可以打开来练。反复记号不会按反复展开，倚音不计入对错。</p>
            <ul>
              <li>
                <a href="https://github.com/pepperhorn/opensongs-json">opensongs-json</a>：CC0-1.0。L1 单手旋律，包括带中文曲名的民歌。
              </li>
              <li>
                <a href="https://noctavepiano.com/en/free-library/">Noctave 免费库</a>与
                <a href="https://noctavepiano.com/en/sheet-music/">曲目页</a>：多数为 CC0-1.0 或 PDM-1.0，个别页面为 CC BY。以每首卡片上的许可和署名为准。
              </li>
              <li>
                <a href="https://www.mutopiaproject.org/">Mutopia Project</a>：公有领域或 CC。这里用的三首是从 MIDI 转成的 MusicXML。
              </li>
            </ul>
            <p>带 CC BY 的曲子会在卡片上写出「署名」。没有署名要求的曲子仍列出出处，方便核对。</p>
          </section>
        </section>
      </div>
    </div>
  )
}

function HistoryPanel({ runs, trainRuns }: { runs: RunRecord[]; trainRuns: TrainRunRecord[] }) {
  return (
    <section className="panel">
      <h2>记录</h2>
      <TrainHistory runs={trainRuns} />
      {runs.length === 0 ? (
        <p>还没有记录。练完或停下一次，就会出现在这个浏览器里。</p>
      ) : (
        <table className="runs">
          <thead>
            <tr>
              <th>时间</th>
              <th>曲子</th>
              <th>方式</th>
              <th>命中率</th>
              <th>平均偏差</th>
            </tr>
          </thead>
          <tbody>
            {runs.map((run) => (
              <tr key={run.id ?? run.createdAt}>
                <td>{new Date(run.createdAt).toLocaleString()}</td>
                <td>{run.title || run.pieceId}</td>
                <td>{run.mode === 'wait' ? '等待' : run.mode === 'rhythm' ? '节奏' : run.mode}</td>
                <td>{Math.round(run.hitRate * 100)}%</td>
                <td>{run.meanOffsetMs == null ? '—' : `${Math.round(run.meanOffsetMs)} ms`}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  )
}

function pieceFromSaved(saved: SavedScore): LoadedPiece {
  return {
    id: `saved:${saved.id}`,
    title: saved.title,
    titleZh: null,
    composer: saved.tag?.trim() || '我的曲谱',
    level: saved.level || '我的曲谱',
    xml: saved.xml,
  }
}

function recentPieces(catalog: CatalogPiece[], runs: RunRecord[]): CatalogPiece[] {
  const seen = new Set<string>()
  const found: CatalogPiece[] = []
  for (const run of runs) {
    if (seen.has(run.pieceId)) continue
    const piece = catalog.find((item) => item.id === run.pieceId)
    if (!piece) continue
    seen.add(piece.id)
    found.push(piece)
    if (found.length === 8) break
  }
  return found
}

function countHands(notes: ScoreNote[]): { L: number; R: number } {
  return {
    L: notes.filter((note) => note.hand === 'L').length,
    R: notes.filter((note) => note.hand === 'R').length,
  }
}

/** The measure containing the current cursor, from the sorted onset list. */
function measureAtCursor(groups: readonly Onset[], beat: number): number {
  let measure = groups[0]?.measure ?? 1
  for (const group of groups) if (group.beat <= beat + 1e-3) measure = group.measure
  return measure
}
