import { nativeExperimentEnabled } from '../experimental/playbackEngine'
import type { AddonConfig } from '../experimental/StremioAddonAdapter'

// Add reviewed services here, never import endpoints from an addon or UI input.
export const authorizedDevelopmentAddons: AddonConfig[] = [{
  id: 'controlled-cc0', manifestUrl: 'http://127.0.0.1:4189/manifest.json',
  apiOrigins: ['http://127.0.0.1:4189'], mediaOrigins: ['http://127.0.0.1:4189'],
  rights: { reference: 'NOCTA synthetic fixture: original test bars and tones, CC0-1.0. Not the movie/series corresponding to the sample identifiers.', expiresAt: Date.UTC(2028,0,1) },
  allowLocalFixture: true, tmdbPrefix: 'tmdb:',
}, {
  id: 'fenixflix-diagnostics', manifestUrl: 'https://fenixflix.fenixhub.online/qualities=4k,1080p,720p,sd%7Caudio=dublado,legendado%7Ccatalogs=populares_movie,populares_series,recentes_movie,recentes_series/manifest.json',
  apiOrigins: ['https://fenixflix.fenixhub.online'], mediaOrigins: ['https://fenixflix.fenixhub.online', 'https://cdn-sv01.maximaimg.online', 'https://zunderflix.lat', 'https://embedplayer2.xyz'],
  // Explicit development-only destinations observed in the configured service response.
  rights: { reference: 'Local development integration requested by user; configured FenixFlix service.', expiresAt: Date.UTC(2027,0,1) },
  nativeOrigins: ['https://sa-east-1.v-net.work','https://us-east-2.vy-userfiles.cloud','https://us-central-1.v-net.work','https://magikarp.south-america.workers.dev','https://animezey16082023.animezey16082023.workers.dev','https://cdn-sv01.maximaimg.online','https://zunderflix.lat','https://embedplayer2.xyz'],
  hlsEndpoints: ['https://zunderflix.lat/api/media/hls-proxy'],
  redirectEndpoints: [{origin:'https://fenixflix.fenixhub.online',pathPrefix:'/r/',format:'mp4',reason:'Badger: rota opaca verificada em 04/11/2026; redireciona por HTTP até resposta 206 video/mp4 com assinatura ftypisom. Candidato MP4; o navegador ainda precisa aceitar a cadeia e o codec.'}],
  playbackAllowed: true, tmdbPrefix: 'tmdb:', timeoutMs: 20000,
}]
export const stremioExperimentAvailable = (import.meta.env.DEV || nativeExperimentEnabled) && import.meta.env.VITE_ENABLE_STREMIO_EXPERIMENT === 'true'
