import { CursorType, OpenSheetMusicDisplay, type GraphicalNote } from 'opensheetmusicdisplay'
import { useEffect, useImperativeHandle, useRef, type Ref } from 'react'
import type { Hand, ScoreNote } from '../judge/types'
import type { HandSelection } from '../modes/hands'
import { osmdHalfToneToMidi } from '../score/osmdPitch'

export interface ScoreHandle {
  prepare(hands: HandSelection, beat: number): void
  setBeat(beat: number): void
  colorNote(noteId: string, color: string): void
}

interface ScoreViewProps {
  xml: string
  notes: ScoreNote[]
  ref?: Ref<ScoreHandle>
  onReady: (info: { matched: number; total: number }) => void
  onError: (message: string) => void
}

interface Entry {
  gnote: GraphicalNote
  hand: Hand
}

const INK = { applyToNoteheads: true, applyToStem: true }

function midiOf(gnote: GraphicalNote): number[] {
  const halfTone = gnote.sourceNote?.halfTone
  if (typeof halfTone !== 'number') return []
  return [osmdHalfToneToMidi(halfTone), halfTone]
}

function assign(steps: { beat: number; gnotes: GraphicalNote[] }[], notes: ScoreNote[]) {
  const unused = new Set(notes.map((note) => note.id))
  const entries = new Map<string, Entry>()
  let matched = 0
  for (const step of steps) {
    const candidates = notes.filter((note) => unused.has(note.id) && Math.abs(note.beat - step.beat) < 0.03)
    for (const gnote of step.gnotes) {
      if (!gnote.sourceNote || gnote.sourceNote.isRest()) continue
      const pitches = midiOf(gnote)
      const staffId = gnote.sourceNote.ParentStaff?.Id
      const handHint: Hand | undefined = staffId === 2 ? 'L' : staffId === 1 ? 'R' : undefined
      const match =
        candidates.find(
          (note) => unused.has(note.id) && pitches.includes(note.pitch) && (handHint == null || note.hand === handHint),
        ) ?? candidates.find((note) => unused.has(note.id) && pitches.includes(note.pitch))
      if (!match) continue
      unused.delete(match.id)
      entries.set(match.id, { gnote, hand: match.hand })
      matched += 1
    }
  }
  return { entries, matched }
}

export function ScoreView({ xml, notes, ref, onReady, onError }: ScoreViewProps) {
  const hostRef = useRef<HTMLDivElement>(null)
  const osmdRef = useRef<OpenSheetMusicDisplay | null>(null)
  const stepsRef = useRef<number[]>([])
  const stepIndexRef = useRef(0)
  const entriesRef = useRef<Map<string, Entry>>(new Map())
  const notesRef = useRef(notes)
  const onReadyRef = useRef(onReady)
  const onErrorRef = useRef(onError)
  notesRef.current = notes
  onReadyRef.current = onReady
  onErrorRef.current = onError

  useImperativeHandle(ref, () => ({
    prepare(hands, beat) {
      for (const entry of entriesRef.current.values()) {
        const active = hands === 'both' || entry.hand === hands
        entry.gnote.setColor(active ? '#241c16' : '#c9bba6', INK)
      }
      this.setBeat(beat)
    },
    setBeat(beat: number) {
      const osmd = osmdRef.current
      const steps = stepsRef.current
      if (!osmd || steps.length === 0) return
      const cursor = osmd.cursor
      if (stepIndexRef.current > 0 && beat + 1e-3 < steps[stepIndexRef.current]) {
        cursor.reset()
        cursor.show()
        stepIndexRef.current = 0
      }
      while (stepIndexRef.current < steps.length - 1 && steps[stepIndexRef.current + 1] <= beat + 1e-3) {
        if (cursor.Iterator?.EndReached) break
        cursor.next()
        stepIndexRef.current += 1
      }
    },
    colorNote(noteId, color) {
      entriesRef.current.get(noteId)?.gnote.setColor(color, INK)
    },
  }))

  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    let cancelled = false
    const osmd = new OpenSheetMusicDisplay(host, {
      autoResize: false,
      backend: 'svg',
      drawTitle: true,
      drawSubtitle: false,
      drawComposer: false,
      drawPartNames: false,
      drawPartAbbreviations: false,
      followCursor: true,
      defaultColorMusic: '#241c16',
      defaultColorTitle: '#241c16',
      cursorsOptions: [{ type: CursorType.ThinLeft, color: '#e39b3b', alpha: 0.9, follow: true }],
    })
    osmdRef.current = osmd

    const paint = async () => {
      try {
        await osmd.load(xml)
        if (cancelled) return
        const width = host.clientWidth
        osmd.Zoom = width < 720 ? 0.62 : 0.82
        osmd.render()
        if (cancelled || !osmd.cursor) return
        osmd.cursor.CursorOptions = { type: CursorType.ThinLeft, color: '#e39b3b', alpha: 0.9, follow: true }
        const raw: { real: number; gnotes: GraphicalNote[] }[] = []
        osmd.cursor.reset()
        osmd.cursor.show()
        let guard = 0
        while (osmd.cursor.Iterator && !osmd.cursor.Iterator.EndReached && guard < 8000) {
          raw.push({
            real: osmd.cursor.Iterator.currentTimeStamp?.RealValue ?? 0,
            gnotes: osmd.cursor.GNotesUnderCursor() ?? [],
          })
          osmd.cursor.next()
          guard += 1
        }
        const scaled = [4, 1].map((factor) =>
          raw.map((step) => ({ beat: step.real * factor, gnotes: step.gnotes })),
        )
        const attempts = scaled.map((steps) => ({ steps, ...assign(steps, notesRef.current) }))
        attempts.sort((a, b) => b.matched - a.matched)
        const best = attempts[0]
        entriesRef.current = best?.entries ?? new Map()
        stepsRef.current = (best?.steps ?? []).map((step) => step.beat)
        stepIndexRef.current = 0
        osmd.cursor.reset()
        osmd.cursor.show()
        if (!cancelled) {
          onReadyRef.current({ matched: best?.matched ?? 0, total: notesRef.current.length })
        }
      } catch (error) {
        if (!cancelled) {
          onErrorRef.current(error instanceof Error ? error.message : 'The score could not be drawn.')
        }
      }
    }

    void paint()
    return () => {
      cancelled = true
      osmdRef.current = null
      entriesRef.current = new Map()
      stepsRef.current = []
      try {
        osmd.dispose()
      } catch {
        // The sheet was already released.
      }
      host.replaceChildren()
    }
  }, [xml])

  return <div className="score-host" ref={hostRef} />
}
