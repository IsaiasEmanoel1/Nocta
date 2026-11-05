import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router'
import { Watch } from '../pages/Watch'
import type { CatalogProvider, Episode, Media } from '../domain/media'
import type { PlaybackProvider, PlaybackRequest, PlaybackSession } from '../services/playback'
import { episodeSequence, nearEpisodeEnd, playbackPath, progressKey, selectionFromUrl } from '../domain/episodes'
import { LibraryProvider, readLibrary, STORAGE_KEY } from '../state/library'
import { usePlaybackSession } from '../hooks/usePlaybackSession'
import { playbackCapabilities } from '../services/playback'

beforeEach(() => { vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(); vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {}) })

const media: Media = {
  id: 'test-series', kind: 'tv', title: 'Série de teste autorizada', overview: 'Metadados locais de teste.',
  year: 2026, rating: 8, genres: ['Drama'], genreIds: [], poster: '/art/poster-1.svg', backdrop: '/art/scene-0.svg',
  cast: [], source: 'fiction', seasons: [{ id: 1, number: 1, name: 'Temporada 1', episodeCount: 2 }, { id: 2, number: 2, name: 'Temporada 2', episodeCount: 1 }],
}
const episodes = (season: number): Episode[] => (season === 1 ? [1, 2] : [1]).map(number => ({
  id: 9000 + season * 100 + number, number, name: `Capítulo ${season}.${number}`, overview: '', runtime: 30,
}))
function catalogMock(): CatalogProvider {
  return { detail: vi.fn(async () => ({ data: media, origin: 'demo' as const })),
    episodes: vi.fn(async (_media: Media, season: number) => ({ data: episodes(season), origin: 'demo' as const })),
    home: vi.fn(async () => ({ data: [media], origin: 'demo' as const })), search: vi.fn(async () => ({ data: [media], origin: 'demo' as const })),
  }
}
function session(request: PlaybackRequest, iframe = false): PlaybackSession {
  return { id: request.mediaId, title: `Episódio ${request.episodeNumber}`, poster: '/art/scene-0.svg',
    sources: iframe ? [] : [{ src: `https://example.invalid/authorized-${request.seasonNumber}-${request.episodeNumber}.mp4`, type: 'video/mp4' }],
    isIframe: iframe, iframeUrl: iframe ? `https://example.invalid/player/${request.seasonNumber}/${request.episodeNumber}` : undefined,
    attribution: 'Sessão sintética, sem acesso à rede.', sourceLabel: 'Fornecedor simulado.',
    license: { name: 'Autorização de teste', url: 'https://example.invalid', projectUrl: 'https://example.invalid' },
  }
}
function Location() { return <output data-testid="location">{useLocation().pathname}{useLocation().search}</output> }
function mount(iframe = false, route = '/assistir/test-series', custom?: PlaybackProvider) {
  const resolve = vi.fn(async (request: PlaybackRequest) => session(request, iframe))
  const catalog = catalogMock()
  const view = render(<LibraryProvider><MemoryRouter initialEntries={['/', route]}><Routes>
    <Route path="/assistir/:id" element={<><Watch provider={custom ?? { resolve }} catalogProvider={catalog} /><Location /></>} />
  </Routes></MemoryRouter></LibraryProvider>)
  return { ...view, resolve, catalog }
}
async function videoReady(container: HTMLElement) {
  await waitFor(() => expect(container.querySelector('video')).not.toBeNull())
  const video = container.querySelector('video')!
  Object.defineProperty(video, 'duration', { configurable: true, value: 300 })
  fireEvent.loadedMetadata(video)
  return video
}

