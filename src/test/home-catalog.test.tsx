import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, expect, it, vi } from 'vitest'
import { Home } from '../pages/Home'
import { LibraryProvider, STORAGE_KEY } from '../state/library'
import { mapTmdb } from '../services/catalog'
import { clearMediaFailure, isMediaUnavailable, reportMediaFailure } from '../services/mediaAvailability'
import { demoCatalog } from '../data/fixtures'
import type { CatalogProvider, Media } from '../domain/media'
import { VideoPlayer } from '../components/VideoPlayer'

const movie = mapTmdb({ id: 98001, title: 'Título de teste', release_date: '2026-01-01', poster_path: '/poster.jpg', backdrop_path: '/backdrop.jpg' }, 'movie')
const series = mapTmdb({ id: 98002, name: 'Série de teste', first_air_date: '2026-01-01', poster_path: '/poster.jpg' }, 'tv')
const provider: CatalogProvider = {
  home: async () => ({ data: [movie, series, demoCatalog[0]], origin: 'tmdb' }),
  collections: async () => ({ data: [{ id: 'action', title: 'Filmes de Ação', items: [movie, { ...movie, id: 'tmdb-movie-98003', title: 'Outro filme' }] }, { id: 'anime', title: 'Animes', items: [series, { ...series, id: 'tmdb-tv-98004', title: 'Outro anime' }] }], origin: 'tmdb' }),
  search: async () => ({ data: [], origin: 'tmdb' }), detail: async () => ({ data: null, origin: 'tmdb' }), episodes: async () => ({ data: [], origin: 'tmdb' }),
}
function mount(catalog = provider) { return render(<MemoryRouter><LibraryProvider><Home provider={catalog} /></LibraryProvider></MemoryRouter>) }
function progress(media: Media, updatedAt: number, positionMs = 20000) { return { media, positionMs, durationMs: 100000, updatedAt } }
afterEach(() => { clearMediaFailure(movie.id); clearMediaFailure(series.id, { seasonNumber: 1, episodeNumber: 2 }) })

it('shows real metadata and thematic rails without any demo section', async () => {
  const view = mount()
  expect(await screen.findByRole('heading', { name: /Em alta hoje/ })).toBeInTheDocument()
  expect(screen.getByRole('heading', { name: /Filmes de Ação/ })).toBeInTheDocument()
  expect(screen.getByRole('heading', { name: /Animes/ })).toBeInTheDocument()
  expect(screen.queryByText(/Big Buck Bunny|Cinema aberto|Sintel/i)).toBeNull()
  expect(view.container.querySelector('.hero-play')).toHaveAttribute('href', '/assistir/tmdb-movie-98001')
  expect(Array.from(view.container.querySelectorAll<HTMLAnchorElement>('.poster-link')).every(link => link.pathname.startsWith('/assistir/tmdb-'))).toBe(true)
})

it('renders trends immediately even when thematic requests are still pending', async () => {
  mount({ ...provider, collections: () => new Promise(() => {}) })
  expect(await screen.findByRole('heading', { name: /Em alta hoje/ })).toBeInTheDocument()
})

it('shows each title in only one rail while preserving complete browse links', async () => {
  const extra = (id: number) => ({ ...movie, id: `tmdb-movie-${id}`, title: `Filme ${id}` })
  const view = mount({ ...provider, collections: async () => ({ origin: 'tmdb', data: [
    { id: 'popular', title: 'Populares', items: [movie, extra(98010)], browse: { railId: 'movie-popular', mediaType: 'movie', source: 'popular' } },
    { id: 'action', title: 'Ação', items: [movie, extra(98010), extra(98011)] },
    { id: 'duplicate', title: 'Somente repetidos', items: [movie] },
  ] }) })
  await screen.findByRole('heading', { name: /Populares/ })
  const cards = Array.from(view.container.querySelectorAll<HTMLAnchorElement>('.carousel .poster-link')).map(link => link.pathname)
  expect(new Set(cards).size).toBe(cards.length)
  expect(cards).toContain('/assistir/tmdb-movie-98011')
  expect(screen.queryByRole('heading', { name: /Somente repetidos/ })).toBeNull()
  const section = screen.getByRole('heading', { name: /Populares/ }).closest('section')!
  expect(within(section).getByRole('link', { name: /Ver todos/ })).toHaveAttribute('href', expect.stringContaining('/buscar?'))
})

