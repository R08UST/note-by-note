import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react'
import type { ScoreNote } from '../judge/types'
import { KEY_BINDINGS } from '../midi/keyboardMap'
import { attachInput, enableMidi, listInputs, midiSupported, watchInputs, type MidiPortInfo } from '../midi/webmidi'
import { firstOnset, selectHands, type HandSelection } from '../modes/hands'
import type { PracticeMode } from '../modes/practiceMode'
import { parseMusicXml, type ParsedScore } from '../score/parseMusicXml'
import { readScoreFile } from '../score/mxl'
import { noteName } from '../score/pitch'
import { BUNDLED_PIECES } from '../score/pieces'
import { listRuns, loadSettings, saveSettings, type RunRecord } from '../storage/db'
import { Controls } from './Controls'
import { DevicePicker } from './DevicePicker'
import { FeedbackStrip } from './FeedbackStrip'
import { keyboardBounds, Keyboard } from './Keyboard'
import { ScoreView, type ScoreHandle } from './ScoreView'
import { SummaryPanel } from './SummaryPanel'
import { TABS, tabFromHash, type TabId } from './tabs'
import { usePractice } from './usePractice'

const OmrTab = lazy(() => import('../omr/OmrTab'))

interface PieceChoice {
  id: string
  title: string
  blurb: string
  xml: string
}

export function PracticeApp() {
  const [tab, setTab] = useState<TabId>(() => tabFromHash(window.location.hash))
  const [omrMounted, setOmrMounted] = useState(() => tabFromHash(window.location.hash) === 'omr')
  const [piece, setPiece] = useState<PieceChoice>(BUNDLED_PIECES[0])
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
  const scoreRef = useRef<ScoreHandle>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const parsed = useMemo(() => {
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
    pieceId: piece.id,
    pieceTitle: piece.title,
    bpm,
    hands,
    mode,
    latencyOffsetMs,
    timeSignature: parsed.score?.timeSignature ?? { beats: 4, beatType: 4 },
    scoreRef,
    loop,
    keyboardEnabled,
  })

  useEffect(() => {
    const onHash = () => {
      const next = tabFromHash(window.location.hash)
      setTab(next)
      if (next === 'omr') setOmrMounted(true)
    }
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  useEffect(() => {
    if (tab !== 'history') return
    void listRuns().then(setRuns)
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
      setHydrated(true)
    })
    return () => {
      cancel = true
    }
  }, [])

  useEffect(() => {
    if (!hydrated) return
    void saveSettings({ bpm, hands, mode, latencyOffsetMs })
  }, [hydrated, bpm, hands, mode, latencyOffsetMs])

  useEffect(() => {
    setScoreState('loading')
    setScoreMessage(null)
    setMapInfo({ matched: 0, total: 0 })
  }, [piece.xml])

  useEffect(() => {
    if (scoreState !== 'ready' || practice.status !== 'idle') return
    const beat = firstOnset(selectHands(notes, hands))[0]?.beat ?? 0
    scoreRef.current?.prepare(hands, beat)
  }, [scoreState, practice.status, hands, notes, piece.id])

  useEffect(() => {
    if (!midiOn || !inputId) return
    return attachInput(inputId, practice.handleInput)
  }, [midiOn, inputId, practice.handleInput])

  useEffect(() => {
    if (!midiOn) return
    return watchInputs(() => {
      const next = listInputs()
      setInputs(next)
      setInputId((current) => (next.some((item) => item.id === current) ? current : (next[0]?.id ?? '')))
    })
  }, [midiOn])

  const choosePiece = (next: PieceChoice) => {
    if (practice.status === 'playing' || practice.status === 'countin') practice.stop()
    setFileError(null)
    setPiece(next)
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
        blurb: file.name,
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
    choosePiece({
      id: `omr:${title}:${xml.length}`,
      title: score.title && score.title !== 'Untitled' ? score.title : title,
      blurb: 'From 识谱',
      xml,
    })
    window.location.hash = 'practice'
    setTab('practice')
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
        <div className="piece-row">
          {BUNDLED_PIECES.map((item) => (
            <button
              key={item.id}
              type="button"
              className={piece.id === item.id ? 'piece is-selected' : 'piece'}
              onClick={() => choosePiece(item)}
            >
              <strong>{item.title}</strong>
              <span>{item.blurb}</span>
            </button>
          ))}
          {!BUNDLED_PIECES.some((item) => item.id === piece.id) && (
            <button type="button" className="piece is-selected">
              <strong>{piece.title}</strong>
              <span>{piece.blurb}</span>
            </button>
          )}
          <button type="button" className="piece file" onClick={() => fileRef.current?.click()}>
            <strong>Open a score</strong>
            <span>.musicxml, .xml, .mxl</span>
          </button>
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
        </div>

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
            <span>{piece.title}</span>
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

      <div className={tab === 'sight' ? 'tab-panel' : 'tab-panel is-stashed'}>
        <section className="panel">
          <h2>视奏</h2>
          <p className="lede">Sight-reading drills are not in this version.</p>
          <p>
            The idea is a short drill that flashes one note or one beat, waits for the key, then moves on, separate from
            playing a whole piece. Use 练习 for a real score in Wait or Rhythm mode until that drill exists.
          </p>
        </section>
      </div>

      {omrMounted && (
        <div className={tab === 'omr' ? 'tab-panel' : 'tab-panel is-stashed'}>
          <Suspense fallback={<p className="panel">Opening the recognition engine…</p>}>
            <OmrTab onPractice={useOmrPiece} />
          </Suspense>
        </div>
      )}

      <div className={tab === 'history' ? 'tab-panel' : 'tab-panel is-stashed'}>
        <HistoryPanel runs={runs} />
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
        </section>
      </div>
    </div>
  )
}

function HistoryPanel({ runs }: { runs: RunRecord[] }) {
  return (
    <section className="panel">
      <h2>记录</h2>
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

function countHands(notes: ScoreNote[]): { L: number; R: number } {
  return {
    L: notes.filter((note) => note.hand === 'L').length,
    R: notes.filter((note) => note.hand === 'R').length,
  }
}
