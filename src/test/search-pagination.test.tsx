import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { expect, it, vi } from 'vitest'
import { useSearchFeed } from '../hooks/useSearchFeed'
import { catalog, mapTmdb, TmdbCatalogProvider } from '../services/catalog'
import { Search } from '../pages/Search'
import { LibraryProvider } from '../state/library'
import type { CatalogPage, CatalogProvider, CatalogResult } from '../domain/media'
import { ScrollMemory } from '../components/ScrollMemory'
import { railSearchParams } from '../domain/browse'
import { catalogRailSpecs } from '../config/catalogRails'
import { Route, Routes, Link, useNavigate } from 'react-router'

const media = (id: number) => mapTmdb({ id, title: `Título ${id}`, poster_path: '/p.jpg', release_date: '1995-01-01', genre_ids: [27] }, 'movie')
const page = (number: number, ids = [number], last = 3): CatalogResult<CatalogPage> => ({ origin: 'tmdb', data: { items: ids.map(media), page: number, totalPages: last, totalResults: last, hasMore: number < last, nextPage: number < last ? number + 1 : null } })
function provider(load: NonNullable<CatalogProvider['searchPage']>): CatalogProvider {
  return { searchPage: load, home: async () => ({ data: [], origin: 'tmdb' }), search: async () => ({ data: [], origin: 'tmdb' }), detail: async () => ({ data: null, origin: 'tmdb' }), episodes: async () => ({ data: [], origin: 'tmdb' }) }
}
function Feed({ service, query = '' }: { service: CatalogProvider; query?: string }) {
  const feed = useSearchFeed(service, new URLSearchParams(query))
  return <><output>{feed.items.map(item => item.title).join(',')}</output>{feed.error && <p role="alert">{feed.error}</p>}{feed.page?.hasMore && <button disabled={feed.loading} onClick={feed.more}>Ver mais</button>}{feed.error && <button onClick={feed.retry}>Tentar novamente</button>}</>
}
it('appends three consecutive pages, deduplicates and hides Ver mais at the end', async () => {
  const load = vi.fn(async (params: URLSearchParams) => { const n = Number(params.get('pagina')); return page(n, n === 2 ? [1, 2] : [n]) })
  render(<Feed service={provider(load)} />)
  await screen.findByText('Título 1')
  fireEvent.click(screen.getByText('Ver mais'))
  await screen.findByText('Título 1,Título 2')
  fireEvent.click(screen.getByText('Ver mais'))
  await screen.findByText('Título 1,Título 2,Título 3')
  expect(screen.queryByText('Ver mais')).toBeNull()
  expect(load.mock.calls.map(([params]) => params.get('pagina'))).toEqual(['1', '2', '3'])
})
it('locks simultaneous clicks and retries the same failed page without losing cards', async () => {
  let release!: (value: CatalogResult<CatalogPage>) => void
  const load = vi.fn().mockResolvedValueOnce(page(1)).mockImplementationOnce(() => new Promise(resolve => { release = resolve })).mockResolvedValue(page(2))
  render(<Feed service={provider(load)} />)
  await screen.findByText('Título 1')
  fireEvent.click(screen.getByText('Ver mais')); fireEvent.click(screen.getByText('Ver mais'))
  expect(load).toHaveBeenCalledTimes(2)
  await act(async () => release({ ...page(2), origin: 'fallback', notice: 'offline' }))
  expect(screen.getByText('Título 1')).toBeInTheDocument()
  fireEvent.click(screen.getByText('Tentar novamente'))
  await screen.findByText('Título 1,Título 2')
  expect(load.mock.calls[2][0].get('pagina')).toBe('2')
})
it('cancels rapid filter changes and ignores late results from older searches', async () => {
  let finish!: (value: CatalogResult<CatalogPage>) => void
  const load = vi.fn().mockImplementationOnce(() => new Promise(resolve => { finish = resolve })).mockResolvedValue(page(1, [99]))
  const service = provider(load)
  const view = render(<Feed service={service} query="q=antigo" />)
  await waitFor(() => expect(load).toHaveBeenCalledTimes(1))
  view.rerender(<Feed service={service} query="q=novo&genero=Terror" />)
  await screen.findByText('Título 99')
  await act(async () => finish(page(1)))
  expect(screen.queryByText('Título 1')).toBeNull()
  expect(load.mock.calls[0][1].aborted).toBe(true)
})
it('debounces fast typing into a single text request', async () => {
  vi.useFakeTimers()
  try {
    const search = vi.spyOn(catalog, 'search').mockResolvedValue({ data: [], origin: 'tmdb' })
    render(<LibraryProvider><MemoryRouter><Search /></MemoryRouter></LibraryProvider>)
    await act(async () => { await Promise.resolve() })
    const initial = search.mock.calls.length
    const input = screen.getByLabelText('Buscar filmes e séries')
    fireEvent.change(input, { target: { value: 'a' } }); fireEvent.change(input, { target: { value: 'ab' } }); fireEvent.change(input, { target: { value: 'abc' } })
    await act(async () => { await vi.advanceTimersByTimeAsync(349) })
    expect(search).toHaveBeenCalledTimes(initial)
    await act(async () => { await vi.advanceTimersByTimeAsync(1) })
    expect(search).toHaveBeenCalledTimes(initial + 1)
    expect(search.mock.calls.at(-1)![0]).toBe('abc')
  } finally { vi.useRealTimers() }
})
it('applies combined discover filters remotely and forwards full pagination totals', async () => {
  const fetcher = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ results: [], total_pages: 4, total_results: 72 }) })
  vi.stubGlobal('fetch', fetcher)
  const result = await new TmdbCatalogProvider('test').searchPage(new URLSearchParams('tipo=movie&genero=Terror&de=1980&ate=1999&origem=BR&ordem=rating'))
  const url = fetcher.mock.calls[0][0] as URL
  expect(url.pathname).toBe('/3/discover/movie')
  expect(url.searchParams.get('with_genres')).toBe('27')
  expect(url.searchParams.get('with_origin_country')).toBe('BR')
  expect(url.searchParams.get('primary_release_date.gte')).toBe('1980-01-01')
  expect(url.searchParams.get('primary_release_date.lte')).toBe('1999-12-31')
  expect(result.data).toMatchObject({ totalPages: 4, totalResults: 72, hasMore: true, nextPage: 2 })
})
it('continues a filtered text search past empty pages without claiming filtered totals', async () => {
  const fetcher = vi.fn(async (url: URL) => ({ ok: true, json: async () => ({ results: Number(url.searchParams.get('page')) === 3 ? [{ id: 3, title: 'Filme', poster_path: '/p.jpg', release_date: '1995-01-01', genre_ids: [27] }] : [], total_pages: 5, total_results: 90 }) }))
  vi.stubGlobal('fetch', fetcher)
  const result = await new TmdbCatalogProvider('test').searchPage(new URLSearchParams('q=filme&tipo=movie&genero=Terror'))
  expect(fetcher).toHaveBeenCalledTimes(3)
  expect(result.data).toMatchObject({ page: 3, totalPages: null, totalResults: null, hasMore: true, nextPage: 4 })
  expect(result.data.items).toHaveLength(1)
})
it('preserves Ver todos anime criteria and does not silently ignore unsupported combinations', async () => {
  const fetcher = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ results: [], total_pages: 0, total_results: 0 }) })
  vi.stubGlobal('fetch', fetcher)
  const service = new TmdbCatalogProvider('test')
  const params = railSearchParams(catalogRailSpecs().find(spec => spec.id === 'anime')!.browse!)
  await service.searchPage(params)
  expect((fetcher.mock.calls[0][0] as URL).searchParams.get('with_origin_country')).toBe('JP')
  expect((await service.searchPage(new URLSearchParams('q=filme&origem=BR'))).origin).toBe('fallback')
  expect(fetcher).toHaveBeenCalledTimes(1)
})
it('restores accumulated cards from memory when returning, without another request', async () => {
  const load = vi.fn(async (params: URLSearchParams) => page(Number(params.get('pagina'))))
  const service = provider(load)
  const first = render(<Feed service={service} query="tipo=movie" />)
  await screen.findByText('Título 1'); fireEvent.click(screen.getByText('Ver mais'))
  await screen.findByText('Título 1,Título 2'); first.unmount()
  render(<Feed service={service} query="tipo=movie" />)
  await screen.findByText('Título 1,Título 2')
  expect(load).toHaveBeenCalledTimes(2)
})
it('restores the saved scroll target on Back instead of navigating to Home', async () => {
  function Back() { const navigate = useNavigate(); return <button onClick={() => navigate(-1)}>Voltar</button> }
  const scroll = vi.mocked(window.scrollTo)
  render(<MemoryRouter initialEntries={['/buscar?tipo=movie']}><ScrollMemory /><Routes>
    <Route path="/buscar" element={<Link to="/titulo/1">Detalhes</Link>} /><Route path="/titulo/:id" element={<Back />} />
  </Routes></MemoryRouter>)
  Object.defineProperty(window, 'scrollY', { configurable: true, value: 650 })
  fireEvent.scroll(window)
  fireEvent.click(screen.getByText('Detalhes')); fireEvent.click(screen.getByText('Voltar'))
  expect(scroll).toHaveBeenLastCalledWith({ top: 650, behavior: 'instant' })
  expect(screen.getByText('Detalhes')).toBeInTheDocument()
  Object.defineProperty(window, 'scrollY', { configurable: true, value: 0 })
})
