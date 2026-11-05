import {useCallback,useEffect,useRef,useState} from 'react'
import {useSearchParams} from 'react-router'
import {ArrowRight,Play,ArrowLeft,RefreshCw} from 'lucide-react'
import type {CatalogProvider,Media} from '../domain/media'
import type {EpisodeSelection} from '../domain/episodes'
import {episodeSequence,nearEpisodeEnd,progressKey,selectionFromUrl,NEXT_EPISODE_SECONDS,validSelection} from '../domain/episodes'
import {useAsync} from '../hooks/useAsync'
import {useLibrary,isTimedProgress,isCompleted} from '../state/library'
import {BackLink} from '../components/Layout'
import {VideoPlayer} from '../components/VideoPlayer'
import {IframePlayer} from '../components/IframePlayer'
import {EpisodePicker} from '../components/EpisodePicker'
import {PlaybackDetails} from '../components/PlaybackDetails'
import {PlaybackCoordinator} from './coordinator'
import type {PlaybackState} from './coordinator'
import {createSourceProviders} from './providers'
import {playbackProvider} from '../services/playback'
import {useNativePlaybackAvailable} from '../experimental/playbackEngine'
import {NativePlaybackView,PlaybackDeadline,nativeEventIsProgress} from './NativePlaybackView'
import type {LanguageChoice} from './sourcePolicy'
import {APP_BACKGROUND_EVENT} from '../components/AndroidLifecycle'
import {PlayerStage,ProviderRows,SourceChoices,PlaybackSlot,languageNames} from './PlayerStage'
const initialState:PlaybackState={phase:'searching',options:[],position:0,duration:0,outcomes:[],alternatives:[],failedIds:[],attempts:0}
export function AutomaticWatch({media,catalogProvider}:{media:Media;catalogProvider:CatalogProvider}){
 const [params,setParams]=useSearchParams();const {state:library,saveProgress,setCompleted,recordIframeOpen}=useLibrary()
 const native=useNativePlaybackAvailable();const series=media.kind==='tv'
 const [initial]=useState(()=>Object.values(library.progress).filter(item=>item.media.id===media.id&&item.episode&&!isCompleted(item)).sort((a,b)=>b.updatedAt-a.updatedAt)[0]?.episode??{seasonNumber:media.seasons?.filter(s=>s.number>0).sort((a,b)=>a.number-b.number)[0]?.number??1,episodeNumber:1})
 const invalidSelection=series&&(params.has('temporada')||params.has('episodio'))&&!selectionFromUrl(params)
 const current=series?(selectionFromUrl(params)??initial):undefined;const key=progressKey(media.id,current)
 const [version,setVersion]=useState(0);const [state,setState]=useState<PlaybackState>(initialState)
 const coordinator=useRef<PlaybackCoordinator|undefined>(undefined);const preference=useRef<LanguageChoice|undefined>(undefined)
 const releases=useRef<Promise<void>>(Promise.resolve());const wait=useCallback(()=>releases.current,[])
 const [autoNext,setAutoNext]=useState(()=>{try{return localStorage.getItem('nocta.autonext')!=='false'}catch{return true}})
 const {data:sequenceResult}=useAsync(async signal=>series&&current?{...(await episodeSequence(media,current,catalogProvider,signal)),forKey:key}:undefined,[key,catalogProvider])
 const sequence=sequenceResult?.forKey===key?sequenceResult:undefined
 const background=useRef(false);const ended=useRef<string|undefined>(undefined);const advanced=useRef<string|undefined>(undefined)
 const lastSave=useRef(0);const nativePosition=useRef<{position:number;duration:number}|undefined>(undefined)
 const [visibleTick,setVisibleTick]=useState(0);const [embedReady,setEmbedReady]=useState(false)
 const sourceHeading=useRef<HTMLHeadingElement>(null)
 useEffect(()=>{const pause=()=>{background.current=true};const visible=()=>{if(document.visibilityState==='visible'){background.current=false;setVisibleTick(value=>value+1)}};window.addEventListener(APP_BACKGROUND_EVENT,pause);window.addEventListener('focus',visible);document.addEventListener('visibilitychange',visible);return()=>{window.removeEventListener(APP_BACKGROUND_EVENT,pause);window.removeEventListener('focus',visible);document.removeEventListener('visibilitychange',visible)}},[])
 useEffect(()=>{
  let live=true;let instance:PlaybackCoordinator|undefined;let unsubscribe:(()=>void)|undefined
  if(native===undefined)return
  const controller=new AbortController();setState(initialState);ended.current=undefined;advanced.current=undefined;lastSave.current=0;nativePosition.current=undefined
  void (async()=>{
   if(invalidSelection){setState({...initialState,phase:'error'});return}
   if(series&&current){try{const result=await catalogProvider.episodes(media,current.seasonNumber,controller.signal);if(result.origin==='fallback'||!result.data.some(e=>e.number===current.episodeNumber)){if(live)setState({...initialState,phase:'error'});return}}catch{if(live)setState({...initialState,phase:'error'});return}}
   if(!live)return
   instance=new PlaybackCoordinator(createSourceProviders(),playbackProvider,{media,episode:current,native},preference.current);coordinator.current=instance;unsubscribe=instance.subscribe(setState);await instance.start()
  })()
  return()=>{live=false;controller.abort();unsubscribe?.();instance?.dispose();if(coordinator.current===instance)coordinator.current=undefined}
 },[key,version,native,catalogProvider,invalidSelection])
 useEffect(()=>{if(state.language)preference.current=state.language},[state.language])
 const choose=(language:LanguageChoice)=>{preference.current=language;coordinator.current?.choose(language)}
 const go=useCallback((selection:EpisodeSelection)=>{if(!validSelection(selection)||progressKey(media.id,selection)===key)return;const updated=new URLSearchParams(params);updated.set('temporada',String(selection.seasonNumber));updated.set('episodio',String(selection.episodeNumber));setParams(updated,{replace:true})},[key,params,setParams])
 function onEnded(runId:string){if(coordinator.current?.state.runId!==runId||ended.current===key)return;ended.current=key;setCompleted(key,true)}
 useEffect(()=>{if(state.phase==='ended'&&ended.current===key&&advanced.current!==key&&autoNext&&!background.current&&document.visibilityState!=='hidden'&&sequence?.next){advanced.current=key;go(sequence.next)}},[state.phase,key,autoNext,sequence?.next?.seasonNumber,sequence?.next?.episodeNumber,visibleTick])
 function persistNative(force=false){const value=nativePosition.current;if(!value||(!force&&Date.now()-lastSave.current<5000))return;lastSave.current=Date.now();saveProgress(media,value.position*1000,value.duration*1000,current)}
 useEffect(()=>()=>{persistNative(true)},[key])
 const candidate=state.candidate;const runId=state.runId;const next=sequence?.next
 const resume=library.progress[key];const resumeSeconds=resume&&isTimedProgress(resume)&&!isCompleted(resume)?resume.positionMs/1000:0
 const floatNext=series&&next&&state.hasStarted&&nearEpisodeEnd({positionSeconds:state.position,durationSeconds:state.duration})?<button className="next-episode-overlay" onClick={()=>go(next)}>Próximo episódio<ArrowRight size={18}/></button>:undefined
 const embed=!!state.fallback&&!!runId?.startsWith('embed-')
 useEffect(()=>{setEmbedReady(false);if(embed)recordIframeOpen(media,current)},[runId,embed])
 useEffect(()=>{if(state.phase==='sources'||state.phase==='language')sourceHeading.current?.focus({preventScroll:true})},[state.phase])
 const loading=['searching','preparing'].includes(state.phase)||state.phase==='buffering'&&!state.hasStarted||embed&&!embedReady
 const selectSource=(id:string,language:LanguageChoice)=>{if(coordinator.current?.selectSource(id,language))preference.current=coordinator.current.state.language}
 const problem=()=>{if(embed)coordinator.current?.iframeFailed(runId);else if(runId)coordinator.current?.event(runId,'failed');else coordinator.current?.showSources()}
 return <div className="page-shell watch-page automatic-watch"><div className="watch-heading"><BackLink>Voltar</BackLink><span><Play size={14}/>NOCTA Player</span></div>
  <h1 className="automatic-watch-title">{media.title}{current&&<small>Temporada {current.seasonNumber} · Episódio {current.episodeNumber}</small>}</h1>
  <PlayerStage media={media} loading={loading} buffering={state.phase==='buffering'&&!!state.hasStarted} token={`${key}:${version}`} outcomes={state.outcomes} message={state.phase==='searching'?'Procurando uma fonte disponível…':state.attempts>1?'Tentando outra fonte…':'Preparando vídeo…'}>
   {(state.phase==='sources'||state.phase==='language')&&<section className="source-picker" aria-label="Fontes disponíveis"><header><h2 ref={sourceHeading} tabIndex={-1}>{state.phase==='language'?'Como prefere assistir?':'Idiomas e servidores'}</h2>{state.attempts>0&&<button className="player-icon-button" aria-label="Voltar à reprodução" onClick={()=>coordinator.current?.resume()}><ArrowLeft size={18}/></button>}</header>{state.phase==='language'&&<div className="language-buttons">{state.options.map(mode=><button key={mode} className="button button-primary" onClick={()=>choose(mode)}>{languageNames[mode]}</button>)}</div>}<SourceChoices sources={state.alternatives} language={state.language} failedIds={state.failedIds} onSelect={selectSource} embed={state.phase==='sources'&&!!state.fallback} onEmbed={()=>coordinator.current?.openEmbed(true)}/><ProviderRows outcomes={state.outcomes}/></section>}
   {state.phase==='language-exhausted'&&<div className="stage-message" role="alert"><h2>Essa versão não está disponível</h2><p>Não encontramos outra fonte no idioma escolhido.</p>{state.options.filter(mode=>mode!==state.language).map(mode=><button key={mode} className="button button-secondary" onClick={()=>choose(mode)}>Tentar {languageNames[mode].toLowerCase()}</button>)}<button className="text-link" onClick={()=>setVersion(value=>value+1)}>Buscar novamente</button></div>}
   {state.phase==='embed-offer'&&<div className="stage-message"><h2>Vamos tentar outro player?</h2><p>As fontes anteriores não iniciaram{state.language&&state.language!=='unknown'?` em ${languageNames[state.language].toLowerCase()}`:''}. No player alternativo, confira a versão disponível.</p><button className="button button-primary" onClick={()=>coordinator.current?.openEmbed()}>Abrir player alternativo</button><button className="text-link" onClick={()=>coordinator.current?.showSources()}>Ver servidores</button></div>}
   {state.phase==='error'&&<div role="alert" className="stage-message"><h2>Não conseguimos iniciar o vídeo</h2><p>Tente outro servidor ou volte em alguns instantes.</p><button className="button button-primary" onClick={()=>setVersion(value=>value+1)}>Tentar novamente</button><button className="text-link" onClick={()=>coordinator.current?.showSources()}>Ver servidores</button></div>}
   {candidate&&runId&&<PlaybackSlot key={runId} runId={runId} wait={wait}>
    {candidate.engine==='native'&&candidate.input?<NativePlaybackView input={{...candidate.input,sessionId:runId,sourceId:candidate.id,title:`${media.title}${current?` · T${current.seasonNumber} E${current.episodeNumber}`:''}`,preferredLanguage:state.language,startPositionSeconds:state.position>0?state.position:resumeSeconds,nextAvailable:!!next,nextPromptSeconds:NEXT_EPISODE_SECONDS}} nextAvailable={!!next} onRelease={closing=>{releases.current=closing}} onResume={()=>coordinator.current?.resume()} onEvent={event=>{
     if(coordinator.current?.state.runId!==runId)return
     if(event.videoRendered&&event.audioAdvancing&&event.durationSeconds&&Number.isFinite(event.positionSeconds))nativePosition.current={position:event.positionSeconds,duration:event.durationSeconds}
     if(event.event==='failed'){persistNative(true);coordinator.current.event(runId,'failed');return}
     if(event.event==='sources'){persistNative(true);coordinator.current.showSources();return}
     if(event.event==='next'){if(next)go(next);return}
     if(event.event==='ended'){if(!event.videoRendered||!event.audioAdvancing){coordinator.current.event(runId,'failed');return}persistNative(true);coordinator.current.event(runId,'ended');onEnded(runId);return}
     if(event.event==='closed'){persistNative(true);if(event.detail==='user-dismissed')coordinator.current.event(runId,'closed');return}
     if(nativeEventIsProgress(event)){persistNative();coordinator.current.event(runId,'progress',event.positionSeconds,event.durationSeconds)}
     else if(event.playWhenReady===false&&(state.hasStarted||event.detail==='activity-pause')){persistNative(true);coordinator.current.event(runId,'paused')}
     else if(event.state==='BUFFERING')coordinator.current.event(runId,'buffering')
    }}/>:candidate.session&&<><PlaybackDeadline runId={runId} phase={state.phase} position={state.position} onTimeout={()=>coordinator.current?.event(runId,'failed')}/><VideoPlayer integrated controlsEnabled={!!state.hasStarted||state.phase==='paused'} onSources={()=>coordinator.current?.showSources()} session={candidate.session} simpleFeedback reportAvailability={false} requireVideo media={media} episode={current} startOnReady overlay={floatNext} validateMediaUrl={candidate.validateMediaUrl} initialPositionSeconds={state.position>0?state.position:resumeSeconds} onStateChange={phase=>coordinator.current?.event(runId,phase)} onPlaybackEvent={(event,position)=>{if(event==='failed')coordinator.current?.event(runId,'failed');if(event==='progress')coordinator.current?.event(runId,'progress',position)}} onProgress={progress=>coordinator.current?.position(runId,progress.positionSeconds,progress.durationSeconds)} onEnded={()=>{if(coordinator.current?.state.runId!==runId)return;coordinator.current.event(runId,'ended');onEnded(runId)}}/></>}
   </PlaybackSlot>}
   {embed&&state.fallback&&runId&&<PlaybackSlot key={runId} runId={runId} wait={wait}><IframePlayer session={state.fallback} onDocumentReady={()=>setEmbedReady(true)} onFailure={()=>coordinator.current?.iframeFailed(runId)}/></PlaybackSlot>}
  </PlayerStage>
  <div className="player-source-actions"><button className="button button-secondary" disabled={!state.outcomes.length} onClick={()=>coordinator.current?.showSources()}><RefreshCw size={16}/>Servidores</button><button className="text-link" disabled={!runId} onClick={problem}>Problema com o vídeo?</button>{state.phase==='paused'&&<span role="status">Pausado</span>}</div>
  {series&&current&&<EpisodePicker media={media} provider={catalogProvider} current={current} previous={sequence?.previous} next={next} busy={false} onSelect={go} autoAdvance={autoNext} onAutoAdvanceChange={value=>{setAutoNext(value);try{localStorage.setItem('nocta.autonext',String(value))}catch{}}} supportsProgress={!embed}/>}
  {series&&state.phase==='ended'&&!next&&sequence?.status==='complete'&&<p role="status" className="notice">Você chegou ao último episódio disponível.</p>}
  <PlaybackDetails media={media}/>
 </div>
}
