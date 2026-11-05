import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { DemoPlaybackProvider } from '../services/playback'
import { LibraryProvider, readLibrary, resumable, STORAGE_KEY, useLibrary } from '../state/library'
import { fictionalCatalog, demoCatalog } from '../data/fixtures'
import { VideoPlayer } from '../components/VideoPlayer'
import { APP_BACKGROUND_EVENT } from '../components/AndroidLifecycle'
describe('Playback authorization boundary', () => {
  it('resolves only explicitly licensed demo IDs, never a TMDB or fictional title', async () => {
    const provider = new DemoPlaybackProvider()
    for (const id of ['tmdb-movie-597', 'fiction-1', '__proto__', 'unknown']) expect(await provider.resolve({ mediaId: id })).toBeNull()
    expect(await provider.resolve({ mediaId: 'demo-bunny', episodeId: 1 })).toBeNull()
    const session = await provider.resolve({ mediaId: 'demo-bunny' })
    expect(session?.sources[0].src).toMatch(/^https:\/\/storage.googleapis.com\/cpe-sample-media\//)
    expect(session?.license.url).toContain('creativecommons.org/licenses/by/3.0')
  })
})
describe('Local library', () => {
  it('recovers from corrupt or incompatible persisted data', () => {
    expect(readLibrary({ getItem: () => '{invalid' }).favorites).toEqual([])
    expect(readLibrary({ getItem: () => JSON.stringify({ version: 99 }) }).progress).toEqual({})
    expect(readLibrary({ getItem: () => { throw new Error('blocked') } }).favorites).toEqual([])
  })
  it('persists favorites and restores them after remount', async () => {
    function Control() { const lib = useLibrary(); return <button onClick={() => lib.toggleFavorite(fictionalCatalog[0])}>{lib.isFavorite(fictionalCatalog[0].id) ? 'Guardado' : 'Guardar'}</button> }
    const first = render(<LibraryProvider><Control /></LibraryProvider>)
    fireEvent.click(screen.getByText('Guardar'))
    await waitFor(() => expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!).favorites).toHaveLength(1))
    first.unmount()
    render(<LibraryProvider><Control /></LibraryProvider>)
    expect(screen.getByText('Guardado')).toBeInTheDocument()
    fireEvent.click(screen.getByText('Guardado'))
    expect(screen.getByText('Guardar')).toBeInTheDocument()
  })
  it('does not resume completed media', () => {
    const p = { media: demoCatalog[0], positionMs: 96000, durationMs: 100000, updatedAt: 0 }
    expect(resumable(p)).toBe(false)
    expect(resumable({ ...p, positionMs: 30000 })).toBe(true)
  })
  it('restores playback position and saves pause progress in milliseconds', async () => {
    const media = demoCatalog[0]
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, favorites: [], progress: { [media.id]: { media, positionMs: 20000, durationMs: 60000, updatedAt: 1 } } }))
    const session = (await new DemoPlaybackProvider().resolve({ mediaId: media.id }))!
    const view = render(<LibraryProvider><VideoPlayer media={media} session={session} /></LibraryProvider>)
    const video = view.container.querySelector('video')!
    Object.defineProperty(video, 'duration', { configurable: true, value: 60 })
    fireEvent.loadedMetadata(video)
    expect(video.currentTime).toBe(20)
    video.currentTime = 32
    fireEvent.seeked(video)
    await waitFor(() => expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!).progress[media.id].positionMs).toBe(32000))
    video.currentTime = 35
    fireEvent.pause(video)
    await waitFor(() => expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!).progress[media.id].positionMs).toBe(35000))
    fireEvent.change(screen.getByLabelText('Velocidade de reprodução'), { target: { value: '1.5' } })
    expect(video.playbackRate).toBe(1.5)
    const pause = vi.spyOn(video, 'pause').mockImplementation(() => {})
    video.currentTime = 40
    fireEvent(window, new Event(APP_BACKGROUND_EVENT))
    expect(pause).toHaveBeenCalledOnce()
    await waitFor(() => expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!).progress[media.id].positionMs).toBe(40000))
    fireEvent.error(video)
    expect(screen.getByRole('alert')).toHaveTextContent('Não conseguimos iniciar')
    expect(vi.isMockFunction(window.scrollTo)).toBe(true)
  })
})