describe('Episode sequence and persistence', () => {
  it('parses only positive safe episode numbers and builds resumable links', () => {
    expect(selectionFromUrl(new URLSearchParams('temporada=0&episodio=2'))).toBeUndefined()
    expect(selectionFromUrl(new URLSearchParams('temporada=1&episodio=2.5'))).toBeUndefined()
    expect(selectionFromUrl(new URLSearchParams('temporada=1&episodio=9007199254740992'))).toBeUndefined()
    expect(playbackPath('test-series', { seasonNumber: 2, episodeNumber: 3 })).toBe('/assistir/test-series?temporada=2&episodio=3')
  })
  it('uses episode numbers rather than database IDs and crosses the season boundary', async () => {
    const catalog = catalogMock(), signal = new AbortController().signal
    expect((await episodeSequence(media, { seasonNumber: 1, episodeNumber: 1 }, catalog, signal)).next).toEqual({ seasonNumber: 1, episodeNumber: 2 })
    expect((await episodeSequence(media, { seasonNumber: 1, episodeNumber: 2 }, catalog, signal)).next).toEqual({ seasonNumber: 2, episodeNumber: 1 })
    expect((await episodeSequence(media, { seasonNumber: 2, episodeNumber: 1 }, catalog, signal)).next).toBeUndefined()
    expect((await episodeSequence(media, { seasonNumber: 2, episodeNumber: 1 }, catalog, signal)).previous).toEqual({ seasonNumber: 1, episodeNumber: 2 })
    expect((await episodeSequence(media, { seasonNumber: 2, episodeNumber: 1 }, catalog, signal)).status).toBe('complete')
    expect((await episodeSequence(media, { seasonNumber: 1, episodeNumber: 99 }, catalog, signal)).next).toBeUndefined()
    expect((await episodeSequence(media, { seasonNumber: 1, episodeNumber: 99 }, catalog, signal)).status).toBe('missing')
  })
  it('uses the final 35 seconds without guessing missing or invalid duration', () => {
    expect(nearEpisodeEnd({ positionSeconds: 264, durationSeconds: 300 })).toBe(false)
    expect(nearEpisodeEnd({ positionSeconds: 265, durationSeconds: 300 })).toBe(true)
    expect(nearEpisodeEnd({ positionSeconds: 1, durationSeconds: 30 })).toBe(false)
    expect(nearEpisodeEnd({ positionSeconds: 25, durationSeconds: 30 })).toBe(true)
    for (const durationSeconds of [NaN, Infinity, 0, -10]) expect(nearEpisodeEnd({ positionSeconds: 20, durationSeconds })).toBe(false)
    expect(nearEpisodeEnd({ positionSeconds: 0, durationSeconds: 30 })).toBe(false)
  })
  it('reads legacy movie history alongside independent episode history and rejects mismatched keys', () => {
    const episode = { seasonNumber: 1, episodeNumber: 2 }, movie = { ...media, id: 'demo-bunny', kind: 'movie' }
    const progress = { media, positionMs: 20000, durationMs: 60000, updatedAt: 1, episode }
    const state = readLibrary({ getItem: () => JSON.stringify({ version: 1, favorites: [media], progress: {
      [movie.id]: { ...progress, media: movie, episode: undefined },
      [progressKey(media.id, episode)]: progress,
      'test-series:s1:e3': progress,
    } }) })
    expect(Object.keys(state.progress)).toEqual(['demo-bunny', 'test-series:s1:e2'])
    expect(state.favorites).toHaveLength(1)
  })
})

it('browses a season without replacing the video, then selects the episode inside the same route', async () => {
  const view = mount(), video = await videoReady(view.container)
  await screen.findByRole('button', { name: /Capítulo 1.2/ })
  fireEvent.change(screen.getByLabelText('Selecionar temporada no player'), { target: { value: '2' } })
  fireEvent.click(await screen.findByRole('button', { name: /Capítulo 2.1/ }))
  await waitFor(() => expect(view.resolve).toHaveBeenLastCalledWith({ mediaId: media.id, seasonNumber: 2, episodeNumber: 1 }, expect.any(AbortSignal)))
  expect(view.resolve).toHaveBeenCalledTimes(2)
  expect(screen.getByTestId('location')).toHaveTextContent('/assistir/test-series?temporada=2&episodio=1')
  await waitFor(() => expect(view.container.querySelector('video')).not.toBe(video))
})

