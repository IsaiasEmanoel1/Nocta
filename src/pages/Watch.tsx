import { PlayerStage } from '../playback/PlayerStage'
import { AutomaticWatch } from '../playback/AutomaticWatch'
import { confirmedPlaybackMedia } from '../playback/providers'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useParams, useSearchParams, useLocation } from 'react-router'
import { ArrowRight, Play, X } from 'lucide-react'
import { playbackCapabilities, playbackProvider } from '../services/playback'
import type { PlaybackProvider } from '../services/playback'
import { catalog } from '../services/catalog'
import { useAsync } from '../hooks/useAsync'
import { BackLink } from '../components/Layout'
import { EmptyState, Loading } from '../components/Feedback'
import { VideoPlayer } from '../components/VideoPlayer'
import { PlaybackDetails } from '../components/PlaybackDetails'
import { EpisodePicker } from '../components/EpisodePicker'
import { IframePlayer } from '../components/IframePlayer'
import { useLibrary } from '../state/library'
import { usePlaybackSession } from '../hooks/usePlaybackSession'
import type { CatalogProvider, Media } from '../domain/media'
import type { EpisodeSelection, PlaybackProgress } from '../domain/episodes'
import { episodeSequence, nearEpisodeEnd, positiveNumber, progressKey, selectionFromUrl } from '../domain/episodes'

function savedOption(key: string, fallback: boolean) {
  try { const value = localStorage.getItem(key); return value === null ? fallback : value === 'true' } catch { return fallback }
}
function storeOption(key: string, value: boolean) { try { localStorage.setItem(key, String(value)) } catch { /* Session preferences still work. */ } }

export function Watch({ provider = playbackProvider, catalogProvider = catalog }: { provider?: PlaybackProvider; catalogProvider?: CatalogProvider }) {
  const { id = '' } = useParams()
  const location=useLocation()
  const { state: library } = useLibrary()
  const warm = provider === playbackProvider && catalogProvider === catalog ? confirmedPlaybackMedia(id) : undefined
  const { data, loading } = useAsync(signal => warm ? Promise.resolve({data:warm,origin:'tmdb' as const}) : catalogProvider.detail(id, signal), [id, provider, catalogProvider])
  const saved = Object.values(library.progress).find(item => item.media.id === id)?.media
  const preview=location.state?.media?.id===id?location.state.media as Media:saved??library.favorites.find(item=>item.id===id)
  if (loading && !warm) return <div className="page-shell watch-page automatic-watch"><BackLink>Voltar</BackLink><PlayerStage media={preview} loading token={id} message="Preparando sua reprodução…"/></div>
  const media = (data?.data?.id === id ? data.data : undefined) ?? warm ?? saved ?? library.favorites.find(item => item.id === id)
  if (!media) return <div className="page-shell"><EmptyState title="Reprodução não disponível" description="Não foi possível encontrar os dados deste título." /></div>
  if (provider === playbackProvider && media.source === 'tmdb') return <AutomaticWatch key={id} media={media} catalogProvider={catalogProvider} />
  return <WatchContent key={id} media={media} provider={provider} catalogProvider={catalogProvider} />
}

