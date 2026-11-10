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
  /** Notes whose onset is inside this span are marked. The sheet itself is not redrawn. */
  span?: { startBeat: number; endBeat: number } | null
  onReady: (info: { matched: number; total: number }) => void
  onError: (message: string) => void
  onMeasure?: (measure: number, shiftKey: boolean) => void
  onNote?: (noteId: string, shiftKey: boolean) => void
}

interface Entry {
  gnote: GraphicalNote
  hand: Hand
  beat: number
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
      entries.set(match.id, { gnote, hand: match.hand, beat: step.beat })
      matched += 1
    }
  }
  return { entries, matched }
}

function noteElement(gnote: GraphicalNote): SVGGElement | null {
  const element = (gnote as { getSVGGElement?: () => SVGGElement | null }).getSVGGElement?.()
  return element ?? null
}

function scrollFrame(cursor: HTMLElement) {
  let frame = cursor.parentElement
  while (frame) {
    const style = getComputedStyle(frame)
    if (/(auto|scroll)/.test(style.overflowY) && frame.scrollHeight > frame.clientHeight + 8) break
    frame = frame.parentElement
  }
  if (!frame) return
  const box = cursor.getBoundingClientRect()
  const view = frame.getBoundingClientRect()
  if (box.top >= view.top + 8 && box.bottom <= view.bottom - 8) return
  frame.scrollTop += box.top - view.top - 24
}

export function ScoreView({ xml, notes, ref, span, onReady, onError, onMeasure, onNote }: ScoreViewProps) {
  const hostRef = useRef<HTMLDivElement>(null)
  const osmdRef = useRef<OpenSheetMusicDisplay | null>(null)
  const stepsRef = useRef<number[]>([])
  const stepIndexRef = useRef(0)
  const entriesRef = useRef<Map<string, Entry>>(new Map())
  const notesRef = useRef(notes)
  const onReadyRef = useRef(onReady)
  const onErrorRef = useRef(onError)
  const onMeasureRef = useRef(onMeasure)
  const onNoteRef = useRef(onNote)
  const spanRef = useRef(span)
  const beatRef = useRef<number | null>(null)
  notesRef.current = notes
  onReadyRef.current = onReady
  onErrorRef.current = onError
  onMeasureRef.current = onMeasure
  onNoteRef.current = onNote
  spanRef.current = span

  const markSpan = () => {
    const selected = spanRef.current
    const low = selected ? Math.min(selected.startBeat, selected.endBeat) : null
    const high = selected ? Math.max(selected.startBeat, selected.endBeat) : null
    for (const entry of entriesRef.current.values()) {
      const element = noteElement(entry.gnote)
      if (!element) continue
      const on = low != null && high != null && entry.beat >= low - 1e-3 && entry.beat <= high + 1e-3
      element.classList.toggle('is-practice-note', on)
    }
  }

  const seek = (beat: number) => {
    const osmd = osmdRef.current
    const steps = stepsRef.current
    if (!osmd?.cursor || steps.length === 0) return
    beatRef.current = beat
    let index = 0
    while (index < steps.length - 1 && steps[index + 1] <= beat + 1e-3) index += 1
    const cursor = osmd.cursor
    cursor.hide()
    cursor.reset()
    for (let step = 0; step < index; step += 1) {
      if (cursor.Iterator?.EndReached) break
      cursor.next()
    }
    cursor.show()
    stepIndexRef.current = index
    const element = cursor.cursorElement
    if (element) requestAnimationFrame(() => scrollFrame(element))
  }
  const seekRef = useRef(seek)
  seekRef.current = seek

  useImperativeHandle(ref, () => ({
    prepare(hands, beat) {
      for (const entry of entriesRef.current.values()) {
        const active = hands === 'both' || entry.hand === hands
        entry.gnote.setColor(active ? '#241c16' : '#c9bba6', INK)
      }
      markSpan()
      this.setBeat(beat)
    },
    setBeat(beat: number) {
      seekRef.current(beat)
    },
    colorNote(noteId, color) {
      const entry = entriesRef.current.get(noteId)
      if (!entry) return
      entry.gnote.setColor(color, INK)
      noteElement(entry.gnote)?.classList.add('is-colored')
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
      followCursor: false,
      defaultColorMusic: '#241c16',
      defaultColorTitle: '#241c16',
      cursorsOptions: [{ type: CursorType.ThinLeft, color: '#e39b3b', alpha: 0.9, follow: false }],
    })
    osmdRef.current = osmd

    const paint = async () => {
      if (host.clientWidth < 40) {
        await new Promise<void>((resolve) => {
          const observer = new ResizeObserver(() => {
            if (cancelled || host.clientWidth >= 40) {
              observer.disconnect()
              resolve()
            }
          })
          observer.observe(host)
        })
        if (cancelled || host.clientWidth < 40) return
      }
      try {
        await osmd.load(xml)
        if (cancelled) return
        const width = host.clientWidth
        osmd.Zoom = width < 720 ? 0.62 : 0.82
        osmd.render()
        if (cancelled || !osmd.cursor) return
        osmd.FollowCursor = false
        osmd.cursor.CursorOptions = { type: CursorType.ThinLeft, color: '#e39b3b', alpha: 0.9, follow: false }
        host.dataset.osmdLoads = String((Number(host.dataset.osmdLoads) || 0) + 1)
        const raw: { real: number; gnotes: GraphicalNote[] }[] = []
        osmd.cursor.hide()
        osmd.cursor.reset()
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
        for (const [id, entry] of entriesRef.current) {
          const element = noteElement(entry.gnote)
          if (!element) continue
          element.style.cursor = 'pointer'
          element.addEventListener('click', (event) => {
            event.preventDefault()
            event.stopPropagation()
            onNoteRef.current?.(id, event.shiftKey)
          })
        }
        const measures = osmd.GraphicSheet?.MeasureList ?? []
        for (const line of measures) {
          for (const measure of line ?? []) {
            const number = measure?.MeasureNumber
            const svg = measure?.getSVGGElement?.()
            if (!svg || number == null || number < 1) continue
            svg.dataset.measure = String(number)
            svg.style.cursor = 'pointer'
            svg.addEventListener('click', (event) => {
              event.preventDefault()
              onMeasureRef.current?.(number, event.shiftKey)
            })
          }
        }
        markSpan()
        if (beatRef.current != null) seekRef.current(beatRef.current)
        else osmd.cursor.show()
        if (!cancelled) {
          onReadyRef.current({ matched: best?.matched ?? 0, total: notesRef.current.length })
        }
      } catch (error) {
        if (!cancelled) {
          onErrorRef.current(error instanceof Error ? error.message : '这份乐谱画不出来。')
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

  useEffect(() => {
    markSpan()
  }, [span?.startBeat, span?.endBeat, xml])

  return <div className="score-host" ref={hostRef} />
}
