import { useEffect, useRef, useState } from 'react'
import { listBankMarks, markBankItem } from '../storage/db'
import { RECENT_WINDOW, loadBank, nextItem, type BankItem } from '../train/bank'

export function bankNumber(id: string): number {
  return Number(id.match(/(\d+)$/)?.[1] ?? 0)
}

export function useQuestionBank(name: string, enabled: boolean) {
  const [items, setItems] = useState<BankItem[]>([])
  const [itemId, setItemId] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  const [marks, setMarks] = useState<Record<string, 'done' | 'clean'>>({})
  const [ready, setReady] = useState(false)
  const recent = useRef<string[]>([])

  const reloadMarks = () =>
    listBankMarks().then((rows) => {
      const next: Record<string, 'done' | 'clean'> = {}
      for (const row of rows) next[row.id] = row.clean ? 'clean' : 'done'
      setMarks(next)
      return next
    })

  useEffect(() => {
    void reloadMarks().then(() => setReady(true))
  }, [])

  useEffect(() => {
    if (!enabled) return
    let live = true
    setItems([])
    setItemId(null)
    recent.current = []
    void loadBank(name)
      .then((file) => {
        if (live) setItems(file.items)
      })
      .catch(() => {
        if (live) setItems([])
      })
    return () => {
      live = false
    }
  }, [name, enabled])

  useEffect(() => {
    if (!enabled || !ready || itemId || items.length === 0) return
    const next = nextItem(items, new Set(Object.keys(marks)), recent.current)
    if (next) setItemId(next.id)
  }, [enabled, ready, itemId, items, marks])

  const current = items.find((item) => item.id === itemId)

  const advance = () => {
    if (current) recent.current = [...recent.current, current.id].slice(-RECENT_WINDOW)
    const next = nextItem(items, new Set(Object.keys(marks)), recent.current)
    setItemId(next?.id ?? null)
  }

  const pick = (id: string) => {
    if (current && current.id !== id) recent.current = [...recent.current, current.id].slice(-RECENT_WINDOW)
    setItemId(id)
  }

  const finish = (clean: boolean) => {
    if (!current) return
    void markBankItem(current.id, clean).then(() => reloadMarks())
  }

  return { items, current, open, setOpen, marks, advance, pick, finish }
}
