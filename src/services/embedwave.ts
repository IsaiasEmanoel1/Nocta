import { deny, validateRights } from './authorizedPlayback'
import type { IframePlaybackSession, LicensedPlaybackProvider, PlaybackAssessment, PlaybackContext, ProviderPolicy } from './authorizedPlayback'
import { embedwavePolicy } from '../config/playbackRights'
import { availabilityService, availabilityMessage } from './availability'

/** Legacy EmbedWave API. This contract is distinct from EmbedMovies/MyEmbed. */
export const EMBEDWAVE_SERVERS = ['nxsha', 'cinesrc', 'videasy'] as const
export type EmbedWaveServer = typeof EMBEDWAVE_SERVERS[number]
export interface EmbedWaveRequest {
  kind: 'movie' | 'tv'; tmdbId: number; season?: number; episode?: number
  server?: EmbedWaveServer; autoplay?: boolean
}
export function validateEmbedWaveRequest(request: EmbedWaveRequest): boolean {
  if (!request || typeof request !== 'object') return false
  if (Object.keys(request).some(key => !['kind', 'tmdbId', 'season', 'episode', 'server', 'autoplay'].includes(key))) return false
  if (!['movie', 'tv'].includes(request.kind) || !positiveInteger(request.tmdbId)) return false
  if (request.server !== undefined && !EMBEDWAVE_SERVERS.includes(request.server)) return false
  if (request.autoplay !== undefined && typeof request.autoplay !== 'boolean') return false
  return request.kind === 'tv' ? positiveInteger(request.season) && positiveInteger(request.episode) : !('season' in request) && !('episode' in request)
}
export function buildEmbedWaveUrl(request: EmbedWaveRequest): string {
  if (!validateEmbedWaveRequest(request)) throw new Error('Identificador ou parâmetro inválido')
  const path = request.kind === 'movie' ? `movie/${request.tmdbId}` : `tv/${request.tmdbId}/${request.season}/${request.episode}`
  const url = new URL(`/embed/${path}`, 'https://embedwave.cc')
  if (request.server) url.searchParams.set('server', request.server)
  if (request.autoplay) url.searchParams.set('autoplay', '1')
  return url.toString()
}
export class EmbedWaveProvider implements LicensedPlaybackProvider<EmbedWaveRequest, IframePlaybackSession> {
  constructor(private policy: ProviderPolicy = embedwavePolicy) {}
  async assess(request: EmbedWaveRequest, context: PlaybackContext): Promise<PlaybackAssessment<IframePlaybackSession>> {
    if (!validateEmbedWaveRequest(request)) return deny('invalid-request', 'Informe identificadores e parâmetros válidos.')
    const contentKey = request.kind === 'movie' ? `movie:${request.tmdbId}` : `tv:${request.tmdbId}:${request.season}:${request.episode}`
    const assessment = validateRights(this.policy, contentKey, request.server ?? EMBEDWAVE_SERVERS[0], context)
    if (assessment.status === 'denied') return assessment
    const grant = assessment.session
    return { status: 'ready', session: {
      kind: 'iframe', provider: 'embedwave', title: grant.title, url: buildEmbedWaveUrl(request),
      rightsReference: grant.evidenceReference, availabilityReference: grant.availability.evidenceReference,
      expiresAt: Math.min(Date.parse(grant.validUntil), Date.parse(grant.availability.validUntil)),
    } }
  }
}
export const embedwaveProvider = new EmbedWaveProvider()

export interface EmbedMovieRequest {
  kind: 'movie' | 'tv';
  tmdbId: number;
  season?: number;
  episode?: number;
  autoplay?: boolean;
}

const positiveInteger = (n: unknown): n is number => typeof n === 'number' && Number.isSafeInteger(n) && n > 0

export function validateEmbedMovieRequest(request: EmbedMovieRequest): boolean {
  if (!request || typeof request !== 'object') return false
  if (!['movie', 'tv'].includes(request.kind) || !positiveInteger(request.tmdbId)) return false
  return request.kind === 'tv' ? positiveInteger(request.season ?? 1) && positiveInteger(request.episode ?? 1) : true
}

/** Constrói a URL de incorporação compatível com o MyEmbed / EmbedMovies */
export function buildEmbedMovieUrl(request: EmbedMovieRequest): string {
  if (!validateEmbedMovieRequest(request)) throw new Error('Identificador ou parâmetro inválido')
  
  const s = request.season ?? 1
  const ep = request.episode ?? 1

  // Padrão de URL estruturado para o MyEmbed
  const path = request.kind === 'movie' 
    ? `filme/${request.tmdbId}` 
    : `serie/${request.tmdbId}/${s}/${ep}`

  const url = new URL(`/${path}`, 'https://myembed.biz')
  if (request.autoplay) url.searchParams.set('autoplay', '1')
  return url.toString()
}

export class EmbedMovieProvider implements LicensedPlaybackProvider<EmbedMovieRequest, IframePlaybackSession> {
  constructor(private policy: ProviderPolicy) {}
  async assess(request: EmbedMovieRequest, context: PlaybackContext): Promise<PlaybackAssessment<IframePlaybackSession>> {
    if (!validateEmbedMovieRequest(request)) return deny('invalid-request', 'Informe um ID positivo.')
    const availability = await availabilityService.check({ mediaId: `tmdb-${request.kind}-${request.tmdbId}`,
      ...(request.kind === 'tv' ? { episode: { seasonNumber: request.season ?? 1, episodeNumber: request.episode ?? 1 } } : {}) }, { force: true })
    if (availability.status !== 'available') return deny(availability.status === 'unavailable' ? 'unavailable' : 'availability-unknown', availabilityMessage(availability.status))
    const targetUrl = buildEmbedMovieUrl(request)
    return { 
      status: 'ready', 
      session: {
        kind: 'iframe', 
        provider: 'embedwave',
        title: `Reproduzir ${request.kind === 'movie' ? 'Filme' : 'Série'} (${request.tmdbId})`, 
        url: targetUrl,
        rightsReference: 'direct-myembed', 
        availabilityReference: availability.source,
        expiresAt: Date.now() + 86400000,
      } 
    }
  }
}

