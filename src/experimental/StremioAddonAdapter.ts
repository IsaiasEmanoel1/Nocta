import type { EpisodeSelection } from '../domain/episodes'
import { validSelection } from '../domain/episodes'
import type { PlaybackSession } from '../services/playback'

export interface AddonConfig {
  id: string; manifestUrl: string; apiOrigins: string[]; mediaOrigins: string[]
  rights: { reference: string; expiresAt: number }; allowLocalFixture?: boolean
  playbackAllowed?: boolean;
  hlsEndpoints?: string[];
  nativeOrigins?: string[];
  redirectEndpoints?: { origin: string; pathPrefix: string; reason: string; format?: 'mp4' | 'webm' | 'hls' }[];
  mediaEndpointTypes?: Record<string, 'mp4' | 'webm' | 'hls'>;
  tmdbPrefix?: string; timeoutMs?: number
}
type Resource = string | { name: string; types: string[]; idPrefixes?: string[] }
export interface AddonManifest { id: string; name: string; version: string; types: string[]; resources: Resource[]; idPrefixes?: string[]; catalogs: { id: string; type: string; name?: string }[] }
export interface AddonTitle { type: 'movie' | 'series'; imdb?: string; tmdb?: number; episode?: EpisodeSelection }
export interface AddonSource {
  id: string; name: string; description: string; format: 'mp4' | 'webm' | 'hls' | 'unsupported'
  reportedFormat?: 'mp4' | 'webm' | 'hls' | 'embed' | 'torrent' | 'youtube' | 'matroska' | 'other'; origin?: string; providerId?: string; quality?: string
  nativeCandidate?: { url:string; mimeType:string; headers:Record<string,string> }; nativeReason?:string
  notWebReady?: boolean; requiredHeaders?: string[]
  url?: string; reason?: string; declaredLanguages: string[]; confirmedLanguages: string[]
}
export class AddonError extends Error {
  constructor(public code: 'policy' | 'manifest' | 'unsupported' | 'network' | 'http' | 'timeout' | 'response' | 'cancelled', message: string) { super(message) }
}
const object = (v: unknown): v is Record<string, any> => !!v && typeof v === 'object' && !Array.isArray(v)
const strings = (v: unknown): v is string[] => Array.isArray(v) && v.every(x => typeof x === 'string')

