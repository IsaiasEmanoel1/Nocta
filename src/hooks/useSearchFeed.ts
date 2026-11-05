import { useCallback, useEffect, useRef, useState } from 'react'
import type { CatalogPage, CatalogProvider, Media } from '../domain/media'
import { browseSelection } from '../domain/browse'

interface Feed { items: Media[]; page?: CatalogPage; loading: boolean; error?: string; notice?: string }
const saved = new WeakMap<CatalogProvider, Map<string, { value: Feed; expires: number }>>()
export function useSearchFeed(provider: CatalogProvider, params: URLSearchParams) {
  const normalized = new URLSearchParams(Array.from(params.entries()).sort(([a], [b]) => a.localeCompare(b)))
  const key = normalized.toString()
  const [view, setView] = useState<{ key: string; value: Feed }>({ key, value: { items: [], loading: true } })
  const state = useRef<Feed>(view.value)
  const run = useRef<((retry?: boolean) => void) | undefined>(undefined)
  useEffect(() => {
    const controller = new AbortController()
    let busy = false
    let failedPage: number | undefined
    const old = saved.get(provider)?.get(key)
    state.current = old && old.expires > Date.now() ? old.value : { items: [], loading: false }
    const publish = (value: Feed, remember = false) => {
      if (controller.signal.aborted) return
      state.current = value; setView({ key, value })
      if (remember) {
        if (!saved.has(provider)) saved.set(provider, new Map())
        const cache = saved.get(provider)!
        cache.set(key, { value, expires: Date.now() + 120000 })
        if (cache.size > 12) cache.delete(cache.keys().next().value!)
      }
    }
    const load = async (retry = false) => {
      if (busy || controller.signal.aborted) return
      const current = state.current
      if (!retry && current.page && !current.page.hasMore) return
      const number = retry && failedPage ? failedPage : current.page?.nextPage ?? browseSelection(normalized).page
      busy = true
      publish({ ...current, loading: true, error: undefined })
      try {
        const request = new URLSearchParams(key); request.set('pagina', String(number))
        const selection = browseSelection(request)
        const result = provider.searchPage ? await provider.searchPage(request, controller.signal) : await provider.search(selection.query, { kind: selection.kind, genre: selection.genre, year: selection.year, sort: selection.sort as 'popular' | 'recent' | 'rating' }, controller.signal).then(value => ({ ...value, data: { items: value.data, page: 1, totalPages: 1, totalResults: value.data.length, hasMore: false, nextPage: null } as CatalogPage }))
        if (controller.signal.aborted) return
        if (result.origin === 'fallback') throw new Error(result.notice || 'Falha ao carregar resultados.')
        const seen = new Set(current.items.map(item => item.id))
        const items = [...current.items, ...result.data.items.filter(item => !seen.has(item.id) && Boolean(seen.add(item.id)))]
        failedPage = undefined
        publish({ items, page: result.data, loading: false, notice: result.notice }, true)
      } catch (error) {
        if (!controller.signal.aborted) { failedPage = number; publish({ ...current, loading: false, error: error instanceof Error ? error.message : 'Erro de rede. Tente novamente.' }) }
      } finally { busy = false }
    }
    run.current = retry => { void load(retry) }
    publish(state.current)
    if (!state.current.page) void load()
    return () => { controller.abort(); run.current = undefined }
  }, [provider, key])
  return { ...(view.key === key ? view.value : { items: [], loading: true }), more: useCallback(() => run.current?.(), []), retry: useCallback(() => run.current?.(true), []) }
}
