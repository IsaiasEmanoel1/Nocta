import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { describe, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'
import type { CatalogProvider, Media, MediaKind } from '../domain/media'
import type { PlaybackProvider, PlaybackSession } from '../services/playback'
import { progressKey } from '../domain/episodes'
import { LEGACY_STORAGE_KEY, LibraryProvider, readLibrary, STORAGE_KEY, useLibrary,knownProgress } from '../state/library'
import { ContinueWatching } from '../components/ContinueWatching'
import { VideoPlayer } from '../components/VideoPlayer'
import { APP_BACKGROUND_EVENT } from '../components/AndroidLifecycle'
import { Home } from '../pages/Home'
import { Library } from '../pages/Library'
import { Watch } from '../pages/Watch'

const movie: Media = {
  id: 'tmdb-movie-99101', kind: 'movie', title: 'Filme sintético', overview: 'Dados locais de teste.',
  year: 2026, rating: 8, genres: ['Drama'], genreIds: [18], poster: '/art/poster-1.svg',
  backdrop: '/art/scene-0.svg', cast: [], source: 'tmdb',
}
const series: Media = { ...movie, id: 'tmdb-tv-99102', kind: 'tv', title: 'Série sintética', seasons: [{ id: 1, number: 1, name: 'Temporada 1', episodeCount: 2 }] }
const first = { seasonNumber: 1, episodeNumber: 1 }, second = { seasonNumber: 1, episodeNumber: 2 }
const episodeKey = (number: number) => progressKey(series.id, { seasonNumber: 1, episodeNumber: number })
const timed = (media = movie, positionMs = 20000) => ({ media, positionMs, durationMs: 100000, updatedAt: 1 })
const persisted = () => JSON.parse(localStorage.getItem(STORAGE_KEY)!)
const emptyCatalog: CatalogProvider = {
  home: async () => ({ data: [], origin: 'tmdb' }), collections: async () => ({ data: [], origin: 'tmdb' }),
  detail: async () => { throw new Error('offline') }, search: async () => ({ data: [], origin: 'tmdb' }),
  episodes: async () => ({ data: [], origin: 'fallback' }),
}
function session(media = movie, iframe = false): PlaybackSession {
  return { id: media.id, title: media.title, poster: media.backdrop, sources: iframe ? [] : [{ src: 'https://example.invalid/synthetic.mp4', type: 'video/mp4' }],
    isIframe: iframe, iframeUrl: iframe ? 'https://example.invalid/synthetic-iframe' : undefined,
    attribution: 'Sessão sintética, sem reprodução externa.', sourceLabel: 'Teste isolado', license: { name: 'Teste', url: '', projectUrl: '' } }
}
let library: ReturnType<typeof useLibrary>
function Probe() { library = useLibrary(); return null }
function mount(children: ReactNode, route = '/') {
  return render(<LibraryProvider><Probe /><MemoryRouter initialEntries={[route]}>{children}</MemoryRouter></LibraryProvider>)
}
function ready(container: HTMLElement, seconds = 100) {
  const video = container.querySelector('video')!
  Object.defineProperty(video, 'duration', { configurable: true, value: seconds })
  fireEvent.loadedMetadata(video)
  return video
}

describe('Migração e persistência do histórico', () => {
  it('restores a source preference without storing URLs and preserves real time across an iframe fallback',()=>{
    mount(<ContinueWatching/>);act(()=>library.saveProgress(series,45000,300000,second));const preference={providerId:'fenixflix' as const,sourceKey:'fenixflix:ab12',engine:'native' as const,format:'matroska' as const,language:'dub' as const,savedAt:Date.now()};act(()=>library.savePlaybackPreference(series,preference,second));act(()=>library.recordIframeOpen(series,second));const restored=readLibrary(localStorage).progress[episodeKey(2)];expect(restored.preference).toEqual(preference);expect(restored.playbackType).toBe('iframe');expect(knownProgress(restored)).toEqual({positionMs:45000,durationMs:300000});expect(restored).not.toHaveProperty('positionMs');expect(document.querySelector('.progress-track')).toBeNull();act(()=>library.saveProgress(series,46000,300000,second));expect(persisted().progress[episodeKey(2)].preference).toEqual(preference)
  })
  it('drops invalid/URL-bearing resume identifiers while keeping the existing title/episode and position',()=>{
    localStorage.setItem(STORAGE_KEY,JSON.stringify({version:2,favorites:[],progress:{[episodeKey(2)]:{...timed(series),episode:second,preference:{providerId:'fenixflix',sourceKey:'https://example.test/private?token=secret',engine:'native',format:'hls',language:'dub',savedAt:1}}}}));const restored=readLibrary(localStorage);expect(restored.progress[episodeKey(2)]).not.toHaveProperty('preference');expect(restored.progress[episodeKey(2)]).toMatchObject({positionMs:20000,episode:second})
  })
  it('migrates v1 without changing its backup, deduplicates favorites and drops broken entries', () => {
    const legacy = JSON.stringify({ version: 1, favorites: [movie, movie, null], progress: {
      [movie.id]: timed(), [episodeKey(1)]: { ...timed(series), episode: first },
      wrongKey: timed(), negative: { ...timed(), positionMs: -1 },
      [episodeKey(2)]: { ...timed(series), episode: { ...second, episodeNumber: 0 } },
    } })
    localStorage.setItem(LEGACY_STORAGE_KEY, legacy)
    mount(<ContinueWatching />)
    expect(library.state.version).toBe(2)
    expect(library.state.favorites).toHaveLength(1)
    expect(Object.keys(library.state.progress)).toEqual([movie.id, episodeKey(1)])
    expect(localStorage.getItem(LEGACY_STORAGE_KEY)).toBe(legacy)
    expect(persisted().version).toBe(2)
  })

  it('recovers a corrupt v2 from v1 and removes invented iframe time fields', () => {
    localStorage.setItem(STORAGE_KEY, '{broken')
    localStorage.setItem(LEGACY_STORAGE_KEY, JSON.stringify({ version: 1, favorites: [], progress: { [movie.id]: timed() } }))
    expect(readLibrary(localStorage).progress[movie.id]).toMatchObject(timed())
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 2, favorites: [], progress: {
      [movie.id]: { ...timed(), playbackType: 'iframe' },
    } }))
    expect(readLibrary(localStorage).progress[movie.id]).toEqual({ media: movie, updatedAt: 1, playbackType: 'iframe' })
  })

  it('persists opened episodes synchronously, restores them on reentry and never invents progress', () => {
    const view = mount(<ContinueWatching />)
    act(() => library.recordIframeOpen(series, second))
    const entry = persisted().progress[episodeKey(2)]
    expect(entry).toMatchObject({ playbackType: 'iframe', episode: second, completed: false })
    expect(entry).not.toHaveProperty('positionMs')
    expect(entry).not.toHaveProperty('durationMs')
    expect(screen.getByText('T1 · E2')).toBeInTheDocument()
    expect(view.container.querySelector('.progress-track')).toBeNull()
    view.unmount()
    mount(<ContinueWatching />)
    expect(screen.getByRole('link', { name: /Continuar Série sintética/ })).toHaveAttribute('href', `/assistir/${series.id}?temporada=1&episodio=2`)
  })

  it('keeps one latest episode per title, filters by type and deletes every old episode when removing a title', () => {
    const clock = vi.spyOn(Date, 'now').mockReturnValue(1)
    function Resume({ kind }: { kind?: MediaKind }) { return <ContinueWatching kind={kind} /> }
    const view = mount(<Resume />)
    act(() => { library.recordIframeOpen(series, first); library.recordIframeOpen(movie) })
    clock.mockReturnValue(2)
    act(() => library.recordIframeOpen(series, second))
    expect(screen.getAllByRole('link', { name: /^Continuar / })).toHaveLength(2)
    expect(screen.getByRole('link', { name: /Continuar Série/ })).toHaveAttribute('href', expect.stringContaining('episodio=2'))
    view.rerender(<LibraryProvider><Probe /><MemoryRouter><Resume kind="tv" /></MemoryRouter></LibraryProvider>)
    expect(screen.queryByRole('link', { name: /Continuar Filme/ })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Remover Série sintética do histórico' })).toBeNull()
    act(() => library.removeMediaHistory(series.id))
    expect(Object.values(library.state.progress).some(entry => entry.media.id === series.id)).toBe(false)
    expect(screen.queryByRole('region')).toBeNull()
    view.rerender(<LibraryProvider><Probe /><MemoryRouter><Resume kind="movie" /></MemoryRouter></LibraryProvider>)
    expect(screen.getByRole('link', { name: /Continuar Filme/ })).toBeInTheDocument()
  })

  it('marks an iframe as watched manually, hides it immediately and restores it only when explicitly reopened', () => {
    mount(<ContinueWatching />)
    act(() => library.recordIframeOpen(series, second))
    expect(screen.queryByRole('button', { name: 'Marcar como assistido' })).toBeNull()
    act(() => library.setCompleted(episodeKey(2), true))
    expect(screen.queryByRole('region')).toBeNull()
    expect(persisted().progress[episodeKey(2)].completed).toBe(true)
    act(() => library.recordIframeOpen(series, second))
    expect(screen.getByText('T1 · E2')).toBeInTheDocument()
    expect(persisted().progress[episodeKey(2)].completed).toBe(false)
  })

  it('clears history without losing favorites or resurrecting the v1 backup on next launch', () => {
    localStorage.setItem(LEGACY_STORAGE_KEY, JSON.stringify({ version: 1, favorites: [movie], progress: { [movie.id]: timed() } }))
    const view = mount(<Library />, '/minha-lista?aba=history')
    fireEvent.click(screen.getByRole('button', { name: 'Limpar histórico' }))
    expect(persisted().progress).toEqual({})
    expect(persisted().favorites).toHaveLength(1)
    expect(localStorage.getItem(LEGACY_STORAGE_KEY)).toBeNull()
    view.unmount()
    mount(<ContinueWatching />)
    expect(screen.queryByRole('region')).toBeNull()
    expect(library.state.favorites).toHaveLength(1)
  })

  it('deletes only the chosen episode from the library and keeps its neighbor intact', () => {
    mount(<Library />, '/minha-lista?aba=history')
    act(() => { library.recordIframeOpen(series, first); library.recordIframeOpen(series, second) })
    // The resume rail removes a whole title; the history grid also offers per-episode deletion.
    fireEvent.click(screen.getByRole('button', { name: 'Excluir Série sintética, temporada 1, episódio 1 do histórico' }))
    expect(Object.keys(persisted().progress)).toEqual([episodeKey(2)])
    expect(screen.getByRole('button', { name: 'Excluir Série sintética, temporada 1, episódio 2 do histórico' })).toBeInTheDocument()
  })

  it('renders offline snapshots at the start of Home/Filmes/Séries and updates Home without reloading', async () => {
    const offline = { ...emptyCatalog, home: async () => { throw new Error('offline') } }
    const view = mount(<Home provider={offline} />)
    act(() => { library.recordIframeOpen(movie); library.recordIframeOpen(series, second) })
    const region = screen.getByRole('region', { name: 'Continue assistindo' })
    expect(view.container.querySelector('.home-content > section')).toBe(region)
    expect(within(region).getAllByRole('link', { name: /^Continuar / })).toHaveLength(2)
    await screen.findByText(/O catálogo está temporariamente indisponível/)
    view.rerender(<LibraryProvider><Probe /><MemoryRouter><Home provider={offline} kind="movie" /></MemoryRouter></LibraryProvider>)
    expect(screen.getByRole('link', { name: /Continuar Filme/ })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /Continuar Série/ })).toBeNull()
    view.rerender(<LibraryProvider><Probe /><MemoryRouter><Home provider={offline} kind="tv" /></MemoryRouter></LibraryProvider>)
    expect(screen.getByRole('link', { name: /Continuar Série/ })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /Continuar Filme/ })).toBeNull()
  })
})

