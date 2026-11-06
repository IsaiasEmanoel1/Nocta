import {useEffect,useState} from 'react'
import type {ReactNode} from 'react'
import type {Media} from '../domain/media'
import type {Candidate} from './providers'
import type {LanguageChoice} from './sourcePolicy'
import {ALL_PROVIDER_ORDER} from './coordinator'
export const languageNames:Record<LanguageChoice,string>={dub:'Dublado',sub:'Legendado',unknown:'Idioma não informado'}
export function useSlowLoading(loading:boolean,token:string){const [slow,setSlow]=useState(false);useEffect(()=>{setSlow(false);if(!loading)return;const timer=setTimeout(()=>setSlow(true),5000);return()=>clearTimeout(timer)},[loading,token]);return loading&&slow}
export function PlayerStage({media,loading=false,buffering=false,token='',message='Procurando um vídeo…',progress,children,cover=false,selectionOpen=false,mediaVisible=false}:{media?:Pick<Media,'backdrop'|'title'>&{poster?:string};loading?:boolean;buffering?:boolean;token?:string;message?:string;progress?:string;children?:ReactNode;cover?:boolean;selectionOpen?:boolean;mediaVisible?:boolean}){
 const slow=useSlowLoading(loading||buffering,token)
 const backdrop=media?.backdrop&&!/^\/art\/scene/.test(media.backdrop)?media.backdrop:media?.poster
 return <section className={`nocta-player-stage ${selectionOpen?'selection-open':''} ${mediaVisible?'media-visible':''}`} aria-label="Área de reprodução" aria-busy={loading||buffering}>
  {!mediaVisible&&<><div className="player-stage-backdrop" style={backdrop?{backgroundImage:`url(${JSON.stringify(backdrop)})`}:undefined}/><div className="player-stage-shade"/></>}
  <div className="player-stage-content">{children}</div>
  {loading&&<div className="player-loading primary-loading" role="status"><div className="nocta-loading-logo" aria-label="Nocta"><span className="nocta-loading-ring"/><svg viewBox="0 0 64 64" aria-hidden="true"><path d="M12 52V12h10l20 25V12h10v40H42L22 27v25Z" fill="currentColor"/></svg></div><p className="player-loading-message">{message}</p><div className="player-slow-slot">{progress?<p className="player-slow">{progress}</p>:slow&&<p className="player-slow">A conexão está lenta. Aguarde mais alguns segundos...</p>}</div></div>}
  {buffering&&!loading&&<div className="player-buffering" role="status"><span className="tiny-spinner"/>Carregando…{slow&&<span>A conexão está lenta. Aguarde mais alguns segundos...</span>}</div>}
  {cover&&<div className="player-stage-cover"/>}
 </section>
}
export function SourceChoices({sources,language,mode,compact=false,failedIds,onSelect,embed,embedLabel,onEmbed}:{sources:Candidate[];language?:LanguageChoice;mode?:LanguageChoice;compact?:boolean;failedIds:string[];onSelect:(id:string,mode:LanguageChoice)=>void;embed?:boolean;embedLabel?:string;onEmbed:()=>void}){
 const modes:LanguageChoice[]=mode?[mode]:['dub','sub','unknown']
 return <div className="source-choice-groups">{modes.filter(mode=>sources.some(source=>source.language.modes.includes(mode))).map(mode=><section key={mode}>{!compact&&<h3>{languageNames[mode]}<small>{mode==='unknown'?'Sem confirmação de idioma':'Versão informada pelo fornecedor'}</small></h3>}<div className="source-choice-list">{[...sources].filter(source=>source.language.modes.includes(mode)).sort((a,b)=>ALL_PROVIDER_ORDER.indexOf(a.providerId as typeof ALL_PROVIDER_ORDER[number])-ALL_PROVIDER_ORDER.indexOf(b.providerId as typeof ALL_PROVIDER_ORDER[number])||b.score-a.score).map(source=><button key={`${source.id}:${mode}`} className={`source-choice ${failedIds.includes(source.id)?'source-failed':''}`} onClick={()=>onSelect(source.id,mode)}><span className="source-choice-play" aria-hidden="true">▶</span><span><strong>{source.displayName??'Servidor'}</strong><small>{[source.quality,source.language.dual?'Dual áudio informado':languageNames[mode]].filter(Boolean).join(' · ')}</small>{failedIds.includes(source.id)&&<small>Tentar novamente</small>}</span><span aria-hidden="true">{language===mode?'•':'›'}</span></button>)}</div></section>)}{embed&&<button className="source-choice" onClick={onEmbed}><span aria-hidden="true">▶</span><span><strong>{embedLabel??'Servidor'}</strong><small>Disponibilidade não confirmada · versão no próprio player</small></span><span aria-hidden="true">›</span></button>}</div>
}
/** Delays mounting the next engine until the previous native lease has actually closed. */
export function PlaybackSlot({runId,wait,children}:{runId:string;wait:()=>Promise<void>;children:ReactNode}){const [ready,setReady]=useState(false);useEffect(()=>{let live=true;void wait().then(()=>{if(live)setReady(true)});return()=>{live=false}},[runId]);return ready?<>{children}</>:null}
