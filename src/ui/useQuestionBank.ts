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
  const recentByName = useRef<Map<string, string[]>>(new Map())
  const nameRef = useRef(name)
  nameRef.current = name

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
    const next = nextItem(items, new Set(Object.keys(marks)), recentByName.current.get(name) ?? [])
    if (next) setItemId(next.id)
  }, [enabled, ready, itemId, items, marks])

  const current = items.find((item) => item.id === itemId)

  const recentIds = () => [...(recentByName.current.get(nameRef.current) ?? [])]

  const commitRecent = (recent: readonly string[]) => {
    recentByName.current.set(nameRef.current, [...recent])
  }

  const advance = () => {
    if (current) commitRecent([...recentIds(), current.id].slice(-RECENT_WINDOW))
    const next = nextItem(items, new Set(Object.keys(marks)), recentIds())
    setItemId(next?.id ?? null)
  }

  const pick = (id: string) => {
    if (current && current.id !== id) commitRecent([...recentIds(), current.id].slice(-RECENT_WINDOW))
    setItemId(id)
  }

  const select = (id: string) => setItemId(id)

  const finish = (clean: boolean) => {
    if (!current) return
    void markBankItem(current.id, clean).then(() => reloadMarks())
  }

  return { items, current, open, setOpen, marks, advance, pick, select, finish, recentIds, commitRecent }
}
