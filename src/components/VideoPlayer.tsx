import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { Maximize, Minimize, RotateCcw, RotateCw, Volume2, VolumeX, Play, Pause, Settings, ArrowLeft } from 'lucide-react'
import type { Media } from '../domain/media'
import type { PlaybackSession } from '../services/playback'
import { isTimedProgress, isCompleted, useLibrary } from '../state/library'
import { APP_BACKGROUND_EVENT } from './AndroidLifecycle'
import { progressKey } from '../domain/episodes'
import type { EpisodeSelection, PlaybackProgress } from '../domain/episodes'
import { useAudioPlayback } from '../hooks/useAudioPlayback'
import { clearMediaFailure, reportMediaFailure } from '../services/mediaAvailability'

export function formatTime(seconds: number) { const safe = Number.isFinite(seconds) ? Math.max(0, seconds) : 0; return `${Math.floor(safe / 60)}:${String(Math.floor(safe % 60)).padStart(2, '0')}` }
interface VideoPlayerProps {
  controlsEnabled?:boolean
  integrated?:boolean
  onSources?():void
  simpleFeedback?:boolean
  reportAvailability?:boolean
  requireVideo?:boolean
  initialPositionSeconds?: number
  onStateChange?(phase:'playing'|'paused'|'buffering'):void
  onPlaybackEvent?(event: 'loaded' | 'playing' | 'progress' | 'failed', seconds?: number, detail?: string): void
  onRendererEvent?(event:'preparação'|'video'|'audio'|'reprodução-confirmada',position?:number):void
  persistHistory?: boolean
  validateMediaUrl?(url: string): void
  session: PlaybackSession; media: Media; episode?: EpisodeSelection; overlay?: ReactNode
  onProgress?(progress: PlaybackProgress): void; onEnded?(): void; startOnReady?: boolean
}
export function VideoPlayer({ session, media, episode, overlay, onProgress, onEnded, startOnReady = false, persistHistory = true, onPlaybackEvent, onRendererEvent, validateMediaUrl, initialPositionSeconds, onStateChange,reportAvailability=true,requireVideo=false,simpleFeedback=false,integrated=false,onSources,controlsEnabled=true }: VideoPlayerProps) {
  const video = useRef<HTMLVideoElement>(null)
  const wrapper = useRef<HTMLDivElement>(null)
  const { saveProgress, setCompleted, state } = useLibrary()
  const saver = useRef(saveProgress)
  saver.current = persistHistory ? saveProgress : () => {}
  const resume = useRef(state.progress[progressKey(media.id, episode)])
  const resumed = useRef(false)
  const lastSave = useRef(-Infinity)
  const lastPlaybackTime = useRef<number | undefined>(undefined)
  const [error, setError] = useState(false)
  const [needsGesture,setNeedsGesture]=useState(false)
  const [attempt, setAttempt] = useState(0)
  const firstFrame=useRef(false)
  const hasAdvanced=useRef(false)
  const rendererHandler=useRef(onRendererEvent);rendererHandler.current=onRendererEvent
  useEffect(()=>{
    firstFrame.current=false
    hasAdvanced.current=false
    lastPlaybackTime.current=undefined
    const el=video.current
    if(!el||(!requireVideo&&!rendererHandler.current)||!el.requestVideoFrameCallback)return
    const id=el.requestVideoFrameCallback(()=>{firstFrame.current=true;rendererHandler.current?.('video')})
    return()=>el.cancelVideoFrameCallback(id)
  },[attempt])
  const eventHandler = useRef(onPlaybackEvent)
  eventHandler.current = onPlaybackEvent
  const audioFailure = useRef((detail: string) => eventHandler.current?.('failed', 0, detail))
  const audio = useAudioPlayback(video, session.sources[0]?.src, session.sources[0]?.type === 'application/vnd.apple.mpegurl', validateMediaUrl, attempt, audioFailure.current)
  const [isPlaying,setIsPlaying]=useState(false)
  const [controlsVisible,setControlsVisible]=useState(true)
  const [settingsOpen,setSettingsOpen]=useState(false)
  const [interaction,setInteraction]=useState(0)
  const [volume,setVolume]=useState(1)
  const reveal=()=>{setControlsVisible(true);setInteraction(value=>value+1)}
  useEffect(() => {
    if (!integrated || !isPlaying || settingsOpen) return
    const timer = setTimeout(() => {
      if (!wrapper.current?.querySelector('.web-controls :focus-visible')) setControlsVisible(false)
    }, 3000)
    return () => clearTimeout(timer)
  }, [integrated, isPlaying, settingsOpen, interaction])
  const [position, setPosition] = useState(0)
  const [duration, setDuration] = useState(0)
  const [speed, setSpeed] = useState(1)
  const [fullscreenError, setFullscreenError] = useState('')
  const [isFullscreen, setIsFullscreen] = useState(false)
  useEffect(() => {
    const onFullscreenChange = () => {
      setIsFullscreen(document.fullscreenElement === wrapper.current)
      setSettingsOpen(false)
      setControlsVisible(true)
      setInteraction(value => value + 1)
    }
    document.addEventListener('fullscreenchange', onFullscreenChange)
    return () => document.removeEventListener('fullscreenchange', onFullscreenChange)
  }, [])
  const [playbackNotice, setPlaybackNotice] = useState('')
  function restorePosition() {
    const el = video.current, previous = resume.current
    if (resumed.current || !el || !Number.isFinite(el.duration) || el.duration <= 0) return
    const savedSeconds=initialPositionSeconds ?? (previous && isTimedProgress(previous) && !isCompleted(previous)?previous.positionMs/1000:0)
    if(!savedSeconds){resumed.current=true;return}
    const target = Math.min(savedSeconds, Math.max(0, el.duration - 1))
    if (el.seekable.length && !Array.from({ length: el.seekable.length }, (_, index) => index).some(index => target >= el.seekable.start(index) && target <= el.seekable.end(index))) return
    try { el.currentTime = target; resumed.current = true }
    catch { setPlaybackNotice('O vídeo ainda não permite retomar o tempo salvo. Use os controles quando estiver disponível.') }
  }
  function save(force = false) {
    const el = video.current
    if (!el || (requireVideo&&!el.videoWidth) || !Number.isFinite(el.duration) || el.duration <= 0 || !Number.isFinite(el.currentTime) || el.currentTime < 1 || (!force && Date.now() - lastSave.current < 5000)) return
    lastSave.current = Date.now()
    saver.current(media, el.currentTime * 1000, el.duration * 1000, episode)
  }
  function markPlaybackStarted(el:HTMLVideoElement) {
    clearMediaFailure(media.id,episode)
    const entry=state.progress[progressKey(media.id,episode)]
    if(entry&&isCompleted(entry)&&Number.isFinite(el.duration)&&el.duration>0&&el.currentTime/el.duration<.95)setCompleted(progressKey(media.id,episode),false)
  }
  // Capture the old element before React detaches it on route/episode changes.
  useLayoutEffect(() => {
    const el = video.current
    const persist = () => { if (el&&(!requireVideo||el.videoWidth>0)) saver.current(media, el.currentTime * 1000, el.duration * 1000, episode) }
    const background = () => { persist(); el?.pause() }
    const visibility = () => { if (document.visibilityState === 'hidden') background() }
    window.addEventListener('pagehide', background); document.addEventListener('visibilitychange', visibility)
    window.addEventListener(APP_BACKGROUND_EVENT, background)
    return () => { persist(); el?.pause(); window.removeEventListener('pagehide', background); document.removeEventListener('visibilitychange', visibility); window.removeEventListener(APP_BACKGROUND_EVENT, background) }
  }, [media.id, episode?.seasonNumber, episode?.episodeNumber, attempt])
  function seek(delta: number) { const el = video.current; if (el && Number.isFinite(el.duration)) el.currentTime = Math.max(0, Math.min(el.duration, el.currentTime + delta)) }
  async function fullscreen() { try { if(document.fullscreenElement===wrapper.current)await document.exitFullscreen();else await wrapper.current?.requestFullscreen(); setFullscreenError('') } catch { setFullscreenError('Use o controle de tela cheia do vídeo neste navegador.') } }
  const togglePlay=()=>{const el=video.current;if(!el)return;reveal();if(el.paused)void el.play().catch(()=>setNeedsGesture(true));else el.pause()}
  const changeVolume=(value:number)=>{if(!video.current)return;const safe=Math.max(0,Math.min(1,value));video.current.volume=safe;video.current.muted=safe===0;setVolume(safe);reveal()}
  const fullscreenButton = <button aria-label={isFullscreen?'Sair da tela cheia':'Tela cheia'} onClick={()=>{void fullscreen();reveal()}}>{isFullscreen?<Minimize size={18}/>:<Maximize size={18}/>}</button>
  const transport=integrated&&controlsEnabled&&<div className={`web-controls ${controlsVisible?'visible':''}`} aria-hidden={!controlsVisible} inert={!controlsVisible}>
    {!isFullscreen && <div className="web-controls-top"><button aria-label="Voltar às fontes" onClick={onSources}><ArrowLeft size={20}/></button><span>{session.title}</span><button onClick={onSources}>Servidores</button></div>}
    <div className="web-controls-bottom"><input className="web-progress" type="range" aria-label="Progresso do vídeo" min="0" max={Number.isFinite(duration)&&duration>0?duration:1} step="0.1" value={Math.min(position,Number.isFinite(duration)&&duration>0?duration:1)} disabled={!Number.isFinite(duration)||duration<=0} onChange={event=>{if(video.current)video.current.currentTime=Number(event.target.value);reveal()}}/>
      <div className="web-control-actions"><button aria-label={isPlaying?'Pausar vídeo':'Reproduzir vídeo'} onClick={togglePlay}>{isPlaying?<Pause size={20}/>:<Play size={20}/>}</button><button aria-label="Voltar 10 segundos" onClick={()=>{seek(-10);reveal()}}><RotateCcw size={18}/></button><button aria-label="Avançar 10 segundos" onClick={()=>{seek(10);reveal()}}><RotateCw size={18}/></button><span className="web-time">{formatTime(position)} / {formatTime(duration)}</span><button aria-label={volume?'Silenciar áudio':'Ativar áudio'} onClick={()=>changeVolume(volume?0:1)}>{volume?<Volume2 size={18}/>:<VolumeX size={18}/>}</button><input className="web-volume" type="range" aria-label="Volume" min="0" max="1" step="0.05" value={volume} onChange={event=>changeVolume(Number(event.target.value))}/><button aria-label="Configurações do vídeo" aria-expanded={settingsOpen} onClick={()=>{setSettingsOpen(value=>!value);reveal()}}><Settings size={18}/></button>{typeof document.documentElement.requestFullscreen==='function'&&fullscreenButton}</div>
    </div>
    {settingsOpen&&<div className="web-player-settings"><label>Volume<input type="range" aria-label="Volume nas configurações" min="0" max="1" step="0.05" value={volume} onChange={event=>changeVolume(Number(event.target.value))}/></label><label>Velocidade<select aria-label="Velocidade de reprodução" value={speed} onChange={event=>{const value=Number(event.target.value);setSpeed(value);if(video.current)video.current.playbackRate=value}}>{[.75,1,1.25,1.5,2].map(value=><option key={value} value={value}>{value}×</option>)}</select></label>{audio.tracks.length>1&&<label>Áudio<select aria-label="Faixa de áudio" onChange={event=>audio.select(Number(event.target.value))}>{audio.tracks.map(track=><option key={track.id} value={track.id}>{track.label}</option>)}</select></label>}{!!audio.subtitles.length&&<label>Legendas<select aria-label="Legendas" defaultValue="-1" onChange={event=>audio.selectSubtitle(Number(event.target.value))}><option value="-1">Desativadas</option>{audio.subtitles.map(track=><option key={track.id} value={track.id}>{track.label}</option>)}</select></label>}</div>}
  </div>
  return <div className={`video-component ${integrated?'integrated-video':''}`}><div className="video-frame" ref={wrapper} tabIndex={integrated?0:undefined} role={integrated?'group':undefined} aria-label={integrated?`Controles de ${session.title}`:undefined} onPointerMove={event=>{if(integrated&&event.pointerType==='mouse')reveal()}} onFocus={()=>{if(integrated)reveal()}} onBlur={()=>{if(integrated)setInteraction(value=>value+1)}} onClick={event=>{if(integrated&&event.target===video.current){setControlsVisible(value=>!value);setInteraction(value=>value+1)}}} onKeyDown={event=>{if(!integrated||event.target!==wrapper.current)return;if(event.code==='Space'){event.preventDefault();togglePlay()}else if(event.code==='ArrowRight'){event.preventDefault();seek(10);reveal()}else if(event.code==='ArrowLeft'){event.preventDefault();seek(-10);reveal()}}}><video key={attempt} ref={video} controls={!integrated} playsInline preload="metadata" poster={session.poster} aria-label={`Reprodutor de ${session.title}`} onLoadStart={()=>onRendererEvent?.('preparação')} onError={() => {
    save(true)
    onPlaybackEvent?.('failed', 0, `Erro HTML5 de mídia: ${video.current?.error?.code ?? 'não informado'}`)
    setError(true)
    // Network/aborted loads may be transient. Only confirmed decode/source errors hide a title.
    if (reportAvailability && [3, 4].includes(video.current?.error?.code ?? 0)) reportMediaFailure(media.id, episode)
  }} onWaiting={()=>onStateChange?.('buffering')} onCanPlay={restorePosition} onProgress={restorePosition} onDurationChange={() => {
    setDuration(video.current?.duration ?? 0)
    restorePosition()
  }} onPlaying={() => {
    setIsPlaying(true);setNeedsGesture(false);onPlaybackEvent?.('playing'); if(!requireVideo||!!video.current?.videoWidth)onStateChange?.('playing')
    if(!requireVideo&&video.current)markPlaybackStarted(video.current)
  }} onLoadedMetadata={() => {
    const el = video.current
    if (!el) return
    setDuration(el.duration)
    onPlaybackEvent?.('loaded')
    restorePosition()
    el.playbackRate = speed
    if (startOnReady) void el.play().catch(() => {setNeedsGesture(true);setPlaybackNotice('Toque em reproduzir para continuar.');onStateChange?.('paused')})
  }} onTimeUpdate={() => {
    const el = video.current
    setPosition(el?.currentTime ?? 0); save()
    const audioBytes=(el as (HTMLVideoElement&{webkitAudioDecodedByteCount?:number})|null)?.webkitAudioDecodedByteCount
    if(audioBytes)onRendererEvent?.('audio')
    const visibleVideo=el&&el.videoWidth>0&&(firstFrame.current||typeof el.requestVideoFrameCallback!=='function')
    if (el && !el.paused && !el.seeking && el.readyState >= 2 && (!requireVideo||visibleVideo)) {
      const previous = lastPlaybackTime.current; lastPlaybackTime.current = el.currentTime
      if (previous !== undefined && el.currentTime > previous + .05 && el.currentTime - previous < 2) {
        if(requireVideo&&!hasAdvanced.current){
          hasAdvanced.current=true
          markPlaybackStarted(el)
        }
        if(audioBytes&&firstFrame.current)onRendererEvent?.('reprodução-confirmada',el.currentTime)
        onPlaybackEvent?.('progress',el.currentTime)
      }
    } else lastPlaybackTime.current = undefined
    if (el) onProgress?.({ positionSeconds: el.currentTime, durationSeconds: el.duration })
  }} onSeeked={() => {
    save(true)
    const el = video.current
    if (el) onProgress?.({ positionSeconds: el.currentTime, durationSeconds: el.duration })
  }} onVolumeChange={()=>{if(video.current)setVolume(video.current.muted?0:video.current.volume)}} onPause={() => {setIsPlaying(false);setControlsVisible(true);save(true);onStateChange?.('paused')}} onEnded={() => { if(requireVideo&&!video.current?.videoWidth){onPlaybackEvent?.('failed',0,'NO_VIDEO_OUTPUT');return} save(true); if(persistHistory)setCompleted(progressKey(media.id, episode), true); onEnded?.() }}>
    {session.sources.filter(source => source.type !== 'application/vnd.apple.mpegurl').map(source => <source key={source.src} src={source.src} type={source.type} />)}Seu navegador não suporta vídeo HTML5.
    </video>{transport}{!integrated&&isFullscreen&&<div className="web-controls-top standalone-fullscreen-controls">{fullscreenButton}</div>}{needsGesture&&!error&&<div className="video-start"><button className="button button-primary" onClick={()=>{void video.current?.play().then(()=>setNeedsGesture(false)).catch(()=>setPlaybackNotice('Toque no controle de reprodução do vídeo para iniciar.'))}}>Iniciar reprodução</button></div>}{!error && overlay}{error && <div className="video-error" role="alert"><h2>Não conseguimos iniciar o vídeo</h2><p>Não foi possível carregar esta fonte. Verifique sua conexão ou tente novamente.</p><button className="button button-primary" onClick={() => {
      resume.current = state.progress[progressKey(media.id, episode)]; resumed.current = false; lastSave.current = -Infinity
      setError(false); setAttempt(a => a + 1)
    }}>Tentar novamente</button></div>}</div>
    {!integrated&&<><div className="player-toolbar"><div className="player-seek"><button aria-label="Voltar 10 segundos" onClick={() => seek(-10)}><RotateCcw size={19} /><span>10</span></button><button aria-label="Avançar 10 segundos" onClick={() => seek(10)}><RotateCw size={19} /><span>10</span></button><span className="player-time">{formatTime(position)} <span>/ {formatTime(duration)}</span></span></div><div className="player-settings"><Volume2 size={16} className="toolbar-volume" /><select aria-label="Velocidade de reprodução" value={speed} onChange={e => { const value = Number(e.target.value); setSpeed(value); if (video.current) video.current.playbackRate = value }}>{[.75, 1, 1.25, 1.5, 2].map(s => <option key={s} value={s}>{s}×</option>)}</select><button aria-label="Tela cheia" onClick={fullscreen}><Maximize size={19} /></button></div></div>{fullscreenError && <p className="muted" role="status">{fullscreenError}</p>}
    {audio.tracks.length > 1 && <label className="watch-autonext">Faixa de áudio<select aria-label="Faixa de áudio" onChange={event => audio.select(Number(event.target.value))}>{audio.tracks.map(track => <option key={track.id} value={track.id}>{track.label}</option>)}</select></label>}
    {!!audio.subtitles.length && <label className="watch-autonext">Legendas<select aria-label="Legendas" onChange={event=>audio.selectSubtitle(Number(event.target.value))}><option value="-1">Desativadas</option>{audio.subtitles.map(track=><option key={track.id} value={track.id}>{track.label}</option>)}</select></label>}
    </>}{audio.notice && <p role="alert">{simpleFeedback?'Não foi possível carregar esta fonte.':audio.notice}</p>}
    {playbackNotice && <p className="muted" role="status">{playbackNotice}</p>}
  </div>
}
