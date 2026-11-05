import { availabilityMessage, availabilityService } from './availability'
import type { AvailabilityService } from './availability'
import { validSelection } from '../domain/episodes'
export interface PlaybackRequest { mediaId: string; episodeId?: number; episodeNumber?: number; seasonNumber?: number }
export interface PlaybackSource { src: string; type: 'video/mp4' | 'video/webm' | 'application/vnd.apple.mpegurl' }
export interface PlaybackCapabilities { supportsEndEvent: boolean; supportsProgress: boolean; supportsSeek: boolean; supportsAutoNext: boolean }
export const HTML5_CAPABILITIES: PlaybackCapabilities = { supportsEndEvent: true, supportsProgress: true, supportsSeek: true, supportsAutoNext: true }
export const IFRAME_CAPABILITIES: PlaybackCapabilities = { supportsEndEvent: false, supportsProgress: false, supportsSeek: false, supportsAutoNext: false }
export function playbackCapabilities(session?: PlaybackSession): PlaybackCapabilities {
  return session?.capabilities ?? (session && !session.isIframe ? HTML5_CAPABILITIES : IFRAME_CAPABILITIES)
}
export interface PlaybackSession {
  id: string; title: string; sources: PlaybackSource[]; poster: string; sourceLabel: string
  attribution: string; license: { name: string; url: string; projectUrl: string }
  capabilities?: PlaybackCapabilities;
  isIframe?: boolean;
  iframeUrl?: string;
}
export interface PlaybackProvider {
  resolve(request: PlaybackRequest, signal?: AbortSignal): Promise<PlaybackSession | null>
}

const MEU_IP_LOCAL = '192.168.1.9'; 
const PORTA_SERVIDOR = 4000;

const demos = {
  'demo-bunny': { slug: 'big_buck_bunny', title: 'Big Buck Bunny', projectUrl: 'https://peach.blender.org/about/', attribution: '© 2008 Blender Foundation.' },
  'demo-sintel': { slug: 'sintel', title: 'Sintel', projectUrl: 'https://durian.blender.org/sharing/', attribution: '© 2010 Blender Foundation.' },
  'demo-steel': { slug: 'tears_of_steel', title: 'Tears of Steel', projectUrl: 'https://mango.blender.org/about/', attribution: '© 2012 Blender Foundation.' },
} as const

/** Only the explicitly licensed sample films; never resolves catalog IDs. */
export class DemoPlaybackProvider implements PlaybackProvider {
  async resolve(request: PlaybackRequest): Promise<PlaybackSession | null> {
    if (request.episodeId !== undefined || request.episodeNumber !== undefined || request.seasonNumber !== undefined) return null
    if (Object.hasOwn(demos, request.mediaId)) {
      const demo = demos[request.mediaId as keyof typeof demos]
      return { 
        id: request.mediaId, capabilities: HTML5_CAPABILITIES, 
        title: demo.title, 
        poster: '/art/scene-0.svg', 
        sourceLabel: 'Amostra pública Google Cast.',
        sources: [{ src: `https://storage.googleapis.com/cpe-sample-media/content/${demo.slug}/prog/${demo.slug}_prog.mp4`, type: 'video/mp4' }],
        attribution: demo.attribution, 
        license: { name: 'Creative Commons 3.0', url: 'https://creativecommons.org/licenses/by/3.0/', projectUrl: demo.projectUrl },
      }
    }

    return null
  }
}

export class HybridPlaybackProvider extends DemoPlaybackProvider {
  async resolve(request: PlaybackRequest): Promise<PlaybackSession | null> {
    const demo = await super.resolve(request)
    if (demo) return demo
    if (request.mediaId.startsWith('tmdb-')) {
      const match = /^tmdb-(movie|tv)-(\d+)$/.exec(request.mediaId)
      if (!match || !Number.isSafeInteger(Number(match[2])) || Number(match[2]) <= 0) return null
      const kind = match[1] as 'movie' | 'tv'
      const tmdbId = match[2]

      // Como o MyEmbed aceita o ID do TMDB ou IMDb dependendo da rota, 
      // separei exatamente no formato que você encontrou para filmes e séries:
      const season = request.seasonNumber || 1
      const episode = request.episodeNumber ?? request.episodeId ?? 1
      if (kind === 'tv' && !validSelection({ seasonNumber: season, episodeNumber: episode })) return null

      const embedUrl = kind === 'movie'
        ? `https://myembed.biz/filme/${tmdbId}` // Usando o formato /filme/ que você testou
        : `https://myembed.biz/serie/${tmdbId}/${season}/${episode}` // Formato de série

      return {
        id: request.mediaId,
        title: `Reprodução MyEmbed (${tmdbId})`,
        poster: '/art/poster-1.svg',
        sourceLabel: 'Reprodução via MyEmbed / EmbedMovies',
        sources: [],
        attribution: 'Conteúdo incorporado via MyEmbed.',
        license: { name: 'MyEmbed Player', url: 'https://myembed.biz', projectUrl: 'https://myembed.biz' },
        isIframe: true, capabilities: IFRAME_CAPABILITIES,
        iframeUrl: embedUrl
      }
    }

    return null
  }
}

/** A URL-producing adapter is isolated behind fresh availability verification. */
export class AvailabilityGuardedProvider implements PlaybackProvider {
  constructor(private provider: PlaybackProvider, private availability: AvailabilityService) {}
  async resolve(request: PlaybackRequest, signal?: AbortSignal): Promise<PlaybackSession | null> {
    const hasEpisode = request.seasonNumber !== undefined || request.episodeNumber !== undefined || request.episodeId !== undefined
    const episode = hasEpisode ? { seasonNumber: request.seasonNumber!, episodeNumber: request.episodeNumber ?? request.episodeId! } : undefined
    if (episode && !validSelection(episode)) throw new Error('Seleção de episódio inválida.')
    if (request.mediaId.startsWith('tmdb-tv-') && !episode) throw new Error('Selecione uma temporada e um episódio para verificar a disponibilidade.')
    const result = await this.availability.check({ mediaId: request.mediaId, ...(episode ? { episode } : {}) }, { force: true, signal })
    if (result.status !== 'available' || result.expiresAt === null || result.expiresAt <= Date.now()) throw new Error(availabilityMessage(result.status === 'available' ? 'unknown' : result.status))
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
    const session = await this.provider.resolve(request, signal)
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
    if (result.expiresAt <= Date.now()) throw new Error(availabilityMessage('unknown'))
    return session
  }
}
export const playbackProvider: PlaybackProvider = new HybridPlaybackProvider()
