/** Deterministic generator. Same seed, same sequence. */
export function mulberry32(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function pickWeighted<T>(rng: () => number, items: readonly { item: T; weight: number }[]): T {
  const usable = items.filter((entry) => entry.weight > 0)
  if (usable.length === 0) throw new Error('Nothing to pick')
  const total = usable.reduce((sum, entry) => sum + entry.weight, 0)
  let cursor = rng() * total
  for (const entry of usable) {
    cursor -= entry.weight
    if (cursor <= 0) return entry.item
  }
  return usable[usable.length - 1].item
}

export function pickOne<T>(rng: () => number, items: readonly T[]): T {
  return items[Math.min(items.length - 1, Math.floor(rng() * items.length))]
}
