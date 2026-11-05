import { useNativeExperimentAvailable, nativePlaybackConfirmed, nativePlaybackEngine } from '../experimental/playbackEngine'
import { useEffect, useRef, useState } from 'react'
import { currentNativeEvent, nativeFailureText, nativeInputFingerprint } from '../experimental/nativeAttempt'
import { authorizedDevelopmentAddons, stremioExperimentAvailable } from '../config/stremioServices'
import { AddonError, StremioAddonAdapter } from '../experimental/StremioAddonAdapter'
import type { AddonSource } from '../experimental/StremioAddonAdapter'
import { VideoPlayer } from '../components/VideoPlayer'
import type { PlaybackSession } from '../services/playback'
import { initialSourceResult, recordSourceEvent, sourceStateLabels } from '../experimental/sourceDiagnostics'
import type { SourcePlaybackResult } from '../experimental/sourceDiagnostics'
import { SourcePreflight, sourceBaseline, preflightLabels } from '../experimental/sourcePreflight'
import type { PreflightResult } from '../experimental/sourcePreflight'
import type { Media } from '../domain/media'

export function StremioExperiment() {
  const nativeExperimentEnabled=useNativeExperimentAvailable()
  const experimentAvailable=stremioExperimentAvailable&&(import.meta.env.DEV||nativeExperimentEnabled)
  const [nativeStatus,setNativeStatus]=useState<Record<string,string>>({})
  const nativeActiveRun=useRef<string|undefined>(undefined)
  const nativeRuns=useRef(new Map<string,string>())
  const nativeVerified=useRef(new Set<string>())
  const nativeFailed=useRef(new Set<string>())
  const [nativeIdentity,setNativeIdentity]=useState<Record<string,string>>({})
  useEffect(()=>{
    if(!nativeExperimentEnabled)return
    let disposed=false;let remove:(()=>void)|undefined
    void nativePlaybackEngine.onEvent(event=>{
      const key=event.sessionId?nativeRuns.current.get(event.sessionId):undefined
      if(!key||!currentNativeEvent(event,nativeActiveRun.current))return
      if(event.event==='diagnostic'&&event.detail==='tick')return
      setLog(previous=>[`${new Date().toISOString()} Media3 ${event.sourceId??key} tentativa=${event.sessionId} ${event.event} ${event.detail??''} ${event.state??''} ${event.errorCode??''} video=${!!event.videoRendered} audio=${!!event.audioAdvancing}`,...previous].slice(0,40))
      if(nativePlaybackConfirmed(event))nativeVerified.current.add(key)
      if(event.event==='failed')nativeFailed.current.add(key)
      if(event.event==='diagnostic'||(nativeFailed.current.has(key)&&event.event!=='failed'))return
      setNativeStatus(previous=>({...previous,[key]:event.event==='failed'?nativeFailureText(event):nativeVerified.current.has(key)?'Media3 reportou frame e áudio: confirme imagem e som no aparelho':event.event==='closed'?'Teste encerrado sem reprodução confirmada. Tente novamente ou escolha outra fonte.':`Nativo: ${event.event} — reprodução não verificada`}))
    }).then(cleanup=>{if(disposed)cleanup();else remove=cleanup})
    return()=>{disposed=true;nativeActiveRun.current=undefined;remove?.();void nativePlaybackEngine.close().catch(()=>{})}
  },[nativeExperimentEnabled])
  async function testNative(key:string,input:Parameters<typeof nativePlaybackEngine.load>[0]){
    const runId=crypto.randomUUID();nativeActiveRun.current=runId
    nativeRuns.current.clear();nativeRuns.current.set(runId,key)
    nativeVerified.current.delete(key);nativeFailed.current.delete(key)
    setNativeStatus(previous=>({...previous,[key]:'Preparando Media3; não verificado'}))
    try{
      const fingerprint=await nativeInputFingerprint(input)
      if(nativeActiveRun.current!==runId)return
      setNativeIdentity(previous=>({...previous,[key]:`${fingerprint} · tentativa ${runId}`}))
      await nativePlaybackEngine.load({...input,sessionId:runId,sourceId:key,inputFingerprint:fingerprint})
    }catch{
      if(nativeActiveRun.current===runId){nativeFailed.current.add(key);setNativeStatus(previous=>({...previous,[key]:'Falha de inicialização Media3. Tente novamente ou escolha outra fonte.'}))}
    }
  }
  const [enabled,setEnabled]=useState(false)
  const [profile,setProfile]=useState(authorizedDevelopmentAddons[0]?.id ?? '')
  const [manifestUrl,setManifestUrl]=useState('')
  const [id,setId]=useState('tt1254207'), [type,setType]=useState<'movie'|'series'>('movie')
  const [season,setSeason]=useState(1), [episode,setEpisode]=useState(1)
  const verifier=useRef(new SourcePreflight())
  const [checks,setChecks]=useState<Record<string,PreflightResult>>({})
  const [results,setResults]=useState<Record<string,SourcePlaybackResult>>({})
  const [selectionNonce,setSelectionNonce]=useState(0)
  const [activeSource,setActiveSource]=useState<string>()
  const [sources,setSources]=useState<AddonSource[]>([]), [session,setSession]=useState<PlaybackSession>()
  const [busy,setBusy]=useState(false), [message,setMessage]=useState(''), [log,setLog]=useState<string[]>([])
  const controller=useRef<AbortController | null>(null), adapter=useRef<StremioAddonAdapter | null>(null)
  useEffect(()=>()=>controller.current?.abort(),[])
  function reset() {controller.current?.abort();nativeActiveRun.current=undefined;if(nativeExperimentEnabled)void nativePlaybackEngine.close().catch(()=>{});nativeRuns.current.clear();nativeVerified.current.clear();nativeFailed.current.clear();setNativeIdentity({});setNativeStatus({});setSources([]);setChecks({});setResults({});setActiveSource(undefined);setSession(undefined);setBusy(false);setMessage('')}
  async function verify(source:AddonSource,signal:AbortSignal,force=false,client=adapter.current) {
    if(!client||signal.aborted)return
    setChecks(previous=>({...previous,[source.id]:{...sourceBaseline(source),checking:source.format==='hls'&&!!source.url}}))
    const result=await verifier.current.check(source,client.validateMediaUrl,signal,force)
    if(!signal.aborted)setChecks(previous=>({...previous,[source.id]:result}))
  }
  async function query() {
    reset(); const request=new AbortController();controller.current=request;setBusy(true)
    try {
      const config=authorizedDevelopmentAddons.find(config=>config.id===profile)
      if(!config) throw new Error('Selecione um perfil autorizado.')
      const selected = manifestUrl.trim() || config.manifestUrl
      if(new URL(selected).origin!==new URL(config.manifestUrl).origin) throw new Error('Manifesto deve usar o host do perfil selecionado.')
      const client=new StremioAddonAdapter({...config,manifestUrl:selected});adapter.current=client
      const manifest=await client.loadManifest(request.signal)
      const result=await client.streams({ type,...(id.startsWith('tmdb:')?{tmdb:Number(id.slice(5))}:{imdb:id}),...(type==='series'?{episode:{seasonNumber:season,episodeNumber:episode}}:{}) },request.signal)
      if(!request.signal.aborted){setSources(result);setChecks(Object.fromEntries(result.map(source=>[source.id,sourceBaseline(source)])));result.forEach(source=>void verify(source,request.signal,false,client));setResults(Object.fromEntries(result.map(source=>[source.id,initialSourceResult(source)])));setMessage(`${manifest.name}: ${result.length} fontes. Idiomas declarados não confirmam o áudio.`)}
    } catch(error) {if(!request.signal.aborted){const text=error instanceof AddonError?`${error.code}: ${error.message}`:'Falha na configuração ou consulta.';setMessage(text);setLog(previous=>[`${new Date().toISOString()} ${text}`,...previous].slice(0,20))}}
    finally {if(!request.signal.aborted)setBusy(false)}
  }
  const media:Media={id:'experimental-stremio',kind:type==='series'?'tv':'movie',title:'Amostra experimental autorizada',overview:'',year:2026,rating:0,genres:[],genreIds:[],poster:'/art/poster-1.svg',backdrop:'/art/scene-0.svg',cast:[],source:'fiction'}
  const category=(source:AddonSource)=>results[source.id]?.state==='tested'?'verified':results[source.id]?.state==='failed'?'temporary':(checks[source.id]??sourceBaseline(source)).state
  const normalSource=(source:AddonSource)=>['verified','compatible'].includes(category(source))
  const renderSource=(source:AddonSource)=><li key={source.id} data-source-id={source.id}><strong>{source.name}</strong><p>{source.description}</p><p>Serviço: {source.providerId} · Origem declarada: {source.origin || 'não informada'} · Qualidade declarada: {source.quality || 'não informada'}</p><p>{source.reportedFormat ?? source.format} · Idiomas declarados: {source.declaredLanguages.join(', ')||'não informados'} · Idiomas confirmados: nenhum</p><p>Compatibilidade web: {source.url?'formato candidato HTML5':source.reportedFormat==='other'?'não determinada / rota opaca':'não liberada nesta configuração'} · Nativa: {nativeStatus[source.id]??'não testada'}</p><p>Diagnóstico: {source.id}{nativeIdentity[source.id]?` · ${nativeIdentity[source.id]}`:''}</p><p>{preflightLabels[category(source)]}{checks[source.id]?.checking?' · Verificando…':''}</p><p>{(checks[source.id]?.detail??sourceBaseline(source).detail).replace('codec e compatibilidade nativa não verificados.','o resultado nativo é informado separadamente.')}</p><p>Playlist: {checks[source.id]?.playlist??'not-checked'} · Segmentos web: não verificados · Reprodução web: {results[source.id]?.state==='tested'?'confirmada nesta sessão':'não confirmada'}</p><p>notWebReady: {String(source.notWebReady ?? 'não informado')} · {sourceStateLabels[(results[source.id] ?? initialSourceResult(source)).state]}</p><p>{(results[source.id]?.detail || source.reason)?.replace('codec e compatibilidade nativa não verificados.','o resultado nativo é informado separadamente.')}</p><button className="button button-secondary" disabled={!source.url || !!checks[source.id]?.checking || ['temporary','incompatible','unknown'].includes((checks[source.id]??sourceBaseline(source)).state)} onClick={()=>{try{setActiveSource(source.id);setSelectionNonce(value=>value+1);setResults(previous=>({...previous,[source.id]:initialSourceResult(source)}));setSession(adapter.current!.session(source,media.id,media.title))}catch{setMessage('Fonte não autorizada ou expirada.')}}}>Reproduzir {source.format}</button>{source.nativeCandidate&&<p>{nativeStatus[source.id]?.includes('Media3 reportou frame')?'Eventos dos renderizadores detectados; imagem visível não confirmada automaticamente.':source.nativeReason}{nativeExperimentEnabled&&<button className="button button-secondary" onClick={()=>void testNative(source.id,source.nativeCandidate!)}>{nativeFailed.current.has(source.id)?'Tentar novamente no Media3':'Testar no Media3'}</button>}</p>}{source.url&&source.format==='hls'&&<button className="text-link" disabled={checks[source.id]?.checking} onClick={()=>{if(controller.current)void verify(source,controller.current.signal,true)}}>Verificar novamente</button>}</li>
  return <div className="page-shell stremio-experiment"><h1>Configurações experimentais</h1>
    {!experimentAvailable?<p>Experimento Stremio desativado. Disponível somente em desenvolvimento com VITE_ENABLE_STREMIO_EXPERIMENT=true.</p>:<>
      <label className="watch-autonext"><input type="checkbox" checked={enabled} onChange={event=>{reset();setEnabled(event.target.checked)}} />Habilitar experimento Stremio nesta sessão</label>
      {enabled&&<div className="watch-details-content"><p>Selecione um perfil autorizado. O catálogo público e o EmbedMovies continuam independentes. Para comparar, abra o player habitual pelo catálogo.</p>
        <label>Serviço<select aria-label="Serviço" value={profile} onChange={event=>{reset();setManifestUrl('');setProfile(event.target.value)}}>{authorizedDevelopmentAddons.map(config=><option key={config.id} value={config.id}>{config.id}</option>)}</select></label>
        {profile==='fenixflix-diagnostics' && <label>Manifesto configurado na página FenixFlix<input aria-label="Manifesto configurado" placeholder={authorizedDevelopmentAddons.find(config=>config.id===profile)?.manifestUrl} value={manifestUrl} onChange={event=>{reset();setManifestUrl(event.target.value)}} /></label>}
        <label>Tipo<select aria-label="Tipo experimental" value={type} onChange={event=>{reset();setType(event.target.value as 'movie'|'series')}}><option value="movie">Filme</option><option value="series">Série</option></select></label>
        <label>Identificador IMDb ou TMDB<input aria-label="Identificador experimental" value={id} onChange={event=>{reset();setId(event.target.value)}} /></label>
        {type==='series'&&<><label>Temporada<input aria-label="Temporada experimental" type="number" min="1" value={season} onChange={event=>{reset();setSeason(Number(event.target.value))}} /></label><label>Episódio<input aria-label="Episódio experimental" type="number" min="1" value={episode} onChange={event=>{reset();setEpisode(Number(event.target.value))}} /></label></>}
        <button className="button button-primary" disabled={busy} onClick={()=>void query()}>{busy?'Consultando…':'Consultar fontes'}</button>
        {nativeExperimentEnabled&&<div><button className="button button-secondary" onClick={()=>void testNative('fixture',{url:'asset:///native-fixtures/sample.mp4',mimeType:'video/mp4'})}>Testar MP4 controlado no Media3</button><button className="button button-secondary" onClick={()=>void testNative('fixture',{url:'asset:///native-fixtures/master.m3u8',mimeType:'application/vnd.apple.mpegurl'})}>Testar HLS controlado no Media3</button><p>{nativeStatus.fixture}</p></div>}
        <p role="status">{message}</p>
        <ul>{sources.filter(source=>normalSource(source)).sort((a,b)=>Number(results[b.id]?.state==='tested')-Number(results[a.id]?.state==='tested')).map(renderSource)}</ul>
        {sources.some(source=>!normalSource(source))&&<details><summary>Outras fontes</summary><ul>{sources.filter(source=>!normalSource(source)).map(renderSource)}</ul></details>}
        {session&&<VideoPlayer key={`${selectionNonce}:${activeSource}:${session.sources[0].src}`} media={media} session={session} persistHistory={false} onPlaybackEvent={(event,seconds,detail)=>{if(activeSource)setResults(previous=>({...previous,[activeSource]:recordSourceEvent(previous[activeSource]??{state:'untested'},event,seconds,detail)}))}} validateMediaUrl={adapter.current?.validateMediaUrl} />}
        <details><summary>Registro de erros (sem URLs)</summary>{log.map((entry,index)=><p key={index}>{entry}</p>)}</details>
      </div>}
    </>}
  </div>
}
