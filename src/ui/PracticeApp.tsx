import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react'
import type { PlayedEvent, ScoreNote } from '../judge/types'
import { KEY_BINDINGS } from '../midi/keyboardMap'
import { attachInput, enableMidi, listInputs, midiSupported, watchInputs, type MidiPortInfo } from '../midi/webmidi'
import { firstOnset, selectHands, type HandSelection } from '../modes/hands'
import type { PracticeMode } from '../modes/practiceMode'
import { type CatalogFile, type CatalogPiece, type CatalogQuery, nowPlayingLine, quickPicks } from '../score/catalog'
import { parseMusicXml, type ParsedScore } from '../score/parseMusicXml'
import { readScoreFile, unpackMxl } from '../score/mxl'
import { noteName } from '../score/pitch'
import { TABS, hashOpensPicker, tabFromHash, type TabId } from './tabs'
import { getUserScore, listRuns, listTrainRuns, listUserScores, loadSettings, saveSettings, saveUserScore, type RunRecord, type SavedScore, type TrainRunRecord } from '../storage/db'
import { Controls } from './Controls'
import { LibraryTab } from './LibraryTab'
import { DevicePicker } from './DevicePicker'
import { FeedbackStrip } from './FeedbackStrip'
import { keyboardBounds, Keyboard } from './Keyboard'
import { ScoreView, type ScoreHandle } from './ScoreView'
import { SummaryPanel } from './SummaryPanel'
import { TrainHistory } from './TrainHistory'
import { TrainTab } from './TrainTab'
import { usePractice } from './usePractice'

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

