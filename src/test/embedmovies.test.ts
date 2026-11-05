import { describe, expect, it, vi } from 'vitest'
import { buildEmbedMovieUrl } from '../services/embedwave'
import { DemoPlaybackProvider, HybridPlaybackProvider } from '../services/playback'

describe('Separate MyEmbed and demonstration contracts', () => {
  it('builds the documented MyEmbed paths without changing the EmbedWave contract', () => {
    expect(buildEmbedMovieUrl({ kind: 'movie', tmdbId: 42 })).toBe('https://myembed.biz/filme/42')
    expect(buildEmbedMovieUrl({ kind: 'tv', tmdbId: 42, season: 2, episode: 3 })).toBe('https://myembed.biz/serie/42/2/3')
  })
  it('keeps the demo-only provider distinct from the existing hybrid provider', async () => {
    const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher)
    const demo = new DemoPlaybackProvider(), hybrid = new HybridPlaybackProvider()
    expect(await demo.resolve({ mediaId: 'tmdb-tv-42', seasonNumber: 2, episodeNumber: 3 })).toBeNull()
    expect((await hybrid.resolve({ mediaId: 'tmdb-tv-42', seasonNumber: 2, episodeNumber: 3 }))?.iframeUrl).toBe('https://myembed.biz/serie/42/2/3')
    expect((await hybrid.resolve({ mediaId: 'demo-bunny' }))?.isIframe).toBeFalsy()
    expect(fetcher).not.toHaveBeenCalled()
  })
})
