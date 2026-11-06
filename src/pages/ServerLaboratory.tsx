import { useEffect, useRef, useState } from 'react'
import { BackLink } from '../components/Layout'
import { VideoPlayer } from '../components/VideoPlayer'
import { experimentalProvidersEnabled, laboratoryProfiles, saveExperimentalManifest } from '../config/experimentalProviders'
import type { Media, MediaKind } from '../domain/media'
import { useNativeExperimentAvailable, useNativePlaybackAvailable } from '../experimental/playbackEngine'
import { recentNativeFailures, recordNativeNetworkFailure } from '../experimental/nativeAttempt'
import { validSelection } from '../domain/episodes'
import { NativePlaybackView, nativeEventIsProgress } from '../playback/NativePlaybackView'
import { SOURCE_QUERY_BUDGET_MS } from '../playback/coordinator'
import { experimentalProviderConfig, providerFailure, StremioSourceProvider } from '../playback/providers'
import type { Candidate, DiscoveryDiagnostic, PlaybackContext, ProviderOutcome } from '../playback/providers'
import { catalog } from '../services/catalog'
import { discoveryCache } from '../playback/discoveryCache'

type Row = DiscoveryDiagnostic & { state: ProviderOutcome['state'] | 'unconfigured'; elapsed: number; status?: number; candidates: Candidate[] }
const stateNames: Record<Row['state'], string> = {
  waiting: 'Aguardando', checking: 'Consultando', unverified: 'Não verificado', sources: 'Candidatas encontradas',
  empty: 'Resposta vazia', filtered: 'Todas as fontes rejeitadas', timeout: 'Tempo de consulta esgotado',
  network: 'Falha de rede (inclui possível bloqueio CORS)', http: 'Erro HTTP', unsupported: 'Recurso, tipo ou ID não aceito',
  response: 'Resposta inválida', policy: 'Consulta bloqueada pela política do perfil', unconfigured: 'Falta o manifesto personalizado neste aparelho',
}

export function ServerLaboratory() {
  const debug = useNativeExperimentAvailable()
  const native = useNativePlaybackAvailable()
  if (!experimentalProvidersEnabled || (!import.meta.env.DEV && debug !== true)) return null
  return <Laboratory native={native} />
}

