import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { expect, it, vi } from 'vitest'
import { CachedAvailabilityService, availabilityService } from '../services/availability'
import { AvailabilityGuardedProvider, DemoPlaybackProvider, HybridPlaybackProvider, playbackProvider } from '../services/playback'
import { EmbedMovieProvider } from '../services/embedwave'
import { reportMediaFailure, clearMediaFailure } from '../services/mediaAvailability'
import { DemoCatalogProvider, catalog } from '../services/catalog'
import { Watch } from '../pages/Watch'
import { Details } from '../pages/Details'
import { LibraryProvider } from '../state/library'

const title = { mediaId: 'tmdb-movie-88001' }
const episode = { mediaId: 'tmdb-tv-88001', episode: { seasonNumber: 2, episodeNumber: 3 } }
const evidence = (status: 'available' | 'unavailable' | 'unknown') => ({ status, source: 'controlled-test-evidence', ttlMs: 1000 })
it('supports unknown, checking, available, expiration and forced revalidation', async () => {
  let now = Date.now()
  let release!: (value: ReturnType<typeof evidence>) => void
  const checker = vi.fn(() => new Promise<ReturnType<typeof evidence>>(resolve => { release = resolve }))
  const service = new CachedAvailabilityService(checker, () => now)
  expect(service.peek(episode).status).toBe('unknown')
  const pending = service.check(episode)
  expect(service.peek(episode).status).toBe('checking')
  release(evidence('available'))
  const result = await pending
  expect(result).toMatchObject({ status: 'available', source: 'controlled-test-evidence', checkedAt: now, expiresAt: now + 1000 })
  await service.check(episode)
  expect(checker).toHaveBeenCalledTimes(1)
  now += 1001
  expect(service.peek(episode).status).toBe('unknown')
  const expired = service.check(episode); release(evidence('unavailable')); await expired
  expect(checker).toHaveBeenCalledTimes(2)
  const forced = service.check(episode, { force: true }); release(evidence('available')); await forced
  expect(checker).toHaveBeenCalledTimes(3)
})
it('caches network errors briefly and recovers on a forced retry', async () => {
  const checker = vi.fn().mockRejectedValueOnce(new TypeError('network unavailable')).mockResolvedValue(evidence('available'))
  const service = new CachedAvailabilityService(checker)
  expect((await service.check(title)).status).toBe('error')
  expect((await service.check(title)).status).toBe('error')
  expect(checker).toHaveBeenCalledTimes(1)
  expect((await service.check(title, { force: true })).status).toBe('available')
})
it('isolates episode failures from the series and other episodes', async () => {
  const service = new CachedAvailabilityService(async request => evidence(request.episode?.episodeNumber === 3 ? 'unavailable' : 'unknown'))
  expect((await service.check(episode)).status).toBe('unavailable')
  expect((await service.check(title)).status).toBe('unknown')
  expect((await service.check({ ...episode, episode: { seasonNumber: 2, episodeNumber: 4 } })).status).toBe('unknown')
})
it('current supplier stays unknown without probing any player or inventing inventory requests', async () => {
  const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher)
  expect((await availabilityService.check(title, { force: true })).status).toBe('unknown')
  expect((await playbackProvider.resolve(title))?.isIframe).toBe(true)
  expect((await new EmbedMovieProvider({ termsApproved: false, termsReference: '', grants: [] }).assess({ kind: 'movie', tmdbId: 88001 }, { origin: 'https://example.invalid', territory: 'BR' })).status).toBe('denied')
  reportMediaFailure(episode.mediaId, episode.episode)
  expect((await availabilityService.check(episode, { force: true })).status).toBe('unavailable')
  expect((await availabilityService.check(title, { force: true })).status).toBe('unknown')
  clearMediaFailure(episode.mediaId, episode.episode)
  expect(fetcher).not.toHaveBeenCalled()
})
it.each(['unknown', 'unavailable', 'error'] as const)('never resolves or starts media/ad when status is %s', async status => {
  const adapter = { resolve: vi.fn() }
  const service = new CachedAvailabilityService(async () => { if (status === 'error') throw new Error('network'); return evidence(status) })
  await expect(new AvailabilityGuardedProvider(adapter, service).resolve({ mediaId: title.mediaId })).rejects.toThrow()
  expect(adapter.resolve).not.toHaveBeenCalled()
})
it('rechecks before playback even with a fresh available cache', async () => {
  const checker = vi.fn().mockResolvedValueOnce(evidence('available')).mockResolvedValue(evidence('unavailable'))
  const service = new CachedAvailabilityService(checker)
  await service.check(title)
  const adapter = { resolve: vi.fn() }
  await expect(new AvailabilityGuardedProvider(adapter, service).resolve(title)).rejects.toThrow('indisponível')
  expect(checker).toHaveBeenCalledTimes(2)
  expect(adapter.resolve).not.toHaveBeenCalled()
})
it('exercises a synthetic confirmed sample through Watch using simulated HTML5 progress only', async () => {
  const service = new CachedAvailabilityService(async () => evidence('available'))
  const provider = new AvailabilityGuardedProvider(new DemoPlaybackProvider(), service)
  const view = render(<LibraryProvider><MemoryRouter initialEntries={['/assistir/demo-bunny']}><Routes><Route path="/assistir/:id" element={<Watch provider={provider} catalogProvider={new DemoCatalogProvider()} />} /></Routes></MemoryRouter></LibraryProvider>)
  await waitFor(() => expect(view.container.querySelector('video')).not.toBeNull())
  const video = view.container.querySelector('video')!
  Object.defineProperty(video, 'duration', { value: 100, configurable: true })
  video.currentTime = 20; fireEvent.playing(video); fireEvent.pause(video)
  await waitFor(() => expect(JSON.parse(localStorage.getItem('nocta.library.v2')!).progress['demo-bunny'].positionMs).toBe(20000))
})
it('Details shows honest status, keeps exploration and offers retry after error', async () => {
  vi.spyOn(catalog, 'detail').mockImplementation(id => new DemoCatalogProvider().detail(id))
  vi.spyOn(availabilityService, 'check').mockResolvedValueOnce({ key: 'fiction-1', status: 'error', source: 'test', checkedAt: Date.now(), expiresAt: Date.now() + 10000 })
    .mockResolvedValue({ key: 'fiction-1', status: 'unknown', source: 'test', checkedAt: Date.now(), expiresAt: Date.now() + 10000 })
  render(<LibraryProvider><MemoryRouter initialEntries={['/titulo/fiction-1']}><Routes><Route path="/titulo/:id" element={<Details />} /></Routes></MemoryRouter></LibraryProvider>)
  expect(await screen.findByText(/Não foi possível verificar a disponibilidade/)).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Verificar novamente' }))
  expect(await screen.findByText('Disponibilidade não confirmada')).toBeInTheDocument()
  expect(screen.queryByRole('link', { name: 'Assistir Agora' })).toBeNull()
  expect(screen.getByRole('link', { name: 'Explorar títulos do mesmo gênero' })).toBeInTheDocument()
})
it('a direct Watch route cannot bypass confirmation and invented iframe messages do not unlock it', async () => {
  const provider = new AvailabilityGuardedProvider(new HybridPlaybackProvider(), new CachedAvailabilityService(async () => evidence('unknown')))
  const view = render(<LibraryProvider><MemoryRouter initialEntries={['/assistir/demo-bunny']}><Routes><Route path="/assistir/:id" element={<Watch provider={provider} catalogProvider={new DemoCatalogProvider()} />} /></Routes></MemoryRouter></LibraryProvider>)
  expect(await screen.findByRole('alert')).toHaveTextContent('Disponibilidade não confirmada')
  act(() => window.dispatchEvent(new MessageEvent('message', { data: { event: 'playing' } })))
  expect(view.container.querySelector('iframe, video')).toBeNull()
})
