import { useEffect, useRef, useState } from 'react'
import type { CatalogProvider, CatalogRail, MediaKind, RailSpec } from '../domain/media'
import { useAsync } from './useAsync'

export interface RailEntry { spec: RailSpec; status: 'loading' | 'ready' | 'error'; rail?: CatalogRail; notice?: string }
const loadedCounts = new WeakMap<CatalogProvider, Map<string, number>>()
export function useRailFeed(provider: CatalogProvider, kind?: MediaKind) {
  const progressive = Boolean(provider.rail && provider.railSpecs)
  const legacy = useAsync(signal => progressive ? Promise.resolve(undefined) : provider.collections?.(kind, signal) ?? Promise.resolve(undefined), [provider, kind, progressive])
  const [entries, setEntries] = useState<RailEntry[]>([])
  const [remaining, setRemaining] = useState(0)
  const commands = useRef<{ more(): void; retry(id: string): void } | null>(null)
  useEffect(() => {
    setEntries([]); setRemaining(0)
    if (!provider.rail || !provider.railSpecs) return
    const controller = new AbortController()
    const specs = provider.railSpecs(kind).slice(1)
    const queue: RailSpec[] = []
    const busy = new Set<string>()
    let cursor = 0, active = 0
    const pump = () => {
      while (active < 3 && queue.length && !controller.signal.aborted) {
        const spec = queue.shift()!; active++
        provider.rail!(spec, controller.signal).then(result => {
          if (!controller.signal.aborted) setEntries(current => current.map(entry => entry.spec.id === spec.id
            ? { spec, rail: result.data, status: result.origin === 'fallback' ? 'error' : 'ready', notice: result.notice } : entry))
        }).catch(() => {
          if (!controller.signal.aborted) setEntries(current => current.map(entry => entry.spec.id === spec.id ? { spec, status: 'error', notice: 'Não foi possível atualizar este trilho.' } : entry))
        }).finally(() => { active--; busy.delete(spec.id); pump() })
      }
    }
    const more = (count = 4) => {
      if (controller.signal.aborted) return
      const batch = specs.slice(cursor, cursor + count); cursor += batch.length
      if (!loadedCounts.has(provider)) loadedCounts.set(provider, new Map())
      loadedCounts.get(provider)!.set(kind ?? 'all', cursor)
      setRemaining(specs.length - cursor)
      setEntries(current => [...current, ...batch.map(spec => ({ spec, status: 'loading' as const }))])
      for (const spec of batch) { busy.add(spec.id); queue.push(spec) }
      pump()
    }
    commands.current = { more, retry: id => {
      const spec = specs.find(item => item.id === id)
      if (!spec || busy.has(id) || controller.signal.aborted) return
      busy.add(id); setEntries(current => current.map(entry => entry.spec.id === id ? { spec, status: 'loading' } : entry))
      queue.push(spec); pump()
    } }
    more(loadedCounts.get(provider)?.get(kind ?? 'all') ?? 4)
    return () => { controller.abort(); commands.current = null }
  }, [provider, kind])
  return {
    entries: progressive ? entries : (legacy.data?.data ?? []).map((rail): RailEntry => ({ spec: { id: rail.id, title: rail.title, mediaType: kind ?? 'all', source: 'discover' }, rail, status: 'ready' })),
    pending: progressive ? entries.some(entry => entry.status === 'loading') : legacy.loading,
    remaining, notice: legacy.data?.notice,
    more: () => commands.current?.more(), retry: (id: string) => commands.current?.retry(id),
  }
}