function Laboratory({ native }: { native: ReturnType<typeof useNativePlaybackAvailable> }) {
  const [search, setSearch] = useState('')
  const [matches, setMatches] = useState<Media[]>([])
  const [id, setId] = useState('')
  const [kind, setKind] = useState<MediaKind>('tv')
  const [season, setSeason] = useState(1)
  const [episode, setEpisode] = useState(1)
  const [rows, setRows] = useState<Record<string, Row>>({})
  const [profiles, setProfiles] = useState<Record<string, string>>({})
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [media, setMedia] = useState<Media>()
  const [preview, setPreview] = useState<{ candidate: Candidate; runId: string }>()
  const [events, setEvents] = useState<string[]>([])
  const [networkFailures, setNetworkFailures] = useState(recentNativeFailures)
  const [vetelaUsage, setVetelaUsage] = useState(discoveryCache.vetelaUsage)
  useEffect(()=>{const timer=setInterval(()=>setVetelaUsage(discoveryCache.vetelaUsage()),1000);return()=>clearInterval(timer)},[])
  const discovery = useRef<AbortController | undefined>(undefined)
  const searchRequest = useRef<AbortController | undefined>(undefined)
  useEffect(() => () => { discovery.current?.abort(); searchRequest.current?.abort() }, [])

  async function findTitles() {
    searchRequest.current?.abort()
    const request = new AbortController(); searchRequest.current = request
    setMatches([]); setMessage('Pesquisando no TMDB…')
    const result = await catalog.search(search.trim(), {}, request.signal)
    if (request.signal.aborted) return
    setMatches(result.data.slice(0, 12)); setMessage(result.notice ?? (result.data.length ? 'Escolha um título.' : 'Nenhum título encontrado.'))
  }

  async function consult() {
    const selection = { seasonNumber: season, episodeNumber: episode }
    const value = id.trim()
    const imdb = /^tt\d+$/.test(value) ? value : undefined
    const tmdb = /^(?:tmdb:)?([1-9]\d*)$/.exec(value)?.[1]
    if ((!imdb && !tmdb) || (kind === 'tv' && !validSelection(selection))) {
      setMessage('Informe um ID válido e, para séries, temporada e episódio.'); return
    }
    discovery.current?.abort()
    const request = new AbortController(); discovery.current = request
    setBusy(true); setRows({}); setMessage(''); setEvents([]); setPreview(undefined)
    try {
      const tmdbId = `tmdb-${kind}-${tmdb}`
      const detail = tmdb ? await catalog.detail(tmdbId, request.signal) : undefined
      const title: Media = detail?.data ?? { id: tmdb ? tmdbId : `lab-${imdb}`, kind, title: value, overview: '', year: 0, rating: 0, genres: [], genreIds: [], cast: [], poster: '', backdrop: '', source: 'tmdb' }
      if (request.signal.aborted) return
      setMedia(title)
      if (tmdb && !detail?.data) setMessage('O TMDB não confirmou os metadados. Só serão aceitos complementos que reconheçam esse ID TMDB.')
      const context: PlaybackContext = { media: title, ...(imdb ? { manualIdentity: { imdb } } : {}), ...(kind === 'tv' ? { episode: selection } : {}), native: !!native, nativeOrigins: typeof native === 'object' ? native.origins : undefined, publicMediaTransport: typeof native === 'object' && native.publicMediaTransport }
      await Promise.all(laboratoryProfiles.map(async profile => {
        const config = experimentalProviderConfig(profile)
        const update = (row: Row) => { if (!request.signal.aborted) setRows(previous => ({ ...previous, [profile.id]: row })) }
        if (!config) { update({ state: 'unconfigured', elapsed: 0, candidates: [], sources: [] }); return }
        update({ state: 'checking', elapsed: 0, candidates: [], sources: [] })
        const provider = new StremioSourceProvider(config)
        const query = new AbortController(), abort = () => query.abort()
        request.signal.addEventListener('abort', abort, { once: true })
        const timer = setTimeout(abort, provider.queryBudgetMs ?? SOURCE_QUERY_BUDGET_MS)
        const started = performance.now()
        const elapsed = () => Math.round(performance.now() - started)
        try {
          const candidates = await provider.find(context, query.signal)
          update({ ...provider.diagnostic, state: candidates.length ? 'sources' : provider.lastScan?.returned ? 'filtered' : 'empty', elapsed: elapsed(), candidates })
        } catch (error) {
          const failure = providerFailure(profile.id, error)
          update({ ...provider.diagnostic, state: query.signal.aborted ? 'timeout' : failure.state, status: failure.status, elapsed: elapsed(), candidates: [] })
        } finally { clearTimeout(timer); request.signal.removeEventListener('abort', abort) }
      }))
    } catch { if (!request.signal.aborted) setMessage('Não foi possível preparar a consulta.') }
    finally { if (!request.signal.aborted) setBusy(false) }
  }

  function record(event: string) { setEvents(previous => previous.includes(event) ? previous : [...previous, event].slice(-30)) }

  function start(candidate: Candidate) {
    setEvents([])
    try {
      candidate.validateStart?.(candidate.engine)
      setPreview({ candidate, runId: crypto.randomUUID() })
      record('Fonte selecionada. Aguardando eventos do player.')
    } catch { setPreview(undefined); record('O transporte recusou a inicialização.') }
  }

  const diagnostics = laboratoryProfiles.flatMap(profile => {
    const row = rows[profile.id]
    if (!row) return []
    const { candidates, ...report } = row
    return [{ perfil: profile.id, ...report, candidatas: candidates.length }]
  })

  return <section className="page-shell stremio-experiment server-lab">
    <BackLink>Voltar</BackLink><h1>Laboratório de Servidores</h1>
    <p>Uma fonte anunciada ainda precisa ser validada pelo player. O teste usa o mesmo transporte do Nocta.</p>
    <form onSubmit={event => { event.preventDefault(); if (search.trim()) void findTitles() }}>
      <label>Nome do título <input value={search} onChange={event => setSearch(event.target.value)} /></label><button className="button button-secondary">Pesquisar no TMDB</button>
    </form>
    {matches.map(title => <button className="button button-secondary" key={title.id} onClick={() => { setId(title.id.split('-').at(-1)!); setKind(title.kind); setMatches([]); setSeason(1); setEpisode(1); setMessage(`${title.title} (${title.year})`) }}>{title.title} ({title.year})</button>)}
    <form onSubmit={event => { event.preventDefault(); void consult() }}>
      <label>TMDB ou IMDb <input required value={id} onChange={event => setId(event.target.value)} /></label>
      <label>Tipo <select value={kind} onChange={event => setKind(event.target.value as MediaKind)}><option value="tv">Série, anime ou novela</option><option value="movie">Filme</option></select></label>
      {kind === 'tv' && <><label>Temporada <input type="number" min="1" value={season} onChange={event => setSeason(Number(event.target.value))} /></label><label>Episódio ou capítulo <input type="number" min="1" value={episode} onChange={event => setEpisode(Number(event.target.value))} /></label></>}
      <button className="button button-primary" disabled={busy || native === undefined}>{busy ? 'Consultando…' : 'Consultar seis fornecedores'}</button>
    </form>
    <p role="status">{message}</p>
    {laboratoryProfiles.map(profile => {
      const config = experimentalProviderConfig(profile), row = rows[profile.id]
      return <details key={profile.id} open={row ? true : undefined}>
        <summary>{profile.name} · {row ? `${stateNames[row.state]} · ${row.elapsed} ms` : config ? 'Configurado' : stateNames.unconfigured}</summary>
        <div className="lab-profile"><label>Manifesto personalizado <input type="password" autoComplete="off" placeholder={config ? 'Manifesto configurado' : 'Cole a URL do manifesto'} value={profiles[profile.id] ?? ''} onChange={event => setProfiles(previous => ({ ...previous, [profile.id]: event.target.value }))} /></label>
          <button className="button button-secondary" disabled={busy || !profiles[profile.id]?.trim()} onClick={() => {
            try { saveExperimentalManifest(profile, profiles[profile.id]); setProfiles(previous => ({ ...previous, [profile.id]: '' })); setMessage(`Perfil ${profile.name} salvo neste aparelho. Consulte novamente para aplicá-lo aqui.`) }
            catch { setMessage(`Informe um manifesto válido para ${profile.name}.`) }
          }}>Salvar</button></div>
        {profile.id==='vetela'&&<p>{vetelaUsage.used} de 10 requisições nos últimos 60 segundos. {vetelaUsage.nextAt?`Próxima janela às ${new Date(vetelaUsage.nextAt).toLocaleTimeString('pt-BR')}.`:'Há cota para consulta.'} {vetelaUsage.queued>0&&`${vetelaUsage.queued} na fila.`}</p>}
        {row && <><p>{[row.manifestId, row.query && `${row.query.type} · ${row.query.id}`, row.status && `HTTP ${row.status}`].filter(Boolean).join(' · ')}</p><p>{row.sources.length} anunciadas · {row.candidates.length} aceitas · {row.sources.length - row.candidates.length} rejeitadas</p>
          {row.sources.length > 0 && <ol>{row.sources.map(source => {
            const candidate = row.candidates.find(item => item.id === source.id)
            return <li key={source.id}>{source.format.toUpperCase()} · {source.languages.map(mode => mode === 'dub' ? 'dublado' : mode === 'sub' ? 'legendado' : 'idioma não informado').join(', ')} · {source.engine ?? source.reason}{candidate?.quality && ` · ${candidate.quality}`}{candidate && <button className="button button-secondary" onClick={() => start(candidate)}>Testar esta fonte</button>}</li>
          })}</ol>}</>}
      </details>
    })}
    {preview && media && <section><h2>Teste de reprodução</h2><button className="button button-secondary" onClick={() => setPreview(undefined)}>Encerrar teste</button>
      <div className="lab-preview" key={preview.runId}>{preview.candidate.input ? <NativePlaybackView input={{ ...preview.candidate.input, sessionId: preview.runId, sourceId: preview.candidate.id, providerId: preview.candidate.providerId, title: media.title }} nextAvailable={false} onResume={() => start(preview.candidate)} onEvent={event => {
        if (recordNativeNetworkFailure(preview.candidate.providerId, preview.candidate.id, preview.candidate.input!.mimeType, event)) setNetworkFailures(recentNativeFailures())
        if (event.detail === 'format-corrected-to-mp4') record('Media3 · Assinatura MP4 confirmada. Reabrindo a fonte como MP4.')
        if (event.event !== 'diagnostic') record(`Media3 · ${event.event}${event.category ? ` · ${event.category}` : ''}${event.errorCode ? ` · código ${event.errorCode}` : ''}${event.httpStatus ? ` · HTTP ${event.httpStatus}` : ''}`)
        if (nativeEventIsProgress(event)) record('Media3 confirmou quadro renderizado, áudio e avanço.')
      }} /> : preview.candidate.session && <VideoPlayer media={media} session={preview.candidate.session} startOnReady persistHistory={false} reportAvailability={false} requireVideo validateMediaUrl={preview.candidate.validateMediaUrl} onPlaybackEvent={event => record(`HTML5 · ${event}`)} onRendererEvent={event => record(`HTML5 · ${event}`)} />}</div>
    </section>}
    <h2>Registro técnico</h2>
    <ul aria-live="polite">{events.map(event => <li key={event}>{event}</li>)}</ul>
    {networkFailures.length > 0 && <details open><summary>Falhas recentes de conexão no Media3</summary><ul>{[...networkFailures].reverse().map(failure => <li key={failure}>{failure}</li>)}</ul></details>}
    {diagnostics.length > 0 && <details><summary>Consultas em JSON, sem URLs e credenciais</summary><pre className="lab-log">{JSON.stringify(diagnostics, null, 2)}</pre></details>}
  </section>
}