describe('Checkpoints reais de HTML5', () => {
  it('throttles timeupdate, saves pause/background immediately and preserves position after returning', () => {
    const clock = vi.spyOn(Date, 'now').mockReturnValue(10000)
    const view = mount(<VideoPlayer media={movie} session={session()} />), video = ready(view.container)
    const pause = vi.spyOn(video, 'pause').mockImplementation(() => {})
    const writes = vi.spyOn(Storage.prototype, 'setItem')
    video.currentTime = 10; fireEvent.timeUpdate(video)
    video.currentTime = 11; fireEvent.timeUpdate(video)
    expect(writes).toHaveBeenCalledTimes(1)
    clock.mockReturnValue(15000)
    video.currentTime = 15; fireEvent.timeUpdate(video)
    expect(writes).toHaveBeenCalledTimes(2)
    video.currentTime = 17; fireEvent.pause(video)
    expect(persisted().progress[movie.id].positionMs).toBe(17000)
    video.currentTime = 18; fireEvent(window, new Event(APP_BACKGROUND_EVENT))
    expect(pause).toHaveBeenCalledOnce()
    expect(persisted().progress[movie.id].positionMs).toBe(18000)
    fireEvent(window, new Event(APP_BACKGROUND_EVENT))
    fireEvent.pause(video)
    expect(writes).toHaveBeenCalledTimes(4)
    expect(video.currentTime).toBe(18)
    video.currentTime = 22; fireEvent.playing(video); fireEvent.pause(video)
    expect(persisted().progress[movie.id].positionMs).toBe(22000)
  })

  it('saves on hidden/pagehide, on episode replacement and on leaving the player', () => {
    const view = mount(<VideoPlayer key="first" media={series} episode={first} session={session(series)} />)
    const video = ready(view.container)
    vi.spyOn(video, 'pause').mockImplementation(() => {})
    video.currentTime = 24
    const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden')
    fireEvent(document, new Event('visibilitychange'))
    expect(persisted().progress[episodeKey(1)].positionMs).toBe(24000)
    visibility.mockReturnValue('visible')
    video.currentTime = 25; fireEvent(window, new Event('pagehide'))
    expect(persisted().progress[episodeKey(1)].positionMs).toBe(25000)
    video.currentTime = 27
    view.rerender(<LibraryProvider><Probe /><MemoryRouter><VideoPlayer key="second" media={series} episode={second} session={session(series)} /></MemoryRouter></LibraryProvider>)
    expect(persisted().progress[episodeKey(1)].positionMs).toBe(27000)
    const next = ready(view.container)
    expect(next.currentTime).toBe(0)
    next.currentTime = 9
    view.unmount()
    expect(persisted().progress[episodeKey(2)].positionMs).toBe(9000)
    const reopened = mount(<VideoPlayer media={series} episode={first} session={session(series)} />)
    expect(ready(reopened.container).currentTime).toBe(27)
  })

  it('waits for seek availability instead of inventing a resume position', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 2, favorites: [], progress: { [movie.id]: timed(movie, 42000) } }))
    const view = mount(<VideoPlayer media={movie} session={session()} />)
    const video = view.container.querySelector('video')!
    Object.defineProperty(video, 'seekable', { configurable: true, value: { length: 1, start: () => 0, end: () => 10 } })
    ready(view.container)
    expect(video.currentTime).toBe(0)
    Object.defineProperty(video, 'seekable', { configurable: true, value: { length: 1, start: () => 0, end: () => 100 } })
    fireEvent.canPlay(video)
    expect(video.currentTime).toBe(42)
  })

  it('removes completed movies from resume and starts an intentional replay at zero', () => {
    const view = mount(<><VideoPlayer media={movie} session={session()} /><ContinueWatching /></>)
    const video = ready(view.container)
    video.currentTime = 40; fireEvent.pause(video)
    expect(screen.getByRole('region')).toBeInTheDocument()
    video.currentTime = 100; fireEvent.ended(video)
    expect(screen.queryByRole('region')).toBeNull()
    expect(persisted().progress[movie.id].completed).toBe(true)
    video.currentTime = 0; fireEvent.playing(video)
    video.currentTime = 7; fireEvent.pause(video)
    expect(persisted().progress[movie.id].completed).toBe(false)
    expect(screen.getByRole('region')).toBeInTheDocument()
    video.currentTime = 100; fireEvent.ended(video)
    view.unmount()
    const nextView = mount(<><VideoPlayer media={movie} session={session()} /><ContinueWatching /></>)
    const replay = ready(nextView.container)
    expect(replay.currentTime).toBe(0)
    fireEvent.playing(replay)
    replay.currentTime = 5; fireEvent.pause(replay)
    expect(persisted().progress[movie.id].completed).toBe(false)
    expect(screen.getByRole('region')).toBeInTheDocument()
  })
})