it('offers a floating next action in the last 35 seconds and saves per-episode progress', async () => {
  const view = mount(), first = await videoReady(view.container)
  await screen.findByRole('button', { name: /Capítulo 1.2/ })
  first.currentTime = 100; fireEvent.timeUpdate(first)
  expect(screen.queryByRole('button', { name: 'Próximo Episódio' })).toBeNull()
  first.currentTime = 265; fireEvent.seeked(first)
  fireEvent.click(await screen.findByRole('button', { name: 'Próximo Episódio' }))
  await waitFor(() => expect(view.container.querySelector('source')).toHaveAttribute('src', 'https://example.invalid/authorized-1-2.mp4'))
  const second = await videoReady(view.container)
  expect(second.currentTime).toBe(0)
  second.currentTime = 5; fireEvent.pause(second)
  await waitFor(() => {
    const progress = JSON.parse(localStorage.getItem(STORAGE_KEY)!).progress
    expect(progress['test-series:s1:e1'].positionMs).toBe(265000)
    expect(progress['test-series:s1:e2'].positionMs).toBe(5000)
  })
})

it('allows opt-out of automatic advance and advances only once when the current video ends', async () => {
  const view = mount(), video = await videoReady(view.container)
  await screen.findByRole('button', { name: /Capítulo 1.2/ })
  const toggle = screen.getByRole('checkbox', { name: 'Reproduzir próximo episódio automaticamente' })
  fireEvent.click(toggle); fireEvent.ended(video)
  expect(view.resolve).toHaveBeenCalledTimes(1)
  fireEvent.click(toggle); fireEvent.ended(video); fireEvent.ended(video)
  await waitFor(() => expect(view.resolve).toHaveBeenCalledTimes(2))
  expect(view.resolve.mock.calls[1][0].episodeNumber).toBe(2)
})

it('keeps the current source after an unavailable episode and retries without leaving the player', async () => {
  let unavailable = true
  const provider: PlaybackProvider = { resolve: vi.fn(async request => request.episodeNumber === 2 && unavailable ? null : session(request)) }
  const view = mount(false, '/assistir/test-series', provider), video = await videoReady(view.container)
  fireEvent.click(await screen.findByRole('button', { name: /Capítulo 1.2/ }))
  expect(await screen.findByRole('alert')).toHaveTextContent('O episódio anterior continua disponível.')
  expect(view.container.querySelector('video')).toBe(video)
  unavailable = false
  fireEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }))
  await waitFor(() => expect(view.container.querySelector('source')).toHaveAttribute('src', 'https://example.invalid/authorized-1-2.mp4'))
})

it('offers manual next for an iframe and ignores invented progress messages', async () => {
  const view = mount(true)
  await waitFor(() => expect(view.container.querySelector('iframe')).not.toBeNull())
  const frame = view.container.querySelector('iframe')!
  await waitFor(()=>expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!).progress['test-series:s1:e1']).toMatchObject({ playbackType: 'iframe', episode: { seasonNumber: 1, episodeNumber: 1 }, completed: false }))
  expect(frame).toHaveAttribute('sandbox', 'allow-scripts allow-same-origin allow-presentation')
  expect(frame).toHaveAttribute('allow', 'autoplay; fullscreen; picture-in-picture; encrypted-media')
  expect(frame).toHaveAttribute('referrerpolicy', 'no-referrer')
  expect(screen.queryByRole('button', { name: 'Ampliar controles' })).toBeNull()
  expect(screen.queryByRole('button', { name: 'Tela cheia' })).toBeNull()
  expect(screen.queryByRole('checkbox')).toBeNull()
  fireEvent(window, new MessageEvent('message', { origin: 'https://example.invalid', data: { currentTime: 299, duration: 300 } }))
  expect(screen.queryByRole('button', { name: 'Próximo Episódio' })).toBeNull()
  fireEvent.click(await screen.findByRole('button', { name: 'Próximo episódio' }))
  await waitFor(() => expect(view.container.querySelector('iframe')).toHaveAttribute('src', 'https://example.invalid/player/1/2'))
  expect(view.container.querySelector('iframe')).not.toBe(frame)
  await waitFor(()=>expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!).progress['test-series:s1:e2']).toMatchObject({ playbackType: 'iframe', episode: { seasonNumber: 1, episodeNumber: 2 }, completed: false }))
  const history = JSON.parse(localStorage.getItem(STORAGE_KEY)!).progress
  expect(history['test-series:s1:e2']).toMatchObject({ playbackType: 'iframe', episode: { seasonNumber: 1, episodeNumber: 2 }, completed: false })
  expect(history['test-series:s1:e2']).not.toHaveProperty('positionMs')
  expect(history['test-series:s1:e1'].completed).toBe(false)
})