export function PracticeApp() {
  const [tab, setTab] = useState<TabId>(() => tabFromHash(window.location.hash))
  const [omrMounted, setOmrMounted] = useState(() => tabFromHash(window.location.hash) === 'omr')
  const [piece, setPiece] = useState<LoadedPiece | null>(null)
  const [pickerOpen, setPickerOpen] = useState(() => hashOpensPicker(window.location.hash))
  const [query, setQuery] = useState<CatalogQuery>({ level: 'all', hands: 'all', text: '' })
  const [bpm, setBpm] = useState(72)
  const [hands, setHands] = useState<HandSelection>('both')
  const [mode, setMode] = useState<PracticeMode>('wait')
  const [loop, setLoop] = useState(false)
  const [latencyOffsetMs, setLatencyOffsetMs] = useState(0)
  const [keyboardEnabled, setKeyboardEnabled] = useState(true)
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
  const tabRef = useRef(tab)
  tabRef.current = tab

  const parsed = useMemo(() => {
    if (!piece) return { score: null, error: null as string | null }
    try {
      return { score: parseMusicXml(piece.xml) as ParsedScore, error: null as string | null }
    } catch (error) {
      return { score: null, error: error instanceof Error ? error.message : 'Could not read that score.' }
    }
  }, [piece])

  const notes = useMemo(() => parsed.score?.notes ?? [], [parsed.score])
  const active = selectHands(notes, hands)
  const bounds = keyboardBounds(notes)

  const practice = usePractice({
    notes,
    pieceId: piece?.id ?? '',
    pieceTitle: piece ? piece.titleZh?.trim() || piece.title : '',
    bpm,
    hands,
    mode,
    latencyOffsetMs,
    timeSignature: parsed.score?.timeSignature ?? { beats: 4, beatType: 4 },
    scoreRef,
    loop,
    keyboardEnabled,
    listenKeyboard: tab === 'practice',
  })

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
    void fetch(new URL('pieces/manifest.json', document.baseURI).href)
      .then(async (response) => {
        if (!response.ok) return
        const body = (await response.json()) as CatalogFile
        setCatalog(body.pieces ?? [])
      })
      .catch(() => setCatalog([]))
      .finally(() => setCatalogReady(true))
  }, [])

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
      if (settings.lastLibraryId) setLastLibraryId(settings.lastLibraryId)
      setHydrated(true)
    })
    return () => {
      cancel = true
    }
  }, [])

  useEffect(() => {
    if (!hydrated) return
    void saveSettings({ bpm, hands, mode, latencyOffsetMs, lastLibraryId: lastLibraryId || undefined })
  }, [hydrated, bpm, hands, mode, latencyOffsetMs, lastLibraryId])

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
    const beat = firstOnset(selectHands(notes, hands))[0]?.beat ?? 0
    scoreRef.current?.prepare(hands, beat)
  }, [scoreState, practice.status, hands, notes, piece?.id])

  useEffect(() => {
    if (!midiOn || !inputId) return
    return attachInput(inputId, (event) => {
      if (tabRef.current === 'train') trainInput.current(event)
      else practice.handleInput(event)
    })
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
      if (score.notes.length === 0) throw new Error('That file has no notes to play.')
      choosePiece({
        id: `file:${file.name}:${file.size}:${file.lastModified}`,
        title: score.title || file.name,
        titleZh: null,
        composer: file.name,
        level: '文件',
        xml,
      })
    } catch (error) {
      setFileError(error instanceof Error ? error.message : 'Could not open that file.')
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
      setMidiError(error instanceof Error ? error.message : 'MIDI access was blocked.')
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

  const counts = countHands(notes)
  const hintNotes = practice.status === 'idle' ? firstOnset(active) : []
  const targetNotes = practice.status === 'playing' || practice.status === 'countin' ? practice.current : []
  const hits = practice.judgements.filter((item) => item.result === 'hit').length
  const wrongs = practice.judgements.filter((item) => item.result === 'wrong').length
  const misses = practice.judgements.filter((item) => item.result === 'miss').length
  const extras = practice.judgements.filter((item) => item.result === 'extra').length
  const running = practice.status === 'playing' || practice.status === 'countin'
  const canStart = !running && active.length > 0 && scoreState !== 'loading'

  return (
    <div className="app">
      <header className="topbar">
        <div>
          <p className="eyebrow">Practice stand</p>
          <h1>Note by Note</h1>
        </div>
      </header>

      <nav className="tabs" aria-label="Sections">
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
                    score.id == null ? [] : [{ id: score.id, title: score.title, createdAt: score.createdAt }],
                  )}
                  query={query}
                  onQuery={setQuery}
                  onOpen={(entry) => void openCatalogPiece(entry)}
                  onOpenSaved={(id) => void openSavedScore(id)}
                  onOpenFile={() => fileRef.current?.click()}
                  onCollapse={piece ? collapsePicker : undefined}
                  searchRef={searchRef}
                />
              </aside>
            )}
            {piece && (
              <div className="practice-main">
                <header className="now-playing">
                  <div>
                    <p className="eyebrow">当前曲目</p>
                    <h2>{nowPlayingLine(piece)}</h2>
                  </div>
                  <button type="button" className="button ghost" onClick={openPicker}>
                    换一首
                  </button>
                </header>
                <Controls
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
                  onStart={() => void practice.start()}
                  onStop={practice.stop}
                />
                <FeedbackStrip
                  status={practice.status}
                  modeLabel={mode === 'wait' ? 'Wait mode' : 'Rhythm mode'}
                  last={practice.last}
                  recent={practice.judgements.slice(-8)}
                  current={practice.status === 'idle' ? hintNotes : practice.current}
                  hits={hits}
                  wrongs={wrongs}
                  misses={misses}
                  extras={extras}
                />
                {practice.summary && <SummaryPanel summary={practice.summary} saved={practice.judgements.length > 0} />}
                <section className="score-frame" aria-label="Score">
                  {scoreState === 'loading' && <p className="score-status">Opening the score…</p>}
                  {(scoreMessage || parsed.error || fileError) && (
                    <p className="score-status error">{scoreMessage || parsed.error || fileError}</p>
                  )}
                  {active.length === 0 && notes.length > 0 && (
                    <p className="score-status">This hand has no notes in the score. Switch hands to practice it.</p>
                  )}
                  <div className="score-meta">
                    <span>{piece.titleZh?.trim() || piece.title}</span>
                    <span>
                      {counts.R} right · {counts.L} left
                    </span>
                    {practice.status === 'idle' && practice.previous && (
                      <span>Last run {Math.round(practice.previous.hitRate * 100)}% hits</span>
                    )}
                  </div>
                  {parsed.score && (
                    <ScoreView
                      xml={piece.xml}
                      notes={notes}
                      ref={scoreRef}
                      onReady={(info) => {
                        setMapInfo(info)
                        setScoreState('ready')
                      }}
                      onError={(message) => {
                        setScoreMessage(message)
                        setScoreState('error')
                      }}
                    />
                  )}
                  {scoreState === 'ready' && mapInfo.total > 0 && mapInfo.matched < mapInfo.total && (
                    <p className="score-status warn">
                      Highlighted {mapInfo.matched} of {mapInfo.total} notes on the page. The strip still scores every note.
                    </p>
                  )}
                  {practice.countBeat != null && (
                    <div className="count-in" aria-hidden="true">
                      {practice.countBeat}
                    </div>
                  )}
                </section>
                <section className="keyboard-panel" aria-label="Piano keyboard">
                  <div className="keyboard-caption">
                    <p>
                      {keyboardEnabled
                        ? 'Click a key, or play the computer keyboard. The map is under 设置.'
                        : 'Computer keys are off. Click the on-screen keys, or turn them back on under 设置.'}
                    </p>
                  </div>
                  <Keyboard
                    low={bounds.low}
                    high={bounds.high}
                    pressed={practice.pressed}
                    flashes={practice.flashes}
                    targets={targetNotes.map((note) => note.pitch)}
                    hints={hintNotes.map((note) => note.pitch)}
                    onEvent={practice.handleInput}
                  />
                </section>
              </div>
            )}
          </div>
        )}
      </div>

      <div className={tab === 'train' ? 'tab-panel' : 'tab-panel is-stashed'}>
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
          inputRef={trainInput}
        />
      </div>

      {omrMounted && (
        <div className={tab === 'omr' ? 'tab-panel' : 'tab-panel is-stashed'}>
          <Suspense fallback={<p className="panel">Opening the recognition engine…</p>}>
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
          <label className="field latency">
            <span>Latency calibration {latencyOffsetMs} ms</span>
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
            If the keyboard’s note arrives after you played it, raise this until an on-time attack sits in the center of
            the rhythm meter. The value is subtracted from the MIDI timestamp before it is compared with the score. It
            applies the next time you press Start.
          </p>
          <label className="check">
            <input
              type="checkbox"
              checked={keyboardEnabled}
              onChange={(event) => setKeyboardEnabled(event.target.checked)}
            />
            Computer keyboard plays notes
          </label>
          <div className="key-map">
            {KEY_BINDINGS.filter((binding) => /^[A-Z]$/.test(binding.label)).map((binding) => (
              <span key={binding.code}>
                <kbd>{binding.label}</kbd> {noteName(binding.pitch)}
              </span>
            ))}
          </div>
          <p>The Q row starts at C4. The Z row starts at C3. Keys between those rows are the black notes.</p>
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
        <p>No saved runs yet. Finish or stop a practice run and it will show up here, in this browser.</p>
      ) : (
        <table className="runs">
          <thead>
            <tr>
              <th>When</th>
              <th>Piece</th>
              <th>Mode</th>
              <th>Hit rate</th>
              <th>Mean offset</th>
            </tr>
          </thead>
          <tbody>
            {runs.map((run) => (
              <tr key={run.id ?? run.createdAt}>
                <td>{new Date(run.createdAt).toLocaleString()}</td>
                <td>{run.title || run.pieceId}</td>
                <td>{run.mode}</td>
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
    composer: '识谱',
    level: '我的曲谱',
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