function WatchContent({ media, provider, catalogProvider }: { media: Media; provider: PlaybackProvider; catalogProvider: CatalogProvider }) {
  const [params, setParams] = useSearchParams()
  const { state, recordIframeOpen, setCompleted } = useLibrary()
  const series = media.kind === 'tv'
  const [initial] = useState<EpisodeSelection>(() => {
    const saved = Object.values(state.progress).filter(item => item.media.id === media.id && item.episode).sort((a, b) => b.updatedAt - a.updatedAt)[0]?.episode
    return saved ?? { seasonNumber: media.seasons?.filter(season => positiveNumber(season.number)).sort((a, b) => a.number - b.number)[0]?.number ?? 1, episodeNumber: 1 }
  })
  const requested = series ? selectionFromUrl(params) ?? initial : undefined
  const validate = useCallback(async (selection: EpisodeSelection, signal: AbortSignal) => {
    try {
      const result = await catalogProvider.episodes(media, selection.seasonNumber, signal)
      return result.origin === 'fallback' || result.data.some(episode => episode.number === selection.episodeNumber)
    } catch { return !signal.aborted } // Network failure does not prove absence.
  }, [media.id, catalogProvider])
  const playback = usePlaybackSession(media.id, requested, provider, series ? validate : undefined)
  const active = playback.active
  useEffect(() => {
    if (active?.session.isIframe && active.session.iframeUrl) recordIframeOpen(media, active.episode)
  }, [active, media, recordIframeOpen])
  const current = active?.episode ?? requested ?? initial
  const pending = playback.pending || (!playback.error && active?.key !== progressKey(media.id, requested))
  const { data: sequence } = useAsync(signal => series
    ? episodeSequence(media, current, catalogProvider, signal)
    : Promise.resolve({ episodes: [], next: undefined, previous: undefined, status: 'unknown' as const, notice: undefined }), [media.id, catalogProvider, current.seasonNumber, current.episodeNumber])
  const capabilities = playbackCapabilities(active?.session)
  const canAutoNext = capabilities.supportsEndEvent && capabilities.supportsAutoNext && !active?.session.isIframe
  const [autoAdvance, setAutoAdvance] = useState(() => savedOption('nocta.autonext', true))
  const [useCountdown, setUseCountdown] = useState(() => savedOption('nocta.autonext.countdown', false))
  const [countdown, setCountdown] = useState<{ key: string; remaining: number }>()
  const [finished, setFinished] = useState<string>()
  const [startOnReady, setStartOnReady] = useState(false)
  const [progress, setProgress] = useState<{ key: string; value: PlaybackProgress }>()
  const [dismissedNext, setDismissedNext] = useState<string>()
  const surface = useRef<HTMLDivElement>(null)
  const focusNext = useRef(false)
  const endedKey = useRef<string | undefined>(undefined)
  useEffect(() => {
    endedKey.current = undefined
    setCountdown(undefined); setFinished(undefined)
    if (focusNext.current && surface.current?.scrollIntoView) {
      focusNext.current = false
      surface.current.scrollIntoView({ behavior: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'start' })
    }
  }, [active?.key])
  const next = sequence?.next
  function selectEpisode(selection: EpisodeSelection) {
    if (pending || progressKey(media.id, selection) === active?.key) return
    if (playback.error && progressKey(media.id, selection) === progressKey(media.id, requested)) { playback.retry(); return }
    focusNext.current = true
    setStartOnReady(true)
    const updated = new URLSearchParams(params)
    updated.set('temporada', String(selection.seasonNumber))
    updated.set('episodio', String(selection.episodeNumber))
    setParams(updated, { replace: true })
  }
  function advanceOnEnded() {
    if (!active || !capabilities.supportsEndEvent) return
    setFinished(active.key)
    if (!canAutoNext || !autoAdvance || !next || pending || endedKey.current === active.key) return
    endedKey.current = active.key
    if (useCountdown) setCountdown({ key: active.key, remaining: 5 })
    else selectEpisode(next)
  }
  useEffect(() => {
    if (!countdown || countdown.key !== active?.key || !autoAdvance || !canAutoNext || pending || !next) return
    const timer = setTimeout(() => {
      if (countdown.remaining <= 1) { setCountdown(undefined); selectEpisode(next) }
      else setCountdown({ ...countdown, remaining: countdown.remaining - 1 })
    }, 1000)
    return () => clearTimeout(timer)
  }, [countdown, active?.key, autoAdvance, canAutoNext, pending, next?.seasonNumber, next?.episodeNumber])
  const floatingNext = capabilities.supportsProgress && next && !pending && progress && active && dismissedNext !== active.key && progress.key === active.key && nearEpisodeEnd(progress.value)
    ? <div className="next-episode-prompt"><button className="next-episode-overlay" onClick={() => selectEpisode(next)}><span>Próximo Episódio</span><ArrowRight size={18} aria-hidden="true" /></button><button className="next-episode-dismiss" aria-label="Ocultar sugestão de próximo episódio" onClick={() => setDismissedNext(active.key)}><X size={18} aria-hidden="true" /></button></div>
    : undefined
  const session = active?.session
  return <div className="page-shell watch-page">
    <div className="watch-heading">
      <BackLink>Voltar ao catálogo</BackLink>
      <span><Play size={14} aria-hidden="true" />NOCTA Player</span>
    </div>

    {pending && <p className="watch-preparing" role="status">{active ? 'Preparando próximo episódio…' : 'Preparando reprodução…'}</p>}
    {playback.error && <div className="notice" role="alert">{playback.error} {active && 'O episódio anterior continua disponível.'}<button className="text-link watch-retry" onClick={playback.retry}>Tentar novamente</button></div>}
    <div ref={surface} className="watch-player-surface" aria-busy={pending}>
    {session?.isIframe && session.iframeUrl ? (
      <IframePlayer key={active?.key} session={session} />
    ) : session && active ? <VideoPlayer key={`playback:${active.key}`} session={session} media={media} episode={active.episode}
      startOnReady={startOnReady} overlay={floatingNext} onEnded={advanceOnEnded}
      onProgress={value => setProgress({ key: active.key, value })} /> : !pending && <EmptyState title="Reprodução não disponível" description="Escolha outro episódio ou tente novamente mais tarde." />}
    </div>

    {session?.isIframe && active && <div className="watch-history-actions"><span>Último título/episódio aberto salvo. O fornecedor não informa tempo assistido.</span><button className="history-action" disabled={state.progress[active.key]?.completed === true} onClick={() => setCompleted(active.key, true)}>{state.progress[active.key]?.completed ? 'Marcado como assistido' : 'Marcar como assistido'}</button></div>}
    {!session && <Link className="text-link watch-details-link" to={`/titulo/${media.id}`}>Explorar detalhes e títulos semelhantes</Link>}

    {series && <EpisodePicker media={media} provider={catalogProvider} current={current} pending={pending ? requested : undefined}
      previous={sequence?.previous} next={next} busy={pending} onSelect={selectEpisode} autoAdvance={autoAdvance} onAutoAdvanceChange={value => { setAutoAdvance(value); storeOption('nocta.autonext', value); setCountdown(undefined) }}
      supportsProgress={canAutoNext} />}
    {series && canAutoNext && <label className="watch-autonext"><input type="checkbox" checked={useCountdown} onChange={event => { setUseCountdown(event.target.checked); storeOption('nocta.autonext.countdown', event.target.checked); setCountdown(undefined) }} />Contagem regressiva antes do próximo episódio</label>}
    {countdown && countdown.key === active?.key && autoAdvance && <div className="episode-countdown" role="status">Próximo episódio em {countdown.remaining}s<button className="button button-secondary" onClick={() => setCountdown(undefined)}>Cancelar</button><button className="button button-primary" disabled={pending} onClick={() => { setCountdown(undefined); if (next) selectEpisode(next) }}>Próximo agora</button></div>}
    {series && finished === active?.key && !next && sequence?.status === 'complete' && <p className="notice" role="status">Você chegou ao último episódio disponível.</p>}
    {series && sequence?.notice && <p className="muted" role="status">{sequence.notice}</p>}
    <PlaybackDetails key={`details:${media.id}`} media={media} />

    {session && !session.isIframe && <p className="playback-license">{session.attribution} <a href={session.license.url} target="_blank" rel="noreferrer">{session.license.name}</a> · <a href={session.license.projectUrl} target="_blank" rel="noreferrer">Créditos originais</a></p>}

  </div>
}