it('opens complete details before the episodes without replacing the active player', async () => {
  const view = mount(), video = await videoReady(view.container)
  expect(view.container.querySelector('.watch-details')).toHaveAttribute('open')
  expect(screen.getByRole('heading', { name: 'Sinopse' })).toBeInTheDocument()
  expect(screen.getByText('Metadados locais de teste.')).toBeInTheDocument()
  expect(screen.getByText('2026')).toBeInTheDocument()
  expect(view.container.querySelector('video')).toBe(video)
  const sections = Array.from(view.container.querySelector('.watch-page')!.children)
  expect(sections.indexOf(view.container.querySelector('.watch-details')!)).toBeGreaterThan(sections.indexOf(view.container.querySelector('.watch-episodes')!))
})

it('dismisses the floating prompt while retaining automatic advance on actual end', async () => {
  const view = mount(), video = await videoReady(view.container)
  await screen.findByRole('button', { name: /Capítulo 1.2/ })
  video.currentTime = 270; fireEvent.timeUpdate(video)
  fireEvent.click(await screen.findByRole('button', { name: 'Ocultar sugestão de próximo episódio' }))
  expect(screen.queryByRole('button', { name: 'Próximo Episódio' })).toBeNull()
  video.currentTime = 280; fireEvent.timeUpdate(video)
  expect(screen.queryByRole('button', { name: 'Próximo Episódio' })).toBeNull()
  fireEvent.ended(video)
  await waitFor(() => expect(view.resolve).toHaveBeenCalledTimes(2))
  expect(view.resolve.mock.calls[1][0].episodeNumber).toBe(2)
})

it('does not advance beyond the series finale', async () => {
  const view = mount(false, '/assistir/test-series?temporada=2&episodio=1'), video = await videoReady(view.container)
  await screen.findByRole('button', { name: /Capítulo 2.1/ })
  expect(screen.queryByRole('button', { name: 'Próximo episódio' })).toBeNull()
  fireEvent.ended(video)
  expect(view.resolve).toHaveBeenCalledTimes(1)
  expect(screen.getByText('Você chegou ao último episódio disponível.')).toBeInTheDocument()
})

it('declares iframe limitations without guessing progress, seek or an end event', () => {
  expect(playbackCapabilities(session({ mediaId: media.id }, true))).toEqual({ supportsEndEvent: false, supportsProgress: false, supportsSeek: false, supportsAutoNext: false })
  expect(playbackCapabilities(session({ mediaId: media.id })).supportsAutoNext).toBe(true)
})

it('rejects a known nonexistent episode before asking the playback provider', async () => {
  const view = mount(false, '/assistir/test-series?temporada=1&episodio=99')
  expect(await screen.findByRole('alert')).toHaveTextContent('Este episódio não consta nesta temporada.')
  expect(view.resolve).not.toHaveBeenCalled()
  fireEvent.click(await screen.findByRole('button', { name: /Capítulo 1.2/ }))
  await videoReady(view.container)
  expect(view.resolve).toHaveBeenLastCalledWith({ mediaId: media.id, seasonNumber: 1, episodeNumber: 2 }, expect.any(AbortSignal))
})