describe('Watch e iframe sem API de progresso', () => {
  it('uses saved metadata offline, records only the accepted episode and never marks iframe load as completed', async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 2, favorites: [series], progress: {} }))
    const resolve = vi.fn<PlaybackProvider['resolve']>(async () => session(series, true))
    const view = mount(<Routes><Route path="/assistir/:id" element={<Watch provider={{ resolve }} catalogProvider={emptyCatalog} />} /></Routes>, `/assistir/${series.id}?temporada=1&episodio=2`)
    await waitFor(() => expect(view.container.querySelector('iframe')).not.toBeNull())
    expect(resolve).toHaveBeenCalledWith({ mediaId: series.id, seasonNumber: 1, episodeNumber: 2 }, expect.any(AbortSignal))
    fireEvent.load(view.container.querySelector('iframe')!)
    act(() => window.dispatchEvent(new MessageEvent('message', { origin: 'https://example.invalid', data: { currentTime: 99, duration: 100, ended: true } })))
    const entry = persisted().progress[episodeKey(2)]
    expect(entry.completed).toBe(false)
    expect(entry).not.toHaveProperty('positionMs')
    expect(entry).not.toHaveProperty('durationMs')
    expect(screen.queryByRole('button', { name: 'Próximo Episódio' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Marcar como assistido' }))
    expect(persisted().progress[episodeKey(2)].completed).toBe(true)
  })

  it('does not record an unavailable session as opened history', async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 2, favorites: [movie], progress: {} }))
    const provider: PlaybackProvider = { resolve: async () => null }
    mount(<Routes><Route path="/assistir/:id" element={<Watch provider={provider} catalogProvider={emptyCatalog} />} /></Routes>, `/assistir/${movie.id}`)
    expect(await screen.findByRole('alert')).toHaveTextContent('Não há uma fonte de reprodução')
    expect(persisted().progress).toEqual({})
  })
})
