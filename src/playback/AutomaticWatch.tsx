import {useCallback,useEffect,useRef,useState} from 'react'
import {useSearchParams} from 'react-router'
import {ArrowRight,AudioLines,Captions,Play} from 'lucide-react'
import type {CatalogProvider,Media} from '../domain/media'
import type {EpisodeSelection} from '../domain/episodes'
import {episodeSequence,nearEpisodeEnd,progressKey,selectionFromUrl,NEXT_EPISODE_SECONDS,validSelection} from '../domain/episodes'
import {useAsync} from '../hooks/useAsync'
import {useLibrary,knownProgress,isCompleted} from '../state/library'
import {BackLink} from '../components/Layout'
import {VideoPlayer} from '../components/VideoPlayer'
import {IframePlayer} from '../components/IframePlayer'
import {EpisodePicker} from '../components/EpisodePicker'
import {PlaybackDetails} from '../components/PlaybackDetails'
import {PlaybackCoordinator} from './coordinator'
import type {PlaybackState} from './coordinator'
import {createSourceProviders} from './providers'
import {playbackProvider} from '../services/playback'
import {inspectFenixRedirect,useNativeExperimentAvailable,useNativePlaybackAvailable} from '../experimental/playbackEngine'
import {experimentalProvidersEnabled} from '../config/experimentalProviders'
import {recordNativeNetworkFailure} from '../experimental/nativeAttempt'
import {NativePlaybackView,PlaybackDeadline,nativeEventIsProgress} from './NativePlaybackView'
import type {LanguageChoice} from './sourcePolicy'
import {APP_BACKGROUND_EVENT} from '../components/AndroidLifecycle'
import {PlayerStage,PlaybackSlot,languageNames} from './PlayerStage'
import {SourceSelection} from './SourceSelection'
const initialState:PlaybackState={phase:'searching',options:[],position:0,duration:0,outcomes:[],alternatives:[],failedIds:[],attempts:0}
export function AutomaticWatch({media,catalogProvider}:{media:Media;catalogProvider:CatalogProvider}){
 const [params,setParams]=useSearchParams();const {state:library,saveProgress,savePlaybackPreference,setCompleted,recordIframeOpen}=useLibrary()
 const history=useRef(library);history.current=library
 const nativeAvailability=useNativePlaybackAvailable();const series=media.kind==='tv'
 const debugAvailable=useNativeExperimentAvailable()
 const experimental=experimentalProvidersEnabled&&(import.meta.env.DEV||debugAvailable===true)
 const waitingForDebug=experimentalProvidersEnabled&&!import.meta.env.DEV&&debugAvailable===undefined
 const [redirectReady,setRedirectReady]=useState<string>()
 const [initial]=useState(()=>Object.values(library.progress).filter(item=>item.media.id===media.id&&item.episode&&!isCompleted(item)).sort((a,b)=>b.updatedAt-a.updatedAt)[0]?.episode??{seasonNumber:media.seasons?.filter(s=>s.number>0).sort((a,b)=>a.number-b.number)[0]?.number??1,episodeNumber:1})
 const invalidSelection=series&&(params.has('temporada')||params.has('episodio'))&&!selectionFromUrl(params)
 const current=series?(selectionFromUrl(params)??initial):undefined;const key=progressKey(media.id,current)
 const [version,setVersion]=useState(0);const [state,setState]=useState<PlaybackState>(initialState)
 const [languageNotice,setLanguageNotice]=useState<{runId:string;language:'dub'|'sub'}>()
 const lastNotice=useRef<{key:string;language:LanguageChoice}|undefined>(undefined)
 const coordinator=useRef<PlaybackCoordinator|undefined>(undefined);const preference=useRef<LanguageChoice|undefined>(undefined)
 const releases=useRef<Promise<void>>(Promise.resolve());const wait=useCallback(()=>releases.current,[])
 const [autoNext,setAutoNext]=useState(()=>{try{return localStorage.getItem('nocta.autonext')!=='false'}catch{return true}})
 const {data:sequenceResult}=useAsync(async signal=>series&&current?{...(await episodeSequence(media,current,catalogProvider,signal)),forKey:key}:undefined,[key,catalogProvider])
 const sequence=sequenceResult?.forKey===key?sequenceResult:undefined
 const background=useRef(false);const ended=useRef<string|undefined>(undefined);const advanced=useRef<string|undefined>(undefined)
 const lastSave=useRef(0);const nativePosition=useRef<{position:number;duration:number}|undefined>(undefined)
 const remembered=useRef<string|undefined>(undefined)
 const [visibleTick,setVisibleTick]=useState(0);const [embedReady,setEmbedReady]=useState(false)
 useEffect(()=>{const pause=()=>{background.current=true};const visible=()=>{if(document.visibilityState==='visible'){background.current=false;setVisibleTick(value=>value+1)}};window.addEventListener(APP_BACKGROUND_EVENT,pause);window.addEventListener('focus',visible);document.addEventListener('visibilitychange',visible);return()=>{window.removeEventListener(APP_BACKGROUND_EVENT,pause);window.removeEventListener('focus',visible);document.removeEventListener('visibilitychange',visible)}},[])
 useEffect(()=>{
  let live=true;let instance:PlaybackCoordinator|undefined;let unsubscribe:(()=>void)|undefined
  if(nativeAvailability===undefined||waitingForDebug)return
  const controller=new AbortController();setState(initialState);ended.current=undefined;advanced.current=undefined;lastSave.current=0;nativePosition.current=undefined;remembered.current=undefined
  void (async()=>{
   if(invalidSelection){setState({...initialState,phase:'error'});return}
   const nativeOrigins=typeof nativeAvailability==='object'?nativeAvailability.origins:undefined
   const publicMediaTransport=typeof nativeAvailability==='object'&&nativeAvailability.publicMediaTransport
   const context={media,episode:current,native:!!nativeAvailability,nativeOrigins,publicMediaTransport}
   const providers=createSourceProviders({experimental})
   if(series&&current&&!providers.some(provider=>provider.confirmed?.(context))){
    const knownSeason=media.seasons?.find(season=>season.number===current.seasonNumber)
    const knownRange=!!knownSeason&&current.episodeNumber<=knownSeason.episodeCount
    const result=await catalogProvider.episodes(media,current.seasonNumber,controller.signal).catch(()=>undefined)
    const valid=result&&result.origin!=='fallback'?result.data.some(episode=>episode.number===current.episodeNumber):experimental&&knownRange
    if(!valid){if(live)setState({...initialState,phase:'error'});return}
   }
   if(!live)return
   const entry=history.current.progress[key],checkpoint=entry&&!isCompleted(entry)?knownProgress(entry):undefined
   const savedPreference=entry?.preference;preference.current??=savedPreference?.language
   const embeddedFallback=!experimental&&import.meta.env.VITE_ENABLE_EMBEDMOVIES_FALLBACK==='true'?playbackProvider:undefined
   instance=new PlaybackCoordinator(providers,embeddedFallback,context,preference.current,{position:(checkpoint?.positionMs??0)/1000,duration:(checkpoint?.durationMs??0)/1000,sourceKey:savedPreference?.sourceKey,providerId:savedPreference?.providerId},experimental,true);coordinator.current=instance;unsubscribe=instance.subscribe(setState);await instance.start()
  })()
  return()=>{live=false;controller.abort();unsubscribe?.();instance?.dispose();if(coordinator.current===instance)coordinator.current=undefined}
 },[key,version,nativeAvailability,catalogProvider,invalidSelection,experimental,waitingForDebug])
 useEffect(()=>{if(state.language)preference.current=state.language},[state.language])
 const choose=(language:LanguageChoice)=>coordinator.current?.choose(language)
 const go=useCallback((selection:EpisodeSelection)=>{if(!validSelection(selection)||progressKey(media.id,selection)===key)return;const updated=new URLSearchParams(params);updated.set('temporada',String(selection.seasonNumber));updated.set('episodio',String(selection.episodeNumber));setParams(updated,{replace:true})},[key,params,setParams])
 function onEnded(runId:string){if(coordinator.current?.state.runId!==runId||ended.current===key)return;ended.current=key;setCompleted(key,true)}
 useEffect(()=>{if(state.phase==='ended'&&ended.current===key&&advanced.current!==key&&autoNext&&!background.current&&document.visibilityState!=='hidden'&&sequence?.next){advanced.current=key;go(sequence.next)}},[state.phase,key,autoNext,sequence?.next?.seasonNumber,sequence?.next?.episodeNumber,visibleTick])
 function rememberPreference(){if(!state.runId||remembered.current===state.runId)return;const item=state.candidate;const sourceKey=item?.resumeKey??(embed?'embedmovies':undefined);if(!sourceKey)return;const mime=item?.input?.mimeType??item?.session?.sources[0]?.type;const format=embed?'iframe':mime==='video/mp4'?'mp4':mime==='video/webm'?'webm':mime==='video/x-matroska'?'matroska':mime==='application/vnd.apple.mpegurl'?'hls':'unknown';const providerId=item?.providerId??'embedmovies';if(!['fenixflix','brazuca','embedmovies','zeus'].includes(providerId))return;if(savePlaybackPreference(media,{providerId:providerId as 'fenixflix'|'brazuca'|'embedmovies'|'zeus',sourceKey,format,engine:embed?'iframe':item!.engine,language:state.language??'unknown',savedAt:Date.now()},current))remembered.current=state.runId}
 function persistNative(force=false){const value=nativePosition.current;if(!value||(!force&&Date.now()-lastSave.current<5000))return;lastSave.current=Date.now();saveProgress(media,value.position*1000,value.duration*1000,current);rememberPreference()}
 function leaveNative(){persistNative(true);nativePosition.current=undefined;lastSave.current=0}
 useEffect(()=>()=>{persistNative(true)},[key])
 const candidate=state.candidate;const runId=state.runId;const next=sequence?.next
 const declaredLanguage=state.language&&state.language!=='unknown'&&candidate?.language.modes.includes(state.language)?state.language:undefined
 const showLanguageNotice=!!declaredLanguage&&(lastNotice.current?.key!==key||lastNotice.current.language!==declaredLanguage)
 useEffect(()=>{
  if(!state.hasStarted||!runId||!declaredLanguage||!showLanguageNotice)return
  lastNotice.current={key,language:declaredLanguage}
  if(candidate?.engine==='web')setLanguageNotice({runId,language:declaredLanguage})
 },[state.hasStarted,runId,key,declaredLanguage,showLanguageNotice,candidate?.engine])
 useEffect(()=>{if(languageNotice){const timer=setTimeout(()=>setLanguageNotice(undefined),2100);return()=>clearTimeout(timer)}},[languageNotice])
 useEffect(()=>{
  const url=candidate?.session?.sources[0]?.src
  if(candidate?.engine!=='web'||!candidate.checkRedirect||!runId||!url)return
  const instance=coordinator.current
  let live=true
  void inspectFenixRedirect(url).then(result=>{
   if(!live||instance?.state.runId!==runId)return
   instance.trace(runId,'redirecionamento',{status:result.status,downgrade:result.downgrade,inconclusive:result.inconclusive})
   if(result.downgrade){instance.rejectTransport(runId,'O servidor redirecionou o vídeo de HTTPS para HTTP.',result.status);return}
   setRedirectReady(runId)
  }).catch(()=>{if(live)setRedirectReady(runId)})
  return()=>{live=false}
 },[runId,candidate])
 const resume=library.progress[key];const resumeSeconds=resume&&!isCompleted(resume)?(knownProgress(resume)?.positionMs??0)/1000:0
 const floatNext=series&&next&&state.hasStarted&&nearEpisodeEnd({positionSeconds:state.position,durationSeconds:state.duration})?<button className="next-episode-overlay" onClick={()=>go(next)}>Próximo episódio<ArrowRight size={18}/></button>:undefined
 const embed=!!state.fallback&&!!runId?.startsWith('embed-')
 useEffect(()=>{setEmbedReady(false);if(embed){recordIframeOpen(media,current);rememberPreference()}},[runId,embed])
 const loading=['searching','preparing'].includes(state.phase)||state.phase==='buffering'&&!state.hasStarted||embed&&!embedReady
 const selectSource=(id:string,language:LanguageChoice)=>{if(coordinator.current?.selectSource(id,language))preference.current=coordinator.current.state.language}
 const openSources=()=>{if(candidate?.engine==='native')leaveNative();coordinator.current?.showSources()}
 const selectionOpen=state.phase==='sources'||state.phase==='language'
 const retry=()=>setVersion(value=>value+1)
 return <div className="page-shell watch-page automatic-watch"><div className="watch-heading"><BackLink>Voltar</BackLink><span><Play size={14}/>NOCTA Player</span></div>
  <h1 className="automatic-watch-title">{media.title}{current&&<small>Temporada {current.seasonNumber} · Episódio {current.episodeNumber}</small>}</h1>
  <PlayerStage media={media} mediaVisible={embed&&embedReady} selectionOpen={selectionOpen} loading={loading} buffering={state.phase==='buffering'&&!!state.hasStarted} token={`${key}:${version}`} message={state.phase==='searching'?'Procurando servidores…':state.attempts>1?'Preparando outro servidor…':'Preparando vídeo…'} progress={state.phase==='searching'&&state.outcomes.length?`${state.outcomes.filter(row=>row.state!=='waiting'&&row.state!=='checking').length} de ${state.outcomes.length} consultas concluídas`:undefined}>
   {selectionOpen&&<SourceSelection state={state} onSelect={selectSource} onEmbed={()=>coordinator.current?.openEmbed(true)} onResume={()=>coordinator.current?.resume()} onRetry={retry}/>}
   {state.phase==='language-exhausted'&&<div className="stage-message" role="alert"><h2>Não foi possível assistir nesta versão</h2>{state.options.filter(mode=>mode!==state.language).map(mode=><button key={mode} className="button button-secondary" onClick={()=>choose(mode)}>{mode==='unknown'?'Tentar outra opção':`Tentar ${languageNames[mode].toLowerCase()}`}</button>)}<button className="text-link" onClick={openSources}>Escolher servidor</button><button className="text-link" onClick={retry}>Buscar novamente</button></div>}
   {state.phase==='error'&&<div role="alert" className="stage-message"><h2>Não foi possível assistir agora</h2><button className="button button-primary" onClick={retry}>Tentar novamente</button>{state.alternatives.length>0&&<button className="text-link" onClick={openSources}>Escolher servidor</button>}</div>}
   {candidate&&runId&&<PlaybackDeadline runId={runId} phase={state.phase} position={state.position} onTimeout={()=>{
    if(coordinator.current?.state.runId!==runId)return
    if(candidate.engine==='native')leaveNative()
    coordinator.current.fail(runId,false,'Tempo limite de início ou retomada da mídia.')
   }}/>}
   {embed&&!embedReady&&runId&&<PlaybackDeadline runId={runId} phase="preparing" position={0} onTimeout={()=>coordinator.current?.iframeFailed(runId)}/>}
   {candidate&&runId&&(candidate.engine!=='web'||!candidate.checkRedirect||redirectReady===runId)&&<PlaybackSlot key={runId} runId={runId} wait={wait}>
    {candidate.engine==='native'&&candidate.input?<NativePlaybackView input={{...candidate.input,sessionId:runId,sourceId:candidate.id,providerId:candidate.providerId,title:`${media.title}${current?` · T${current.seasonNumber} E${current.episodeNumber}`:''}`,preferredLanguage:state.language,showLanguageNotice,startPositionSeconds:state.position>0?state.position:resumeSeconds,nextAvailable:!!next,nextPromptSeconds:NEXT_EPISODE_SECONDS}} nextAvailable={!!next} onRelease={closing=>{releases.current=closing}} onResume={()=>coordinator.current?.resume()} onEvent={event=>{
     if(coordinator.current?.state.runId!==runId)return
     if(experimental)recordNativeNetworkFailure(candidate.providerId,candidate.id,candidate.input!.mimeType,event)
     if(event.event==='loaded'||event.event==='video'||event.event==='audio'||event.event==='diagnostic'&&event.detail==='load-request')coordinator.current.trace(runId,event.detail==='load-request'?'preparação':event.event)
     if(event.videoRendered&&event.audioAdvancing&&event.durationSeconds&&Number.isFinite(event.positionSeconds))nativePosition.current={position:event.positionSeconds,duration:event.durationSeconds}
     if(event.event==='failed'){
      leaveNative()
      const engineFailure=!event.httpStatus&&(event.category==='codec'||event.category==='format'||!event.category&&event.detail==='INITIALIZATION_EXCEPTION')
      if(engineFailure&&coordinator.current.retryInWeb(runId))return
      const revalidate=candidate.input?.mimeType==='application/vnd.apple.mpegurl'&&(event.httpStatus===404||event.httpStatus===410)
      coordinator.current.fail(runId,revalidate,event.httpStatus?`A mídia respondeu HTTP ${event.httpStatus}.`:`Media3: ${event.category??'initialization'}${event.errorCode?' ('+event.errorCode+')':''}.`,event.httpStatus);return
     }
     if(event.event==='sources'){openSources();return}
     if(event.event==='next'){if(next)go(next);return}
     if(event.event==='ended'){if(!event.videoRendered||!event.audioAdvancing){coordinator.current.event(runId,'failed');return}persistNative(true);coordinator.current.event(runId,'ended');onEnded(runId);return}
     if(event.event==='closed'){persistNative(true);if(event.detail==='user-dismissed')coordinator.current.event(runId,'closed');return}
     if(nativeEventIsProgress(event)){coordinator.current.trace(runId,'reprodução-confirmada',{position:event.positionSeconds});persistNative();coordinator.current.event(runId,'progress',event.positionSeconds,event.durationSeconds)}
     else if(event.playWhenReady===false&&(state.hasStarted||event.detail==='activity-pause')){persistNative(true);coordinator.current.event(runId,'paused')}
     else if(event.state==='BUFFERING')coordinator.current.event(runId,'buffering')
    }}/>:candidate.session&&<VideoPlayer integrated controlsEnabled={!!state.hasStarted||state.phase==='paused'} onSources={openSources} session={candidate.session} simpleFeedback reportAvailability={false} requireVideo media={media} episode={current} startOnReady overlay={floatNext} validateMediaUrl={candidate.validateMediaUrl} initialPositionSeconds={state.position>0?state.position:resumeSeconds} onStateChange={phase=>coordinator.current?.event(runId,phase)} onRendererEvent={experimental?(event,position)=>coordinator.current?.trace(runId,event,{position}):undefined} onPlaybackEvent={(event,position,detail)=>{if(event==='loaded')coordinator.current?.trace(runId,'loaded');if(event==='failed'){const reason=detail?.match(/^Erro HTML5 de mídia: (?:[1-4]|não informado)$/)?.[0]??(detail?.startsWith('HLS networkError:')?'Falha de rede no HLS.':'Falha no carregamento da mídia HTML5.');coordinator.current?.fail(runId,detail?.startsWith('HLS networkError:')||detail==='Erro HTML5 de mídia: 2',reason)}if(event==='progress'){coordinator.current?.event(runId,'progress',position);rememberPreference()}}} onProgress={progress=>coordinator.current?.position(runId,progress.positionSeconds,progress.durationSeconds)} onEnded={()=>{if(coordinator.current?.state.runId!==runId)return;coordinator.current.event(runId,'ended');onEnded(runId)}}/>}
   </PlaybackSlot>}
   {languageNotice&&languageNotice.runId===runId&&<div className="playback-language-notice" role="status">{languageNotice.language==='dub'?<AudioLines size={18}/>:<Captions size={18}/>}<div><strong>Reproduzindo {languageNotice.language==='dub'?'dublado':'legendado'}</strong><small>Versão informada pelo servidor</small></div></div>}
   {embed&&state.fallback&&runId&&<PlaybackSlot key={runId} runId={runId} wait={wait}><div className="embedded-surface"><IframePlayer session={state.fallback} onDocumentReady={()=>setEmbedReady(true)} onFailure={()=>coordinator.current?.iframeFailed(runId)}/></div></PlaybackSlot>}
   {embed&&<div className="embedded-help"><small>Disponibilidade não confirmada</small><button className="button button-secondary" onClick={openSources}>Problema com o vídeo? Escolher outro servidor</button></div>}
   {!embed&&!selectionOpen&&!state.hasStarted&&state.phase!=='error'&&state.phase!=='language-exhausted'&&<div className="stage-tools"><button className="text-link" disabled={!state.outcomes.length} onClick={openSources}>Servidores</button></div>}
  </PlayerStage>
  {series&&current&&<EpisodePicker media={media} provider={catalogProvider} current={current} previous={sequence?.previous} next={next} busy={false} onSelect={go} autoAdvance={autoNext} onAutoAdvanceChange={value=>{setAutoNext(value);try{localStorage.setItem('nocta.autonext',String(value))}catch{}}} supportsProgress={!embed}/>}
  {series&&state.phase==='ended'&&!next&&sequence?.status==='complete'&&<p role="status" className="notice">Você chegou ao último episódio disponível.</p>}
  <PlaybackDetails media={media}/>
 </div>
}
