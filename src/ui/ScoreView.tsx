import { CursorType, OpenSheetMusicDisplay, type GraphicalNote } from 'opensheetmusicdisplay'
import { useEffect, useImperativeHandle, useRef, type Ref } from 'react'
import type { Hand, ScoreNote } from '../judge/types'
import type { HandSelection } from '../modes/hands'
import { mapNotesToHeads, UNDRAWN_MEASURE } from '../score/mapNotes'
import { collectHeads } from '../score/osmdHeads'

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
  onReady: (info: { matched: number; total: number; undrawnIds: string[] }) => void
  onError: (message: string) => void
  onMeasure?: (measure: number, shiftKey: boolean) => void
  onNote?: (noteId: string, shiftKey: boolean) => void
  /** 1 fits the sheet to the frame width. Larger values zoom in from that fit. */
  zoom?: number
}

interface Entry {
  gnotes: GraphicalNote[]
  hand: Hand
  beat: number
}

const INK = { applyToNoteheads: true, applyToStem: true }

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

export function ScoreView({ xml, notes, ref, span, onReady, onError, onMeasure, onNote, zoom = 1 }: ScoreViewProps) {
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
  const zoomRef = useRef(zoom)
  const fitRef = useRef(1)
  const naturalRef = useRef(0)
  const readyRef = useRef(false)
  const wireRef = useRef<() => void>(() => {})
  notesRef.current = notes
  zoomRef.current = zoom
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
      const on = low != null && high != null && entry.beat >= low - 1e-3 && entry.beat <= high + 1e-3
      for (const gnote of entry.gnotes) noteElement(gnote)?.classList.toggle('is-practice-note', on)
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
        for (const gnote of entry.gnotes) gnote.setColor(active ? '#241c16' : '#c9bba6', INK)
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
      for (const gnote of entry.gnotes) {
        gnote.setColor(color, INK)
        noteElement(gnote)?.classList.add('is-colored')
      }
    },
  }))

  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    let cancelled = false
    let resize: ResizeObserver | null = null
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
        osmd.Zoom = 1
        osmd.render()
        const drawn = host.querySelector('svg')
        const natural = drawn ? Number.parseFloat(drawn.getAttribute('width') || '') || drawn.getBoundingClientRect().width : 0
        if (natural > 8) {
          naturalRef.current = natural
          fitRef.current = Math.max(0.35, (host.clientWidth - 12) / natural)
          osmd.Zoom = fitRef.current * zoomRef.current
          osmd.render()
        } else {
          const width = host.clientWidth
          fitRef.current = width < 720 ? 0.62 : 0.82
          naturalRef.current = 0
          osmd.Zoom = fitRef.current * zoomRef.current
        }
        if (cancelled || !osmd.cursor) return
        const engage = () => {
          if (cancelled || !osmd.cursor) return
          osmd.FollowCursor = false
          osmd.cursor.CursorOptions = { type: CursorType.ThinLeft, color: '#e39b3b', alpha: 0.9, follow: false }
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
          const lastReal = raw.at(-1)?.real ?? 0
          const lastBeat = notesRef.current.at(-1)?.beat ?? 0
          const factor = Math.abs(lastReal * 4 - lastBeat) <= Math.abs(lastReal - lastBeat) ? 4 : 1
          stepsRef.current = raw.map((step) => step.real * factor)
          stepIndexRef.current = 0
          const collected = collectHeads(osmd.Sheet, (note) => osmd.EngravingRules.GNote(note as never))
          const mapped = mapNotesToHeads(notesRef.current, collected.heads)
          const entries = new Map<string, Entry>()
          for (const [id, keys] of mapped.heads) {
            const gnotes = keys.flatMap((key) => {
              const drawn = collected.graphics.get(key)
              return drawn ? [drawn] : []
            })
            if (gnotes.length === 0) continue
            const note = notesRef.current.find((item) => item.id === id)
            entries.set(id, { gnotes, hand: note?.hand ?? 'R', beat: note?.beat ?? 0 })
          }
          entriesRef.current = entries
          for (const [id, entry] of entries) {
            for (const gnote of entry.gnotes) {
              const element = noteElement(gnote)
              if (!element) continue
              element.style.cursor = 'pointer'
              element.addEventListener('click', (event) => {
                event.preventDefault()
                event.stopPropagation()
                onNoteRef.current?.(id, event.shiftKey)
              })
            }
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
            onReadyRef.current({
              matched: entries.size,
              total: notesRef.current.length,
              undrawnIds: mapped.unmatched.filter((item) => item.reason === UNDRAWN_MEASURE).map((item) => item.id),
            })
          }
        }
        wireRef.current = () => {
          if (cancelled) return
          osmd.Zoom = fitRef.current * zoomRef.current
          osmd.render()
          engage()
        }
        host.dataset.osmdLoads = String((Number(host.dataset.osmdLoads) || 0) + 1)
        engage()
        readyRef.current = true
        if (naturalRef.current > 8) {
          resize = new ResizeObserver(() => {
            if (cancelled || naturalRef.current < 8) return
            const next = Math.max(0.35, (host.clientWidth - 12) / naturalRef.current)
            if (Math.abs(next - fitRef.current) < 0.04) return
            fitRef.current = next
            wireRef.current()
          })
          resize.observe(host)
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
      readyRef.current = false
      resize?.disconnect()
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

  useEffect(() => {
    if (!readyRef.current) return
    wireRef.current()
  }, [zoom])

  return <div className="score-host" ref={hostRef} />
}
