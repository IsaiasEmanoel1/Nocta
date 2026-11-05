import { catalogRailSpecs } from '../config/catalogRails'
import { describe, expect, it, vi } from 'vitest'
import { DemoCatalogProvider, TmdbCatalogProvider, UnconfiguredCatalogProvider, filterMedia, mapTmdb } from '../services/catalog'
import { fictionalCatalog } from '../data/fixtures'
describe('Catalog providers', () => {
  it('searches without accents and combines kind, year and genre filters', async () => {
    const provider = new DemoCatalogProvider()
    const result = await provider.search('orbita', { kind: 'tv', year: 2026, genre: 'Ficção científica' })
    expect(result.data.map(m => m.title)).toEqual(['Órbita'])
    expect(result.origin).toBe('demo')
    expect(filterMedia(fictionalCatalog, '', { sort: 'rating' })[0].rating).toBe(9.1)
  })
  it('maps TMDB metadata with namespaced IDs and empty field fallbacks', () => {
    const result = mapTmdb({ id: 42, name: 'Teste', first_air_date: '2020-05-01', genre_ids: [18] }, 'tv')
    expect(result.id).toBe('tmdb-tv-42')
    expect(result.year).toBe(2020)
    expect(result.genres).toEqual(['Drama'])
    expect(result.source).toBe('tmdb')
    expect(result.cast).toEqual([])
  })
  it('requests TMDB with configured parameters and excludes people in search', async () => {
    const fetcher = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ results: [{ id: 1, media_type: 'person', name: 'Pessoa' }, { id: 2, media_type: 'movie', title: 'Um filme', release_date: '2025-01-01', poster_path: '/poster.jpg', genre_ids: [18] }] }) })
    vi.stubGlobal('fetch', fetcher)
    const result = await new TmdbCatalogProvider('test-only').search('um filme', { kind: 'movie', genre: 'Drama' })
    expect(result.data.map(m => m.id)).toEqual(['tmdb-movie-2'])
    const url = fetcher.mock.calls[0][0] as URL
    expect(url.searchParams.get('language')).toBe('pt-BR')
    expect(url.searchParams.get('include_adult')).toBe('false')
  })
  it('returns an empty catalog on outage and never inserts demo titles', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))
    const provider = new TmdbCatalogProvider('test-only')
    const home = await provider.home('movie')
    expect(home.origin).toBe('fallback')
    expect(home.notice).toContain('indisponível')
    expect(home.data).toEqual([])
    expect((await provider.detail('tmdb-movie-42')).data).toBeNull()
    expect((await provider.detail('demo-bunny')).data).toBeNull()
  })
  it('loads independent season lists', async () => {
    const provider = new DemoCatalogProvider()
    const series = fictionalCatalog.find(m => m.kind === 'tv')!
    expect((await provider.episodes(series, 1)).data).toHaveLength(6)
    expect((await provider.episodes(series, 2)).data).toHaveLength(4)
    expect((await provider.episodes(series, 999)).data).toHaveLength(0)
  })
  it('requires configuration instead of exposing demo fixtures', async () => {
    const provider = new UnconfiguredCatalogProvider()
    expect((await provider.home()).data).toEqual([])
    expect((await provider.search()).data).toEqual([])
    expect((await provider.detail()).data).toBeNull()
    expect((await provider.home()).notice).toContain('VITE_TMDB_API_KEY')
  })
  it('uses daily trends in TMDB order and removes invalid records, people, adult titles and duplicates', async () => {
    const movie = { id: 4, media_type: 'movie', title: 'Primeiro', release_date: '2026-01-01', poster_path: '/valid.jpg', vote_average: 6 }
    const series = { id: 5, media_type: 'tv', name: 'Segundo', first_air_date: '2025-01-01', poster_path: '/valid.jpg', vote_average: 9 }
    const fetcher = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ results: [movie, series, movie,
      { ...movie, id: 6, poster_path: null }, { ...movie, id: 7, title: ' ' }, { ...movie, id: 8, adult: true },
      { ...movie, id: -1 }, { ...movie, id: 10, release_date: '' }, { id: 11, media_type: 'person', name: 'Pessoa' }] }) })
    vi.stubGlobal('fetch', fetcher)
    const result = await new TmdbCatalogProvider('test-only').home()
    expect((fetcher.mock.calls[0][0] as URL).pathname).toBe('/3/trending/all/day')
    expect(result.data.map(m => m.id)).toEqual(['tmdb-movie-4', 'tmdb-tv-5'])
  })
  it('requests dedicated thematic categories and keeps successful rails when one fails', async () => {
    const fetcher = vi.fn(async (url: URL) => {
      if (url.searchParams.get('with_genres') === '18') return { ok: false }
      const tv = url.pathname.endsWith('/tv')
      return { ok: true, json: async () => ({ results: [{ id: tv ? 8 : 7, title: 'Filme', name: 'Série', release_date: '2026-01-01', first_air_date: '2026-01-01', poster_path: '/valid.jpg' }] }) }
    })
    vi.stubGlobal('fetch', fetcher)
    const result = await new TmdbCatalogProvider('test-only').collections()
    expect(result.data.map(rail => rail.id)).toContain('action')
    expect(result.data.map(rail => rail.id)).toContain('anime')
    expect(result.data.map(rail => rail.id)).not.toContain('drama')
    expect(result.notice).toContain('Algumas categorias')
    const anime = fetcher.mock.calls.map(call => call[0]).find(url => url.searchParams.get('with_origin_country') === 'JP')!
    expect(anime.searchParams.get('with_origin_country')).toBe('JP')
    expect(anime.searchParams.get('with_original_language')).toBe('ja')
    expect(anime.searchParams.get('sort_by')).toBe('popularity.desc')
    fetcher.mockClear()
    await new TmdbCatalogProvider('test-only').collections('movie')
    expect(fetcher.mock.calls).toHaveLength(catalogRailSpecs('movie').length - 1)
    expect(fetcher.mock.calls.every(([url]) => !url.pathname.includes('/tv'))).toBe(true)
  })
  it('falls back to popular metadata when the trending endpoint fails', async () => {
    const fetcher = vi.fn(async (url: URL) => ({ ok: !url.pathname.includes('trending'), json: async () => ({ results: [{ id: 55, title: 'Popular', release_date: '2026-01-01', poster_path: '/valid.jpg' }] }) }))
    vi.stubGlobal('fetch', fetcher)
    const result = await new TmdbCatalogProvider('test-only').home('movie')
    expect(fetcher.mock.calls.map(([url]) => url.pathname)).toEqual(['/3/trending/movie/day', '/3/movie/popular'])
    expect(result.data[0].id).toBe('tmdb-movie-55')
  })
})