/** Trusted profiles are code configuration, never values received from an addon. */
export class StremioAddonAdapter {
  private manifest?: AddonManifest
  constructor(readonly config: AddonConfig, private fetcher: typeof fetch = globalThis.fetch.bind(globalThis)) {
    this.checkRights(); this.url(config.manifestUrl, config.apiOrigins)
    if (!new URL(config.manifestUrl).pathname.endsWith('/manifest.json') || new URL(config.manifestUrl).search) throw new AddonError('policy', 'Use um manifesto HTTP compatível.')
  }
  private checkRights() {
    if (!this.config.rights.reference.trim() || this.config.rights.expiresAt <= Date.now()) throw new AddonError('policy', 'Autorização ausente ou expirada no perfil.')
  }
  private url(input: string, origins: string[]) {
    let url: URL
    try { url = new URL(input) } catch { throw new AddonError('policy', 'URL inválida.') }
    const local = this.config.allowLocalFixture && url.hostname === '127.0.0.1' && url.port === '4189'
    // Reject every IP literal, single-label/internal name and credentials unless our exact fixture.
    if (url.username || url.password || url.hash || (!local && (url.protocol !== 'https:' || !url.hostname.includes('.') || /(^[\d.]+$|:|localhost$|\.local$|\.internal$|\.localhost$)/i.test(url.hostname))) || !origins.includes(url.origin)) throw new AddonError('policy', 'Destino não autorizado pelo perfil.')
    if (url.protocol !== 'https:' && !(local && url.protocol === 'http:')) throw new AddonError('policy', 'Transporte não permitido.')
    return url
  }
  validateMediaUrl = (input: string) => { this.checkRights(); this.url(input, this.config.mediaOrigins) }
  private async get(path: string, signal?: AbortSignal): Promise<any> {
    this.checkRights()
    const base = new URL(this.config.manifestUrl)
    base.pathname = base.pathname.slice(0, -'manifest.json'.length)
    const url = this.url(new URL(path, base).href, this.config.apiOrigins)
    const controller = new AbortController()
    const abort = () => controller.abort()
    signal?.addEventListener('abort', abort, { once: true })
    if (signal?.aborted) controller.abort()
    let timedOut = false
    const timer = setTimeout(() => { timedOut = true; controller.abort() }, this.config.timeoutMs ?? 8000)
    try {
      const response = await this.fetcher(url.href, { signal: controller.signal, redirect: 'error', credentials: 'omit', referrerPolicy: 'no-referrer' })
      if (!response.ok) throw new AddonError('http', `Serviço indisponível (${response.status}).`)
      if (Number(response.headers.get('content-length')) > 2_000_000) throw new AddonError('response', 'Resposta excessiva.')
      const text = await response.text()
      if (text.length > 2_000_000) throw new AddonError('response', 'Resposta excessiva.')
      return JSON.parse(text)
    } catch (error) {
      if (timedOut) throw new AddonError('timeout', 'O serviço excedeu o tempo limite.')
      if (signal?.aborted) throw new AddonError('cancelled', 'Consulta cancelada.')
      if (error instanceof AddonError) throw error
      if (error instanceof SyntaxError) throw new AddonError('response', 'Resposta JSON inválida.')
      throw new AddonError('network', 'Falha de rede, CORS ou resposta inválida.')
    } finally { clearTimeout(timer); signal?.removeEventListener('abort', abort) }
  }
  async loadManifest(signal?: AbortSignal): Promise<AddonManifest> {
    if (this.manifest) { this.checkRights(); return this.manifest }
    const m = await this.get('manifest.json', signal)
    if (!object(m) || !['id', 'name', 'version'].every(k => typeof m[k] === 'string' && m[k]) || !strings(m.types) || !Array.isArray(m.resources) || !Array.isArray(m.catalogs) || (m.idPrefixes !== undefined && !strings(m.idPrefixes)) || !m.resources.every((r: any) => typeof r === 'string' || (object(r) && typeof r.name === 'string' && strings(r.types) && (r.idPrefixes === undefined || strings(r.idPrefixes)))) || !m.catalogs.every((c: any) => object(c) && typeof c.id === 'string' && typeof c.type === 'string')) throw new AddonError('manifest', 'Manifesto inválido.')
    this.manifest = m as unknown as AddonManifest
    return this.manifest
  }
  private async supports(resource: string, type: string, id: string, signal?: AbortSignal) {
    const m = await this.loadManifest(signal)
    if (!['movie', 'series'].includes(type) || !m.types.includes(type) || !m.resources.some(r => {
      const types = typeof r === 'string' ? m.types : r.types
      const prefixes = typeof r === 'string' ? m.idPrefixes : r.idPrefixes
      return (typeof r === 'string' ? r : r.name) === resource && types.includes(type) && (resource === 'catalog' || !prefixes || prefixes.some(p => id.startsWith(p)))
    })) throw new AddonError('unsupported', 'Recurso, tipo ou identificador não suportado.')
  }
  private identifier(title: AddonTitle) {
    let id: string
    if (title.imdb && /^tt\d+$/.test(title.imdb)) id = title.imdb
    else if (Number.isSafeInteger(title.tmdb) && title.tmdb! > 0 && this.config.tmdbPrefix) id = `${this.config.tmdbPrefix}${title.tmdb}`
    else throw new AddonError('unsupported', 'Informe IMDb válido ou configure explicitamente o prefixo TMDB do serviço.')
    if (title.type === 'series') {
      if (!validSelection(title.episode)) throw new AddonError('response', 'Temporada e episódio são obrigatórios.')
      id += `:${title.episode.seasonNumber}:${title.episode.episodeNumber}`
    }
    return id
  }
  async catalog(type: string, id: string, signal?: AbortSignal) {
    await this.supports('catalog', type, id, signal)
    if (!this.manifest!.catalogs.some(c => c.id === id && c.type === type)) throw new AddonError('unsupported', 'Catálogo não declarado.')
    const data = await this.get(`catalog/${encodeURIComponent(type)}/${encodeURIComponent(id)}.json`, signal)
    if (!Array.isArray(data?.metas)) throw new AddonError('response', 'Catálogo inválido.')
    return data.metas.filter((m: any) => object(m) && typeof m.id === 'string' && typeof m.name === 'string').map((m: any) => ({ id: m.id as string, title: m.name as string, type: m.type as string }))
  }
  async meta(type: string, id: string, signal?: AbortSignal) {
    await this.supports('meta', type, id, signal)
    const data = await this.get(`meta/${encodeURIComponent(type)}/${encodeURIComponent(id)}.json`, signal)
    if (!object(data?.meta) || typeof data.meta.id !== 'string' || typeof data.meta.name !== 'string') throw new AddonError('response', 'Metadados inválidos.')
    return { id: data.meta.id as string, title: data.meta.name as string, episodes: (Array.isArray(data.meta.videos) ? data.meta.videos : []).filter((v: any) => object(v) && typeof v.id === 'string' && validSelection({ seasonNumber: v.season, episodeNumber: v.episode })).map((v: any) => ({ id: v.id as string, title: String(v.title ?? ''), seasonNumber: v.season as number, episodeNumber: v.episode as number })) }
  }
  async streams(title: AddonTitle, signal?: AbortSignal): Promise<AddonSource[]> {
    const id = this.identifier(title)
    await this.supports('stream', title.type, id, signal)
    const data = await this.get(`stream/${title.type}/${encodeURIComponent(id)}.json`, signal)
    if (!Array.isArray(data?.streams)) throw new AddonError('response', 'Lista de fontes inválida.')
    return data.streams.slice(0, 100).map((s: any, index: number) => {
      const source: AddonSource = { id: `${id}:${index}`, name: String(s?.name ?? 'Fonte'), description: String(s?.description ?? s?.title ?? ''), format: 'unsupported', providerId: this.config.id, declaredLanguages: [], confirmedLanguages: [] }
      if (!object(s)) return { ...source, reason: 'Fonte inválida.' }
      let reportedUrl: URL | undefined
      try { if (typeof s.url === 'string') reportedUrl = new URL(s.url) } catch { /* Metadata only; no request. */ }
      source.origin = reportedUrl?.origin
      source.notWebReady = typeof s.behaviorHints?.notWebReady === 'boolean' ? s.behaviorHints.notWebReady : undefined
      source.requiredHeaders = Object.keys(s.behaviorHints?.proxyHeaders?.request ?? {})
      const nativeOrigins=this.config.nativeOrigins??['https://sa-east-1.v-net.work','https://us-east-2.vy-userfiles.cloud','https://animezey16082023.animezey16082023.workers.dev']
      if (reportedUrl?.protocol === 'https:' && !reportedUrl.username && !reportedUrl.password && nativeOrigins.includes(reportedUrl.origin) && !s.drm && !s.externalUrl && !s.infoHash && !s.ytId && !s.nzbUrl) {
        const rawHeaders=s.behaviorHints?.proxyHeaders?.request ?? {}
        if(Object.entries(rawHeaders).every(([key,value])=>['User-Agent','Referer'].includes(key)&&typeof value==='string'&&!/[\r\n]/.test(value))) {
          const mime=/\.m3u8$/i.test(reportedUrl.pathname)||this.config.hlsEndpoints?.includes(reportedUrl.origin+reportedUrl.pathname)?'application/vnd.apple.mpegurl':/\.mp4$/i.test(reportedUrl.pathname)?'video/mp4':/\.webm$/i.test(reportedUrl.pathname)?'video/webm':/\.mkv$/i.test(reportedUrl.pathname)||(reportedUrl.hostname==='animezey16082023.animezey16082023.workers.dev'&&reportedUrl.pathname==='/download.aspx')?'video/x-matroska':undefined
          if(mime) source.nativeCandidate={url:reportedUrl.href,mimeType:mime,headers:rawHeaders}
        }
        source.nativeReason='Candidato Media3 com requisitos declarados; reprodução nativa não verificada.'
      }

      const endpointType = reportedUrl && this.config.mediaEndpointTypes?.[reportedUrl.origin + reportedUrl.pathname]
      const declaredHls = !!reportedUrl && this.config.hlsEndpoints?.includes(reportedUrl.origin + reportedUrl.pathname)
      source.reportedFormat = s.externalUrl ? 'embed' : s.infoHash ? 'torrent' : s.ytId ? 'youtube' : endpointType ? endpointType : /\.mp4$/i.test(reportedUrl?.pathname ?? '') ? 'mp4' : /\.webm$/i.test(reportedUrl?.pathname ?? '') ? 'webm' : (declaredHls || /\.m3u8$/i.test(reportedUrl?.pathname ?? '')) ? 'hls' : 'other'
      if(source.nativeCandidate?.mimeType==='video/x-matroska')source.reportedFormat='matroska'
      source.quality = `${source.name} ${source.description}`.match(/\b(2160p|1080p|720p|480p|360p|4K|FullHD|FHD|HD)\b/i)?.[0]

      // Language is an optional vendor hint, never a guarantee of the actual audio.
      source.declaredLanguages = strings(s.languages) ? s.languages : /dublado|pt-br/i.test(source.description) ? ['pt-BR (rótulo)'] : []
      if (this.config.playbackAllowed === false) return { ...source, reason: 'Perfil somente para diagnóstico. Autorização de reprodução não comprovada; nenhum vídeo será solicitado.' }
      if (s.behaviorHints?.proxyHeaders) return { ...source, reason: `Exige proxyHeaders (${source.requiredHeaders?.join(', ') || 'cabeçalhos de resposta'}). O player web não aplica esses cabeçalhos; codec e compatibilidade nativa não verificados.` }
      if (s.externalUrl || s.infoHash || s.ytId || s.drm || s.nzbUrl) return { ...source, reason: 'Modalidade externa, torrent, DRM ou embed não suportado pelo player HTML5.' }
      const redirectRule = reportedUrl && this.config.redirectEndpoints?.find(rule => rule.origin === reportedUrl.origin && reportedUrl.pathname.startsWith(rule.pathPrefix))
      if (redirectRule && !redirectRule.format) return { ...source, reason: redirectRule.reason }
      if (redirectRule?.format) { source.reportedFormat = redirectRule.format; source.reason = redirectRule.reason }

      try {
        if (typeof s.url !== 'string') throw new Error()
        const url = this.url(s.url, this.config.mediaOrigins)
        source.format = redirectRule?.format ?? endpointType ?? (/\.mp4$/i.test(url.pathname) ? 'mp4' : /\.webm$/i.test(url.pathname) ? 'webm' : (this.config.hlsEndpoints?.includes(url.origin + url.pathname) || /\.m3u8$/i.test(url.pathname)) ? 'hls' : 'unsupported')
        if (source.format === 'unsupported') return { ...source, reason: 'Formato não identificado; não será tratado como vídeo.' }
        source.url = url.href
        return source
      } catch { return { ...source, reason: 'URL de mídia bloqueada pelo perfil.' } }
    })
  }
  session(source: AddonSource, mediaId: string, title: string): PlaybackSession {
    this.checkRights()
    if (this.config.playbackAllowed === false) throw new AddonError('policy', 'Este perfil não autoriza reprodução.')
    if (!source.url || source.format === 'unsupported') throw new AddonError('unsupported', source.reason ?? 'Fonte não suportada.')
    this.url(source.url, this.config.mediaOrigins)
    return { id: mediaId, title, poster: '/art/scene-0.svg', sources: [{ src: source.url, type: source.format === 'hls' ? 'application/vnd.apple.mpegurl' : source.format === 'webm' ? 'video/webm' : 'video/mp4' }], sourceLabel: 'Experimento Stremio', attribution: this.config.rights.reference, license: { name: 'Autorização do perfil experimental', url: '', projectUrl: '' } }
  }
}