it('puts resume first, keeps the latest episode per series and preserves stored history', async () => {
  const stored = { version: 1, favorites: [], progress: {
    [movie.id]: progress(movie, 1),
    [`${series.id}:s1:e1`]: { ...progress(series, 2), episode: { seasonNumber: 1, episodeNumber: 1 } },
    [`${series.id}:s1:e2`]: { ...progress(series, 3), episode: { seasonNumber: 1, episodeNumber: 2 } },
    [demoCatalog[0].id]: progress(demoCatalog[0], 4),
  } }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(stored))
  const view = mount()
  const resume = screen.getByRole('region', { name: 'Continue assistindo' })
  expect(view.container.querySelector('.home-content > section')).toBe(resume)
  expect(view.container.querySelector('.home-content')?.firstElementChild).toHaveClass('discovery-bar')
  expect(resume.previousElementSibling).toHaveClass('discovery-bar')
  expect(within(resume).queryByRole('button', { name: 'Marcar como assistido' })).toBeNull()
  expect(within(resume).getAllByRole('img')[0]).toHaveAttribute('src', series.poster)
  const links = within(resume).getAllByRole('link', { name: /^Continuar / })
  expect(links).toHaveLength(2)
  expect(links[0]).toHaveAttribute('href', '/assistir/tmdb-tv-98002?temporada=1&episodio=2')
  expect(within(resume).queryByText('Big Buck Bunny')).toBeNull()
  await waitFor(() => expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!).progress).toEqual(stored.progress))
})

it('keeps resume available when the remote catalog fails and excludes completed items', async () => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, favorites: [], progress: {
    [movie.id]: progress(movie, 1), [series.id]: progress(series, 2, 99000),
  } }))
  mount({ ...provider, home: async () => { throw new Error('offline') }, collections: async () => ({ data: [], origin: 'tmdb' }) })
  expect(screen.getByRole('link', { name: `Continuar ${movie.title}` })).toBeInTheDocument()
  expect(screen.queryByRole('link', { name: `Continuar ${series.title}` })).toBeNull()
  expect(await screen.findByText(/O catálogo está temporariamente/)).toBeInTheDocument()
})

it('does not resume an older episode after the latest saved episode was completed', () => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, favorites: [], progress: {
    [`${series.id}:s1:e1`]: { ...progress(series, 1), episode: { seasonNumber: 1, episodeNumber: 1 } },
    [`${series.id}:s1:e2`]: { ...progress(series, 2, 99000), episode: { seasonNumber: 1, episodeNumber: 2 } },
  } }))
  mount()
  expect(screen.queryByRole('region', { name: 'Continue assistindo' })).toBeNull()
})

it('hides known unavailable titles in every main rail and restores them after a successful retry', async () => {
  const view = mount()
  await screen.findByRole('heading', { name: /Em alta hoje/ })
  act(() => reportMediaFailure(movie.id))
  expect(view.container.querySelectorAll('a[href="/assistir/tmdb-movie-98001"]')).toHaveLength(0)
  act(() => clearMediaFailure(movie.id))
  expect(view.container.querySelector('a[href="/assistir/tmdb-movie-98001"]')).not.toBeNull()
})

it('limits exclusions to the affected episode and expires them after 30 minutes', () => {
  const now = Date.now()
  const clock = vi.spyOn(Date, 'now').mockReturnValue(now)
  const episode = { seasonNumber: 1, episodeNumber: 2 }
  reportMediaFailure(series.id, episode)
  expect(isMediaUnavailable(series.id, episode)).toBe(true)
  expect(isMediaUnavailable(series.id)).toBe(false)
  expect(isMediaUnavailable(series.id, { ...episode, episodeNumber: 3 })).toBe(false)
  clock.mockReturnValue(now + 30 * 60 * 1000 + 1)
  expect(isMediaUnavailable(series.id, episode)).toBe(false)
})

it('records confirmed HTML5 source failures, but ignores ordinary network errors', () => {
  const session = { id: movie.id, title: movie.title, sources: [], poster: movie.poster, sourceLabel: 'Teste local', attribution: '', license: { name: 'Teste', url: '', projectUrl: '' } }
  const view = render(<LibraryProvider><VideoPlayer session={session} media={movie} /></LibraryProvider>)
  const video = view.container.querySelector('video')!
  Object.defineProperty(video, 'error', { configurable: true, value: { code: 2 } })
  fireEvent.error(video)
  expect(isMediaUnavailable(movie.id)).toBe(false)
  Object.defineProperty(video, 'error', { configurable: true, value: { code: 4 } })
  fireEvent.error(video)
  expect(isMediaUnavailable(movie.id)).toBe(true)
  fireEvent.playing(video)
  expect(isMediaUnavailable(movie.id)).toBe(false)
})
