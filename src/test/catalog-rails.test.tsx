import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { expect, it, vi } from 'vitest'
import { catalogRailSpecs, movieGenres, tvGenres, railRequest } from '../config/catalogRails'
import { TmdbCatalogProvider, mapTmdb } from '../services/catalog'
import { CatalogRequestCache } from '../services/catalogCache'
import { Home } from '../pages/Home'
import { LibraryProvider } from '../state/library'
import type { CatalogProvider, CatalogResult, CatalogRail } from '../domain/media'

const record = (id = 1) => ({ id, title: `Filme ${id}`, name: `Série ${id}`, release_date: '2026-01-01', first_air_date: '2026-01-01', poster_path: '/valid.jpg', media_type: 'movie' })
const film = mapTmdb(record(), 'movie')
it('selects exclusive movie/tv rails, separate genres, soap classification and stable browse contexts', () => {
  expect(catalogRailSpecs('movie').every(spec => spec.mediaType === 'movie')).toBe(true)
  expect(catalogRailSpecs('tv').every(spec => spec.mediaType === 'tv')).toBe(true)
  expect(new Set(catalogRailSpecs().map(spec => spec.id)).size).toBe(catalogRailSpecs().length)
  expect(movieGenres[878]).toBe('Ficção científica')
  expect(tvGenres[878]).toBeUndefined()
  expect(tvGenres[10765]).toBe('Ficção científica e fantasia')
  expect(movieGenres[10766]).toBeUndefined()
  const soap = catalogRailSpecs().find(spec => spec.id === 'novelas')!
  expect(soap.genres).toEqual([10766]); expect(soap.genres).not.toContain(18)
  expect(soap.browse).toMatchObject({ railId: 'novelas', mediaType: 'tv', source: 'discover', genres: [10766] })
  const anime = railRequest(catalogRailSpecs().find(spec => spec.id === 'anime')!)
  expect(anime.params).toMatchObject({ with_genres: '16', with_origin_country: 'JP', with_original_language: 'ja' })
})
it('refreshes daily trends after two minutes and sends pt-BR on real TMDB request shapes', async () => {
  const now = Date.now(); const clock = vi.spyOn(Date, 'now').mockReturnValue(now)
  const fetcher = vi.fn().mockResolvedValueOnce({ ok: true, json: async () => ({ results: [record(1)] }) }).mockResolvedValue({ ok: true, json: async () => ({ results: [record(2)] }) })
  vi.stubGlobal('fetch', fetcher)
  const provider = new TmdbCatalogProvider('test')
  expect((await provider.home()).data[0].id).toBe('tmdb-movie-1')
  await provider.home(); expect(fetcher).toHaveBeenCalledTimes(1)
  clock.mockReturnValue(now + 120001)
  expect((await provider.home()).data[0].id).toBe('tmdb-movie-2')
  expect((fetcher.mock.calls[0][0] as URL).searchParams.get('language')).toBe('pt-BR')
})
it('bounds concurrency to three, deduplicates identical calls and does not poison shared work after one cancellation', async () => {
  const cache = new CatalogRequestCache()
  const releases: (() => void)[] = []
  let active = 0, maximum = 0
  const load = vi.fn(() => new Promise<number>(resolve => { active++; maximum = Math.max(maximum, active); releases.push(() => { active--; resolve(1) }) }))
  const controller = new AbortController()
  const cancelled = cache.read('same', load, 1000, controller.signal).catch(() => 'aborted')
  const duplicate = cache.read('same', load, 1000)
  const rest = [1, 2, 3, 4].map(id => cache.read(String(id), load, 1000))
  controller.abort()
  expect(await cancelled).toBe('aborted')
  expect(load).toHaveBeenCalledTimes(3)
  while (releases.length || active) { releases.splice(0).forEach(release => release()); await new Promise(resolve => setTimeout(resolve, 0)) }
  await Promise.all([duplicate, ...rest])
  expect(load).toHaveBeenCalledTimes(5); expect(maximum).toBe(3)
})
it('uses bounded stale data on outage without extending its freshness', async () => {
  let now = 0; const cache = new CatalogRequestCache(() => now)
  await cache.read('rail', async () => 42, 1000)
  now = 1001
  expect(await cache.read('rail', async () => { throw new Error('offline') }, 1000)).toEqual({ data: 42, stale: true })
  now = 30 * 60000 + 1
  await expect(cache.read('rail', async () => { throw new Error('offline') }, 1000)).rejects.toThrow('offline')
})
function progressive() {
  const pending: { id: string; resolve(value: CatalogResult<CatalogRail>): void }[] = []
  const specs = catalogRailSpecs('movie')
  const provider: CatalogProvider = {
    home: async () => ({ data: [film], origin: 'tmdb' }), search: async () => ({ data: [], origin: 'tmdb' }), detail: async () => ({ data: film, origin: 'tmdb' }), episodes: async () => ({ data: [], origin: 'tmdb' }),
    railSpecs: () => specs, rail: vi.fn(spec => new Promise<CatalogResult<CatalogRail>>(resolve => pending.push({ id: spec.id, resolve }))),
  }
  return { provider, pending, specs }
}
it('shows partial rails and skeletons, hides empty rails and loads the next batch only on demand', async () => {
  const { provider, pending, specs } = progressive()
  render(<MemoryRouter><LibraryProvider><Home provider={provider} kind="movie" /></LibraryProvider></MemoryRouter>)
  await screen.findByRole('heading', { name: /Filmes em alta hoje/ })
  expect(provider.rail).toHaveBeenCalledTimes(3)
  expect(screen.getByRole('status', { name: /Carregando Em alta na semana/ })).toBeInTheDocument()
  await act(async () => pending[0].resolve({ data: { id: specs[1].id, title: specs[1].title, items: [{ ...film, id: 'tmdb-movie-2', title: 'Outro filme' }] }, origin: 'tmdb' }))
  expect(provider.rail).toHaveBeenCalledTimes(4)
  expect(screen.getByRole('heading', { name: /Em alta na semana/ })).toBeInTheDocument()
  await act(async () => { for (let index = 1; index < 4; index++) pending[index].resolve({ data: { id: pending[index].id, title: 'Empty', items: [] }, origin: 'tmdb' }) })
  expect(screen.queryByRole('heading', { name: 'Empty' })).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Descobrir mais categorias' }))
  expect(provider.rail).toHaveBeenCalledTimes(7)
})
it('preserves successful rails when another fails and offers retry', async () => {
  const { provider, pending, specs } = progressive()
  render(<MemoryRouter><LibraryProvider><Home provider={provider} /></LibraryProvider></MemoryRouter>)
  await screen.findByRole('heading', { name: /Em alta hoje/ })
  await act(async () => {
    pending[0].resolve({ data: { id: specs[1].id, title: specs[1].title, items: [{ ...film, id: 'tmdb-movie-2', title: 'Outro filme' }] }, origin: 'tmdb' })
    pending[1].resolve({ data: { id: specs[2].id, title: specs[2].title, items: [] }, origin: 'fallback', notice: 'offline' })
  })
  expect(screen.getByRole('heading', { name: /Em alta na semana/ })).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }))
  await waitFor(() => expect(provider.rail).toHaveBeenCalledTimes(5))
})