it('offers a cancellable countdown once and allows immediate next without duplicate transitions', async () => {
  const view = mount(), video = await videoReady(view.container)
  await screen.findByRole('button', { name: /Capítulo 1.2/ })
  fireEvent.click(screen.getByRole('checkbox', { name: 'Contagem regressiva antes do próximo episódio' }))
  video.currentTime = 300
  fireEvent.ended(video); fireEvent.ended(video)
  expect(screen.getByText('Próximo episódio em 5s')).toBeInTheDocument()
  expect(view.resolve).toHaveBeenCalledTimes(1)
  fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }))
  expect(screen.queryByRole('button', { name: 'Próximo agora' })).toBeNull()
  expect(view.resolve).toHaveBeenCalledTimes(1)
  fireEvent.click(screen.getByRole('button', { name: 'Próximo episódio' }))
  await waitFor(() => expect(view.resolve).toHaveBeenCalledTimes(2))
})

it('reports blocked autoplay after crossing a season and leaves native playback available', async () => {
  vi.mocked(HTMLMediaElement.prototype.play).mockRejectedValue(new Error('NotAllowedError'))
  const view = mount(false, '/assistir/test-series?temporada=1&episodio=2'), video = await videoReady(view.container)
  await screen.findByRole('button', { name: 'Próximo episódio' })
  fireEvent.ended(video)
  await waitFor(() => expect(view.container.querySelector('video')).not.toBe(video))
  const next = await videoReady(view.container)
  expect(await screen.findByText('Toque em reproduzir para continuar.')).toBeInTheDocument()
  expect(next).toHaveAttribute('controls')
  expect(view.resolve).toHaveBeenLastCalledWith({ mediaId: media.id, seasonNumber: 2, episodeNumber: 1 }, expect.any(AbortSignal))
})

it('advances immediately from the optional countdown only once', async () => {
  const view = mount(), video = await videoReady(view.container)
  await screen.findByRole('button', { name: /Capítulo 1.2/ })
  fireEvent.click(screen.getByRole('checkbox', { name: 'Contagem regressiva antes do próximo episódio' }))
  fireEvent.ended(video)
  fireEvent.click(screen.getByRole('button', { name: 'Próximo agora' }))
  await waitFor(() => expect(view.resolve).toHaveBeenCalledTimes(2))
  expect(screen.queryByRole('button', { name: 'Cancelar' })).toBeNull()
})

it('restores the opened iframe episode on app reentry without fake completion', async () => {
  const firstView = mount(true, '/assistir/test-series?temporada=1&episodio=2')
  await waitFor(() => expect(firstView.container.querySelector('iframe')).not.toBeNull())
  firstView.unmount()
  const secondView = mount(true)
  await waitFor(() => expect(secondView.container.querySelector('iframe')).toHaveAttribute('src', 'https://example.invalid/player/1/2'))
  expect(secondView.resolve).toHaveBeenLastCalledWith({ mediaId: media.id, seasonNumber: 1, episodeNumber: 2 }, expect.any(AbortSignal))
  expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!).progress['test-series:s1:e2']).not.toHaveProperty('positionMs')
})

it('ignores a stale provider response after a newer request succeeded', async () => {
  let releaseFirst!: (value: PlaybackSession) => void
  const provider: PlaybackProvider = { resolve: request => request.episodeNumber === 1 ? new Promise(resolve => { releaseFirst = resolve }) : Promise.resolve(session(request)) }
  function Harness({ number }: { number: number }) { const state = usePlaybackSession(media.id, { seasonNumber: 1, episodeNumber: number }, provider); return <output>{state.active?.session.title}</output> }
  const view = render(<Harness number={1} />)
  await waitFor(() => expect(releaseFirst).toBeTypeOf('function'))
  view.rerender(<Harness number={2} />)
  expect(await screen.findByText('Episódio 2')).toBeInTheDocument()
  await act(async () => { releaseFirst(session({ mediaId: media.id, seasonNumber: 1, episodeNumber: 1 })) })
  expect(screen.getByText('Episódio 2')).toBeInTheDocument()
})
