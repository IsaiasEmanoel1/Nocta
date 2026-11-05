import {useEffect,useState} from 'react'
import type {ReactNode} from 'react'
import type {Media} from '../domain/media'
import type {Candidate,ProviderOutcome} from './providers'
import type {LanguageChoice} from './sourcePolicy'
import {PROVIDER_ORDER} from './coordinator'
export const providerNames:Record<string,string>={fenixflix:'FenixFlix',brazuca:'Brazuca Play',embedmovies:'EmbedMovies',zeus:'Zeus BR'}
export const languageNames:Record<LanguageChoice,string>={dub:'Dublado',sub:'Legendado',unknown:'Idioma não informado'}
const rowLabels:Record<ProviderOutcome['state'],string>={waiting:'Aguardando…',checking:'Buscando…',sources:'Opções encontradas',unverified:'Player alternativo',empty:'Sem opções',filtered:'Sem opção compatível',timeout:'Não respondeu',network:'Não respondeu',http:'Não respondeu',unsupported:'Sem opção compatível',response:'Sem opções',policy:'Não disponível'}
export function ProviderRows({outcomes}:{outcomes:ProviderOutcome[]}){
 return <ol className="provider-progress" aria-label="Busca de servidores">{PROVIDER_ORDER.map((id,index)=>{const row=outcomes.find(row=>row.id===id)??{id,state:'waiting' as const,count:0};const failed=['empty','filtered','timeout','network','http','unsupported','response','policy'].includes(row.state)
 return <li key={id} data-provider={id} data-state={row.state} className={`provider-row ${row.state}`}><span className={`provider-indicator ${failed?'failed':''}`} aria-hidden="true">{failed?'×':row.state==='sources'?'✓':''}</span><span className="provider-row-name">Servidor {index+1}<small>{providerNames[id]}</small></span><span className="provider-row-state">{rowLabels[row.state]}</span></li>})}</ol>
}
export function useSlowLoading(loading:boolean,token:string){const [slow,setSlow]=useState(false);useEffect(()=>{setSlow(false);if(!loading)return;const timer=setTimeout(()=>setSlow(true),5000);return()=>clearTimeout(timer)},[loading,token]);return loading&&slow}
export function PlayerStage({media,loading=false,buffering=false,token='',message='Procurando uma fonte disponível…',outcomes=[],children,cover=false}:{media?:Pick<Media,'backdrop'|'title'>;loading?:boolean;buffering?:boolean;token?:string;message?:string;outcomes?:ProviderOutcome[];children?:ReactNode;cover?:boolean}){
 const slow=useSlowLoading(loading||buffering,token)
 return <section className="nocta-player-stage" aria-label="Área de reprodução" aria-busy={loading||buffering}>
  <div className="player-stage-backdrop" style={media?.backdrop?{backgroundImage:`url(${JSON.stringify(media.backdrop)})`}:undefined}/><div className="player-stage-shade"/>
  <div className="player-stage-content">{children}</div>
  {loading&&<div className="player-loading" role="status"><div className="nocta-loading-logo" aria-label="Nocta"><span className="nocta-loading-ring"/><svg viewBox="0 0 64 64" aria-hidden="true"><path d="M12 52V12h10l20 25V12h10v40H42L22 27v25Z" fill="currentColor"/></svg></div><p className="player-loading-message">{message}</p><ProviderRows outcomes={outcomes}/>{slow&&<p className="player-slow">A conexão está lenta. Aguarde mais alguns segundos...</p>}</div>}
  {buffering&&!loading&&<div className="player-buffering" role="status"><span className="tiny-spinner"/>Carregando…{slow&&<span>A conexão está lenta. Aguarde mais alguns segundos...</span>}</div>}
  {cover&&<div className="player-stage-cover"/>}
 </section>
}
export function SourceChoices({sources,language,failedIds,onSelect,embed,onEmbed}:{sources:Candidate[];language?:LanguageChoice;failedIds:string[];onSelect:(id:string,mode:LanguageChoice)=>void;embed?:boolean;onEmbed:()=>void}){
 const modes:LanguageChoice[]=['dub','sub','unknown']
 return <div className="source-choice-groups">{modes.filter(mode=>sources.some(source=>source.language.modes.includes(mode))).map(mode=><section key={mode}><h3>{languageNames[mode]}<small>{mode==='unknown'?'Sem confirmação de idioma':'Versão informada pelo fornecedor'}</small></h3><div className="source-choice-list">{[...sources].filter(source=>source.language.modes.includes(mode)).sort((a,b)=>PROVIDER_ORDER.indexOf(a.providerId as typeof PROVIDER_ORDER[number])-PROVIDER_ORDER.indexOf(b.providerId as typeof PROVIDER_ORDER[number])||b.score-a.score).map(source=><button key={`${source.id}:${mode}`} className={`source-choice ${failedIds.includes(source.id)?'source-failed':''}`} onClick={()=>onSelect(source.id,mode)}><span className="source-choice-play" aria-hidden="true">▶</span><span><strong>{source.serverName||providerNames[source.providerId]||'Fonte de vídeo'}</strong><small>{[source.quality,providerNames[source.providerId],source.language.dual?'Áudio duplo informado':undefined].filter(Boolean).join(' · ')}</small>{failedIds.includes(source.id)&&<small>Falhou nesta sessão · tocar para tentar novamente</small>}</span><span aria-hidden="true">{language===mode?'•':'›'}</span></button>)}</div></section>)}{embed&&<button className="source-choice" onClick={onEmbed}><span aria-hidden="true">▶</span><span><strong>EmbedMovies</strong><small>Player alternativo · idioma escolhido no próprio player</small></span><span aria-hidden="true">›</span></button>}</div>
}
/** Delays mounting the next engine until the previous native lease has actually closed. */
export function PlaybackSlot({runId,wait,children}:{runId:string;wait:()=>Promise<void>;children:ReactNode}){const [ready,setReady]=useState(false);useEffect(()=>{let live=true;void wait().then(()=>{if(live)setReady(true)});return()=>{live=false}},[runId]);return ready?<>{children}</>:null}
